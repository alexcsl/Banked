"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import { allocateRuleProceeds, formatAtomic, parseDecimalToAtomic } from "@/domain/allocation";
import { getPurchaseAsset, type PurchaseDestinationId } from "@/domain/assets";
import { calculateExcessSol, createExitRule, createRuleOperation, exitRuleTemplates, reconcileRuleSale, summarizeMoneyFlow, summarizeRuleOperations, updatePurchase, type ExitRule, type MoneyFlowSummary, type RuleOperation } from "@/domain/rules";
import { deleteRule, loadRuleOperations, loadRules, saveRule, saveRuleOperation } from "@/storage/operations";
import { useWorkspaceMotion } from "@/components/use-workspace-motion";

type Quote = { destinationId: PurchaseDestinationId; expectedOutput: string; minimumOutput: string; feeBps: number; route: string };
type PreparedOrder = Quote & { requestId: string; transaction: string; stage: "sale" | "purchase"; destinationId?: PurchaseDestinationId | null };
type ExecutionResult = { status: "Success" | "Failed"; signature?: string; error?: string | null };
type Reconciliation = { status: string; usdcDelta?: string; destinationDelta?: string };
type DetectedExit = { signature: string; slot: number; blockTime: number | null; solDebited: string; usdcReceived: string };

const fixtureUsdcPerSol = 125_030_864n;
const lamportsPerSol = 1_000_000_000n;

export function CuratedRuleFlow() {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [solToKeep, setSolToKeep] = useState("10");
  const [simulatedWalletSol, setSimulatedWalletSol] = useState("11");
  const [walletBalanceLamports, setWalletBalanceLamports] = useState<string | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [ruleName, setRuleName] = useState("De-risk SOL rally");
  const [spyxBps, setSpyxBps] = useState(20);
  const [jupBps, setJupBps] = useState(20);
  const [mode, setMode] = useState<"fixture" | "live">("fixture");
  const [wallet, setWallet] = useState<string | null>(null);
  const [message, setMessage] = useState("Set the SOL balance you want to keep trading with. Save the rule, then activate it when ready.");
  const [rules, setRules] = useState<ExitRule[]>([]);
  const [history, setHistory] = useState<RuleOperation[]>([]);
  const [operation, setOperation] = useState<RuleOperation | null>(null);
  const [preparedSale, setPreparedSale] = useState<PreparedOrder | null>(null);
  const [preparedSaleAmount, setPreparedSaleAmount] = useState<bigint | null>(null);
  const [preparedPurchases, setPreparedPurchases] = useState<Partial<Record<PurchaseDestinationId, PreparedOrder>>>({});
  const [quotes, setQuotes] = useState<Partial<Record<PurchaseDestinationId, Quote>>>({});
  const [detectedExits, setDetectedExits] = useState<DetectedExit[]>([]);
  const [scanningExits, setScanningExits] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRules(loadRules());
      setHistory(loadRuleOperations());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const simulatedExcess = (() => {
    try {
      return calculateExcessSol(parseDecimalToAtomic(simulatedWalletSol, 9), parseDecimalToAtomic(solToKeep, 9));
    } catch {
      return 0n;
    }
  })();
  const fixtureProceeds = (simulatedExcess * fixtureUsdcPerSol) / lamportsPerSol;
  const selectedRule = rules.find((rule) => rule.id === selectedRuleId);
  const liveExcess = (() => {
    if (!walletBalanceLamports) return 0n;
    try { return calculateExcessSol(BigInt(walletBalanceLamports), parseDecimalToAtomic(solToKeep, 9)); }
    catch { return 0n; }
  })();
  const formAllocation = useMemo(() => allocateRuleProceeds(mode === "fixture" ? fixtureProceeds : (liveExcess * fixtureUsdcPerSol) / lamportsPerSol, { spyxBps, jupBps }), [fixtureProceeds, liveExcess, mode, spyxBps, jupBps]);
  const activeAllocation = useMemo(() => operation?.actualProceeds ? allocateRuleProceeds(BigInt(operation.actualProceeds), { spyxBps: operation.rule.spyxBps, jupBps: operation.rule.jupBps }) : formAllocation, [formAllocation, operation]);
  const visibleHistory = useMemo(() => history.filter((item) => mode === "fixture" ? item.wallet === "fixture" : Boolean(wallet) && item.wallet === wallet), [history, mode, wallet]);
  const discipline = useMemo(() => summarizeRuleOperations(history), [history]);
  const moneyFlow = useMemo(() => summarizeMoneyFlow(visibleHistory), [visibleHistory]);
  const totalsKey = `${moneyFlow.proceeds}:${moneyFlow.routedSpyx}:${moneyFlow.routedJup}:${moneyFlow.awaitingAction}:${moneyFlow.plannedRetained}`;
  useWorkspaceMotion(workspaceRef, totalsKey, operation ? `${operation.id}:${operation.saleStatus}` : "");

  function persistOperation(next: RuleOperation) {
    saveRuleOperation(next);
    setOperation(next);
    setHistory(loadRuleOperations());
  }

  function buildRule(existing?: ExitRule): ExitRule | null {
    try {
      const next = createExitRule(ruleName, { spyxBps, jupBps }, undefined, solToKeep);
      if (!existing) return next;
      return { ...next, id: existing.id, createdAt: existing.createdAt, status: "paused" };
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The rule is invalid.");
      return null;
    }
  }

  function changePercentage(destinationId: PurchaseDestinationId, value: number) {
    const nextSpyx = destinationId === "spyx" ? value : spyxBps;
    const nextJup = destinationId === "jup" ? value : jupBps;
    if (nextSpyx + nextJup > 100) {
      setMessage("SPYx and JUP allocations cannot exceed 100% of proceeds.");
      return;
    }
    if (destinationId === "spyx") setSpyxBps(value);
    else setJupBps(value);
  }

  function saveCurrentRule() {
    const existing = rules.find((rule) => rule.id === selectedRuleId);
    if (existing?.status === "active") {
      setMessage("Pause this rule before editing it.");
      return;
    }
    const rule = buildRule(existing);
    if (!rule) return;
    saveRule(rule);
    setRules(loadRules());
    setSelectedRuleId(rule.id);
    setPreparedSale(null);
    setPreparedSaleAmount(null);
    setMessage(`Saved ${rule.name} as paused. Incoming SOL stays under your control.`);
  }

  function toggleRule(rule: ExitRule) {
    const next = { ...rule, status: rule.status === "active" ? "paused" as const : "active" as const, updatedAt: new Date().toISOString() };
    if (next.status === "active" && !next.solToKeepLamports) {
      setMessage("Set and save a SOL balance to keep before activating this rule.");
      return;
    }
    saveRule(next);
    setRules(loadRules());
    setPreparedSale(null);
    setPreparedSaleAmount(null);
    setMessage(next.status === "paused" ? `${next.name} paused. Incoming SOL stays under your control.` : `${next.name} active. Review and sign each excess sale yourself.`);
  }

  function selectRule(rule: ExitRule) {
    setPreparedSale(null);
    setPreparedSaleAmount(null);
    setRuleName(rule.name);
    setSolToKeep(rule.solToKeepLamports === null ? "" : formatAtomic(BigInt(rule.solToKeepLamports), 9));
    setSpyxBps(rule.spyxBps);
    setJupBps(rule.jupBps);
    setSelectedRuleId(rule.id);
    setMessage(`Loaded ${rule.name}.`);
  }

  function applyTemplate(template: (typeof exitRuleTemplates)[number]) {
    setSelectedRuleId(null);
    setPreparedSale(null);
    setPreparedSaleAmount(null);
    setRuleName(template.name);
    setSpyxBps(template.spyxBps);
    setJupBps(template.jupBps);
    setMessage(`${template.name} loaded. Adjust it before saving or preparing a sale.`);
  }

  function duplicateRule(rule: ExitRule) {
    const copy = createExitRule(`${rule.name} copy`, { spyxBps: rule.spyxBps, jupBps: rule.jupBps }, undefined, rule.solToKeepLamports === null ? undefined : formatAtomic(BigInt(rule.solToKeepLamports), 9));
    saveRule(copy);
    setRules(loadRules());
    setMessage(`Saved ${copy.name}.`);
  }

  async function connectWallet() {
    const provider = window.phantom?.solana;
    if (!provider?.isPhantom) {
      setMessage("Phantom is required for live execution. Fixture mode remains available.");
      return;
    }
    const result = await provider.connect();
    setWallet(result.publicKey.toBase58());
    setWalletBalanceLamports(null);
    setMessage("Wallet connected. Refresh its SOL balance before reviewing an excess sale.");
  }

  async function refreshWalletBalance(address = wallet): Promise<bigint | null> {
    if (!address) { setMessage("Connect a wallet to read its SOL balance."); return null; }
    try {
      const response = await fetch(`/api/wallet/balance?wallet=${encodeURIComponent(address)}`, { cache: "no-store" });
      const result = await response.json() as { balanceLamports?: string; error?: string };
      if (!response.ok || !result.balanceLamports) throw new Error(result.error ?? "Wallet balance unavailable.");
      setWalletBalanceLamports(result.balanceLamports);
      return BigInt(result.balanceLamports);
    } catch (error) {
      setWalletBalanceLamports(null);
      setMessage(error instanceof Error ? error.message : "Wallet balance unavailable.");
      return null;
    }
  }

  async function loadQuote(destinationId: PurchaseDestinationId) {
    const target = activeAllocation[destinationId];
    if (!target.eligible) {
      setMessage(`${getPurchaseAsset(destinationId).symbol} needs at least 10 USDC in this rule.`);
      return;
    }
    const response = await fetch("/api/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ destinationId, amount: target.budget.toString() }) });
    const result = await response.json() as Quote & { error?: string };
    if (!response.ok) {
      setMessage(result.error ?? "The quote could not be loaded.");
      return;
    }
    setQuotes((current) => ({ ...current, [destinationId]: result }));
    setMessage(`Indicative ${getPurchaseAsset(destinationId).symbol} quote loaded.`);
  }

  async function scanRecentExits() {
    if (!wallet) {
      setMessage("Connect a wallet before scanning its finalized exit candidates.");
      return;
    }
    setScanningExits(true);
    setMessage("Scanning recent finalized SOL-to-USDC exit candidates.");
    try {
      const response = await fetch("/api/exits/recent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet }) });
      const result = await response.json() as { exits?: DetectedExit[]; error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Recent exit detection is unavailable.");
        return;
      }
      setDetectedExits(result.exits ?? []);
      setMessage(result.exits?.length ? "Review a finalized candidate before applying this rule." : "No finalized SOL-to-USDC exit candidates were found in the recent scan.");
    } catch {
      setMessage("Recent exit detection is unavailable.");
    } finally {
      setScanningExits(false);
    }
  }

  function importDetectedExit(exit: DetectedExit) {
    if (!wallet) return;
    if (history.some((item) => item.saleSignature === exit.signature)) {
      setMessage("This exit is already in Banked history.");
      return;
    }
    const rule = executableRule();
    if (!rule) return;
    const imported = reconcileRuleSale(createRuleOperation(rule, wallet), BigInt(exit.usdcReceived));
    persistOperation({ ...imported, saleSignature: exit.signature, saleSource: "detected" });
    setDetectedExits((exits) => exits.filter((candidate) => candidate.signature !== exit.signature));
    setMessage("External exit imported from finalized on-chain balances. Complete any eligible destination when ready.");
  }

  function recordFixtureSale() {
    const rule = executableRule();
    if (!rule) return;
    if (simulatedExcess === 0n) {
      setMessage("No SOL is above your trade balance. Nothing to sell or route.");
      return;
    }
    persistOperation(reconcileRuleSale(createRuleOperation(rule, "fixture"), fixtureProceeds));
    setMessage(`${formatAtomic(simulatedExcess, 9, 4)} SOL above your trade balance was simulated as sold. Your trade balance stays untouched.`);
  }

  function executableRule(): ExitRule | null {
    if (!selectedRule || selectedRule.status !== "active") {
      setMessage("Save and activate a rule before applying it. Paused rules leave incoming SOL untouched.");
      return null;
    }
    if (selectedRule.name !== ruleName || selectedRule.spyxBps !== spyxBps || selectedRule.jupBps !== jupBps || selectedRule.solToKeepLamports !== parseSolToKeep()) {
      setMessage("Save your changes before applying this rule.");
      return null;
    }
    return selectedRule;
  }

  function parseSolToKeep(): string | null {
    try { return parseDecimalToAtomic(solToKeep, 9).toString(); }
    catch { return null; }
  }

  async function prepareLiveSale() {
    if (!wallet) {
      setMessage("Connect Phantom before preparing a live sale.");
      return;
    }
    const rule = executableRule();
    if (!rule) return;
    const balance = await refreshWalletBalance();
    if (balance === null) return;
    const amount = calculateExcessSol(balance, BigInt(rule.solToKeepLamports!));
    if (amount === 0n) {
      setMessage("No SOL is above your trade balance. Nothing to sell.");
      return;
    }
    const response = await fetch("/api/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage: "sale", taker: wallet, amount: amount.toString(), solToKeepLamports: rule.solToKeepLamports }) });
    const result = await response.json() as PreparedOrder & { error?: string };
    if (!response.ok) {
      setMessage(result.error ?? "A live sale could not be prepared.");
      return;
    }
    persistOperation(createRuleOperation(rule, wallet));
    setPreparedSale(result);
    setPreparedSaleAmount(amount);
    setMessage("Live sale prepared. Review the transaction in Phantom before signing.");
  }

  async function signAndSubmitSale() {
    const provider = window.phantom?.solana;
    if (!provider || !preparedSale || !operation || !wallet) return;
    const rule = executableRule();
    if (!rule || preparedSaleAmount === null) return;
    const balance = await refreshWalletBalance();
    if (balance === null) return;
    if (calculateExcessSol(balance, BigInt(rule.solToKeepLamports!)) < preparedSaleAmount) {
      setPreparedSale(null);
      setPreparedSaleAmount(null);
      setMessage("Wallet SOL changed. Prepare a new sale from the current excess.");
      return;
    }
    try {
      const transaction = VersionedTransaction.deserialize(base64ToBytes(preparedSale.transaction));
      const signed = await provider.signTransaction(transaction);
      const submitted = { ...operation, saleStatus: "submitted" as const, updatedAt: new Date().toISOString() };
      persistOperation(submitted);
      const response = await fetch("/api/execute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage: "sale", taker: wallet, requestId: preparedSale.requestId, signedTransaction: bytesToBase64(signed.serialize()) }) });
      const result = await response.json() as ExecutionResult & { error?: string };
      if (!response.ok || result.status !== "Success" || !result.signature) {
        persistOperation({ ...submitted, saleStatus: "reconciliation-required", saleSignature: result.signature });
        setMessage(result.error ?? "Sale submission needs chain reconciliation before retrying.");
        return;
      }
      const reconciliation = await reconcile("sale", result.signature);
      if (reconciliation?.status === "finalized" && reconciliation.usdcDelta) {
        persistOperation({ ...reconcileRuleSale({ ...submitted, saleSignature: result.signature }, BigInt(reconciliation.usdcDelta)), saleSignature: result.signature });
        setMessage("Sale finalized from actual USDC proceeds. Prepare either destination when ready.");
      } else {
        persistOperation({ ...submitted, saleStatus: "reconciliation-required", saleSignature: result.signature });
        setMessage("Sale submitted. Reconcile it before preparing destination purchases.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet signing was not completed.");
    }
  }

  async function preparePurchase(destinationId: PurchaseDestinationId) {
    if (!operation?.actualProceeds || operation.saleStatus !== "finalized" || !wallet || wallet !== operation.wallet) {
      setMessage("Finalize the sale and connect the wallet that owns this operation before preparing a purchase.");
      return;
    }
    const purchase = operation.purchases[destinationId];
    if (purchase.status !== "ready") return;
    const response = await fetch("/api/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage: "purchase", destinationId, taker: wallet, amount: purchase.budget }) });
    const result = await response.json() as PreparedOrder & { error?: string };
    if (!response.ok) {
      setMessage(result.error ?? `The ${getPurchaseAsset(destinationId).symbol} purchase could not be prepared.`);
      return;
    }
    persistOperation(updatePurchase(operation, destinationId, { status: "prepared", expectedOutput: result.expectedOutput }));
    setPreparedPurchases((current) => ({ ...current, [destinationId]: result }));
    setMessage(`${getPurchaseAsset(destinationId).symbol} purchase prepared from finalized proceeds.`);
  }

  async function signAndSubmitPurchase(destinationId: PurchaseDestinationId) {
    const provider = window.phantom?.solana;
    const prepared = preparedPurchases[destinationId];
    if (!provider || !prepared || !operation || !wallet) return;
    try {
      const transaction = VersionedTransaction.deserialize(base64ToBytes(prepared.transaction));
      const signed = await provider.signTransaction(transaction);
      const submitted = updatePurchase(operation, destinationId, { status: "submitted" });
      persistOperation(submitted);
      const response = await fetch("/api/execute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage: "purchase", destinationId, taker: wallet, requestId: prepared.requestId, signedTransaction: bytesToBase64(signed.serialize()) }) });
      const result = await response.json() as ExecutionResult & { error?: string };
      if (!response.ok || result.status !== "Success" || !result.signature) {
        persistOperation(updatePurchase(submitted, destinationId, { status: "pending", signature: result.signature }));
        setMessage(result.error ?? `${getPurchaseAsset(destinationId).symbol} needs reconciliation before retrying.`);
        return;
      }
      const reconciliation = await reconcile("purchase", result.signature, destinationId);
      if (reconciliation?.status === "finalized") {
        const usdcSpent = -BigInt(reconciliation.usdcDelta ?? "0");
        persistOperation(updatePurchase(submitted, destinationId, { status: "finalized", signature: result.signature, actualOutput: reconciliation.destinationDelta, usdcSpent: usdcSpent.toString() }));
        setMessage(usdcSpent > BigInt(submitted.purchases[destinationId].budget) ? `${getPurchaseAsset(destinationId).symbol} finalized, but its USDC debit exceeded the saved budget. Review the receipt.` : `${getPurchaseAsset(destinationId).symbol} purchase finalized.`);
      } else {
        persistOperation(updatePurchase(submitted, destinationId, { status: "pending", signature: result.signature }));
        setMessage(`${getPurchaseAsset(destinationId).symbol} purchase submitted and awaiting reconciliation.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet signing was not completed.");
    }
  }

  async function reconcilePendingPurchase(destinationId: PurchaseDestinationId) {
    const purchase = operation?.purchases[destinationId];
    if (!operation || !purchase?.signature || purchase.status !== "pending") return;
    const reconciliation = await reconcile("purchase", purchase.signature, destinationId);
    if (reconciliation?.status === "finalized") {
      const usdcSpent = -BigInt(reconciliation.usdcDelta ?? "0");
      persistOperation(updatePurchase(operation, destinationId, { status: "finalized", actualOutput: reconciliation.destinationDelta, usdcSpent: usdcSpent.toString() }));
      setMessage(usdcSpent > BigInt(purchase.budget) ? `${getPurchaseAsset(destinationId).symbol} finalized, but its USDC debit exceeded the saved budget. Review the receipt.` : `${getPurchaseAsset(destinationId).symbol} purchase finalized from on-chain balances.`);
      return;
    }
    if (reconciliation?.status === "failed") {
      persistOperation(updatePurchase(operation, destinationId, { status: "ready", signature: undefined }));
      setMessage(`${getPurchaseAsset(destinationId).symbol} did not settle. A new purchase can now be prepared.`);
      return;
    }
    setMessage(`${getPurchaseAsset(destinationId).symbol} is still awaiting final chain reconciliation.`);
  }

  function recordFixturePurchase(destinationId: PurchaseDestinationId) {
    if (!operation || operation.wallet !== "fixture") return;
    persistOperation(updatePurchase(operation, destinationId, { status: "finalized", actualOutput: "fixture", usdcSpent: operation.purchases[destinationId].budget }));
    setMessage(`${getPurchaseAsset(destinationId).symbol} fixture purchase recorded.`);
  }

  async function reconcile(stage: "sale" | "purchase", signature: string, destinationId?: PurchaseDestinationId): Promise<Reconciliation | null> {
    const response = await fetch("/api/reconcile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage, destinationId, wallet: operation?.wallet ?? wallet, signature }) });
    return response.ok ? response.json() as Promise<Reconciliation> : null;
  }

  async function copyReceipt() {
    if (!operation) return;
    await navigator.clipboard.writeText(receiptText(operation));
    setMessage("Receipt copied to your clipboard.");
  }

  function downloadReceipt() {
    if (!operation) return;
    const blob = new Blob([JSON.stringify(operation, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `banked-${operation.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="workspace" ref={workspaceRef}>
    <div className="scroll-progress" aria-hidden="true" />
    <header className="workspace-header"><a className="wordmark" href="#top">Banked</a><nav className="workspace-nav" aria-label="Page sections"><a href="#dashboard">Dashboard</a><a href="#rule">Exit rule</a><a href="#history">History</a></nav><div className="workspace-meta"><span>{mode === "fixture" ? "Simulation mode" : "Mainnet execution"}</span>{process.env.NEXT_PUBLIC_BANKED_MODE === "live" && <button className="link-button" onClick={() => setMode(mode === "fixture" ? "live" : "fixture")}>Use {mode === "fixture" ? "live mode" : "simulation"}</button>}<button className="wallet-button" onClick={connectWallet}>{wallet ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : "Connect wallet"}</button></div></header>
    <main>
      <section className="workspace-intro" id="top"><p className="section-kicker">EXIT DISCIPLINE</p><h1>Keep your trading capital. Route the excess.</h1><p>Choose how much SOL to keep in your wallet. Only the balance above that number is eligible for the exit plan. New rules stay paused until you activate them.</p></section>
      <MoneyDashboard summary={moneyFlow} mode={mode} />
      <section className="workspace-grid" id="rule">
        <section className="rule-workbench" aria-labelledby="rule-heading"><div className="section-heading"><p className="section-kicker">01 · DEFINE</p><h2 id="rule-heading">Exit rule</h2><button className="link-button" onClick={saveCurrentRule} disabled={selectedRule?.status === "active"}>Save rule</button></div><p className="rule-state">{selectedRule ? `Rule ${selectedRule.status}` : "Unsaved rule"}. {selectedRule?.status === "active" ? "Pause before editing. Each live sale still needs your wallet approval." : "Paused rules cannot prepare a sale."}</p><div className="form-stack"><label className="workspace-field" htmlFor="rule-name"><span>Rule name</span><input id="rule-name" value={ruleName} maxLength={60} disabled={selectedRule?.status === "active"} onChange={(event) => setRuleName(event.target.value)} /></label><label className="workspace-field" htmlFor="sol-to-keep"><span>SOL to keep</span><div className="amount-input"><input id="sol-to-keep" inputMode="decimal" value={solToKeep} disabled={selectedRule?.status === "active"} onChange={(event) => setSolToKeep(event.target.value)} /><strong>SOL</strong></div><small>Banked proposes selling only the SOL above this amount.</small></label>{mode === "fixture" ? <label className="workspace-field" htmlFor="simulated-wallet-sol"><span>Wallet SOL balance (simulation)</span><div className="amount-input"><input id="simulated-wallet-sol" inputMode="decimal" value={simulatedWalletSol} onChange={(event) => setSimulatedWalletSol(event.target.value)} /><strong>SOL</strong></div><small>With 10 SOL to keep: 9 in wallet sells 0; 11 sells 1.</small></label> : <div className="workspace-field"><span>Current wallet SOL</span><strong>{walletBalanceLamports === null ? "Refresh to check" : `${formatAtomic(BigInt(walletBalanceLamports), 9, 6)} SOL`}</strong><button className="secondary-action" onClick={() => refreshWalletBalance()}>Refresh balance</button><small>Banked checks when you refresh or prepare a sale. It does not sell automatically.</small></div>}<AllocationControl id="spyx" value={spyxBps} onChange={changePercentage} disabled={selectedRule?.status === "active"} /><AllocationControl id="jup" value={jupBps} onChange={changePercentage} disabled={selectedRule?.status === "active"} /></div><div className="template-list" aria-label="Rule templates"><p className="section-kicker">START WITH A TEMPLATE</p>{exitRuleTemplates.map((template) => <button className="template-row" key={template.id} onClick={() => applyTemplate(template)}><span><strong>{template.name}</strong><small>{template.description}</small></span><span>{template.spyxBps}% SPYx / {template.jupBps}% JUP</span></button>)}</div><section className="detected-exits" aria-labelledby="detected-exits-heading"><div className="section-heading"><div><p className="section-kicker">EXTERNAL EXIT DETECTION</p><h3 id="detected-exits-heading">Apply this rule to a completed exit</h3></div><button className="secondary-action" onClick={scanRecentExits} disabled={scanningExits}>{scanningExits ? "Scanning exits" : "Scan wallet"}</button></div><p>Banked finds finalized SOL-debit and USDC-credit candidates. Review before importing. Importing never sends a transaction.</p>{detectedExits.map((exit) => <div className="detected-exit" key={exit.signature}><span>{formatAtomic(BigInt(exit.solDebited), 9, 4)} SOL to {formatAtomic(BigInt(exit.usdcReceived), 6, 4)} USDC<small>{formatExitTime(exit.blockTime)} · {exit.signature.slice(0, 8)}…{exit.signature.slice(-6)}</small></span><button className="link-button" onClick={() => importDetectedExit(exit)}>Apply rule</button></div>)}</section></section>
        <aside className="allocation-review" aria-labelledby="allocation-heading"><div className="section-heading"><div><p className="section-kicker">02 · REVIEW</p><h2 id="allocation-heading">Allocation</h2></div><span className="plain-status">{operation?.actualProceeds ? "Finalized proceeds" : "Estimated proceeds"}</span></div><div className="proceeds"><span>{operation?.actualProceeds ? "USDC received" : "Estimated USDC"}</span><strong>{formatAtomic(activeAllocation.proceeds, 6, 6)}</strong></div><p className="rule-state">{mode === "fixture" ? formatAtomic(simulatedExcess, 9, 6) : formatAtomic(liveExcess, 9, 6)} SOL above your keep amount. Simulation uses 1 SOL = 125.030864 USDC.</p><dl className="allocation-lines"><AllocationLine label="SPYx" amount={activeAllocation.spyx.budget} note={activeAllocation.spyx.eligible ? "Eligible" : "Below 10 USDC"} /><AllocationLine label="JUP" amount={activeAllocation.jup.budget} note={activeAllocation.jup.eligible ? "Eligible" : "Below 10 USDC"} /><AllocationLine label="Retained USDC" amount={activeAllocation.retainedUsdc} note="Stays spendable" /></dl><ol className="execution-steps"><Step number="01" label="Save and activate rule" active={selectedRule?.status === "active"} /><Step number="02" label="Confirm proceeds" active={Boolean(operation?.actualProceeds)} /><Step number="03" label="Complete destinations" active={operation?.saleStatus === "finalized"} /></ol><div className="primary-action">{selectedRule && <button className="secondary-action" onClick={() => toggleRule(selectedRule)}>{selectedRule.status === "active" ? "Pause rule" : "Activate rule"}</button>}{mode === "fixture" ? <button onClick={recordFixtureSale} disabled={selectedRule?.status !== "active" || simulatedExcess === 0n}>Record simulation proceeds</button> : <>{!preparedSale && <button onClick={prepareLiveSale} disabled={selectedRule?.status !== "active"}>Prepare live sale</button>}{preparedSale && operation?.saleStatus === "prepared" && <button onClick={signAndSubmitSale} disabled={selectedRule?.status !== "active"}>Review and sign sale</button>}</>}</div></aside>
      </section>
      {operation?.saleStatus === "finalized" && <section className="destination-section" id="destinations" aria-labelledby="destinations-heading"><div className="section-heading"><div><p className="section-kicker">03 · COMPLETE</p><h2 id="destinations-heading">Finish eligible destinations</h2></div><p>Each destination is independent. A delayed purchase never locks retained USDC.</p></div><div className="destination-grid">{(["spyx", "jup"] as PurchaseDestinationId[]).map((destinationId) => <PurchaseCard key={destinationId} destinationId={destinationId} operation={operation} quote={quotes[destinationId]} mode={operation.wallet === "fixture" ? "fixture" : "live"} onQuote={loadQuote} onFixture={recordFixturePurchase} onPrepare={preparePurchase} onSign={signAndSubmitPurchase} onRecover={reconcilePendingPurchase} prepared={Boolean(preparedPurchases[destinationId])} />)}</div></section>}
      {operation && <section className="receipt-summary"><div><p className="section-kicker">RULE RECEIPT</p><h2>{operation.rule.name}</h2><p>{operation.rule.spyxBps}% SPYx, {operation.rule.jupBps}% JUP, {100 - operation.rule.spyxBps - operation.rule.jupBps}% retained USDC.</p></div><div><button className="secondary-action" onClick={copyReceipt}>Copy receipt</button><button className="secondary-action" onClick={downloadReceipt}>Download JSON</button></div></section>}
      <details className="secondary-section" id="history" open={discipline.pendingPurchases > 0}><summary><span>Saved rules and receipts</span><span>{discipline.pendingPurchases > 0 ? `${discipline.pendingPurchases} purchase${discipline.pendingPurchases === 1 ? "" : "s"} need attention` : "View history"}</span></summary><div className="secondary-content"><section className="history-block"><h2>Saved rules</h2>{rules.length ? rules.map((rule) => <div className="history-row" key={rule.id}><span>{rule.name} ({rule.status})</span><span>{rule.solToKeepLamports === null ? "Set SOL to keep" : `${formatAtomic(BigInt(rule.solToKeepLamports), 9)} SOL to keep`} · {rule.spyxBps}% SPYx / {rule.jupBps}% JUP</span><div><button className="link-button" onClick={() => selectRule(rule)}>Load</button><button className="link-button" onClick={() => toggleRule(rule)}>{rule.status === "active" ? "Pause" : "Activate"}</button><button className="link-button" onClick={() => duplicateRule(rule)}>Duplicate</button><button className="link-button destructive" onClick={() => { deleteRule(rule.id); setRules(loadRules()); if (selectedRuleId === rule.id) setSelectedRuleId(null); }}>Delete</button></div></div>) : <p>No saved rules yet.</p>}</section><section className="history-block"><h2>Recent operations</h2>{history.length ? history.map((item) => <div className="history-row" key={item.id}><span>{item.rule.name}</span><span>{item.saleStatus}</span><span>{item.actualProceeds ? `${formatAtomic(BigInt(item.actualProceeds), 6, 4)} USDC` : "Awaiting proceeds"}</span>{item.saleStatus === "finalized" && <button className="link-button" onClick={() => { setOperation(item); setMode(item.wallet === "fixture" ? "fixture" : "live"); setMessage(`${item.rule.name} restored. Continue any ready or pending purchase.`); }}>Resume</button>}</div>) : <p>No operations yet.</p>}</section></div></details>
      <p className="workspace-message" role="status">{message}</p>
      <footer className="workspace-footer">Banked never requests seed phrases, delegated authority, or custody transfers.</footer>
    </main>
  </div>;
}

function AllocationControl({ id, value, onChange, disabled = false }: { id: PurchaseDestinationId; value: number; onChange: (id: PurchaseDestinationId, value: number) => void; disabled?: boolean }) {
  const asset = getPurchaseAsset(id);
  return <div className="workspace-field"><div><span>Allocate to {asset.symbol}</span><output>{value}%</output></div><input id={`${id}-allocation`} type="range" min="0" max="100" value={value} disabled={disabled} aria-label={`Allocate to ${asset.symbol}`} onChange={(event) => onChange(id, Number(event.target.value))} /><small>{asset.kind === "xstock" ? "xStock economic exposure, not direct share ownership." : "Curated Solana token destination."}</small></div>;
}

function AllocationLine({ label, amount, note }: { label: string; amount: bigint; note: string }) {
  return <div><dt>{label}<small>{note}</small></dt><dd>{formatAtomic(amount, 6, 6)} <span>USDC</span></dd></div>;
}

function Step({ number, label, active }: { number: string; label: string; active: boolean }) {
  return <li className={active ? "complete" : ""}><span>{active ? <StatusMark /> : number}</span>{label}</li>;
}

function MoneyDashboard({ summary, mode }: { summary: MoneyFlowSummary; mode: "fixture" | "live" }) {
  return <section className="money-dashboard" id="dashboard" aria-labelledby="money-dashboard-heading">
    <div className="section-heading"><div><p className="section-kicker">YOUR ROUTING DASHBOARD</p><h2 id="money-dashboard-heading">Where the exit went</h2></div><span className="plain-status">{mode === "fixture" ? "Simulation receipts" : "Connected wallet receipts"}</span></div>
    <div className="money-dashboard-body"><div className="money-proceeds"><span>Total recorded proceeds</span><strong>{formatAtomic(summary.proceeds, 6, 6)} <small>USDC</small></strong><p>{summary.completedExits} finalized exit{summary.completedExits === 1 ? "" : "s"}{summary.exitsNeedingAction > 0 ? ` · ${summary.exitsNeedingAction} need action` : ""}</p></div><div className="money-flow-grid"><DashboardValue label="Routed to SPYx" value={summary.routedSpyx} /><DashboardValue label="Routed to JUP" value={summary.routedJup} /><DashboardValue label="Awaiting purchase" value={summary.awaitingAction} /><DashboardValue label="Planned to keep" value={summary.plannedRetained} /></div></div>
    {summary.unverified > 0n && <p className="money-dashboard-alert">{formatAtomic(summary.unverified, 6, 6)} USDC of older completed purchase budgets have no recorded debit. Check their receipts before treating them as routed.</p>}
    <p className="money-dashboard-note">{summary.completedExits === 0 ? "Record an exit to see how its proceeds are routed. This view uses saved receipts, not your current wallet balance." : "Routed amounts use recorded purchase debits. Planned retention is an allocation, not a live wallet balance."}</p>
  </section>;
}

function DashboardValue({ label, value }: { label: string; value: bigint }) {
  return <div><span>{label}</span><strong>{formatAtomic(value, 6, 6)} <small>USDC</small></strong></div>;
}

function PurchaseCard({ destinationId, operation, quote, mode, onQuote, onFixture, onPrepare, onSign, onRecover, prepared }: { destinationId: PurchaseDestinationId; operation: RuleOperation; quote?: Quote; mode: "fixture" | "live"; onQuote: (id: PurchaseDestinationId) => void; onFixture: (id: PurchaseDestinationId) => void; onPrepare: (id: PurchaseDestinationId) => void; onSign: (id: PurchaseDestinationId) => void; onRecover: (id: PurchaseDestinationId) => void; prepared: boolean }) {
  const asset = getPurchaseAsset(destinationId);
  const purchase = operation.purchases[destinationId];
  const canPrepare = purchase.status === "ready";
  const complete = purchase.status === "finalized";
  return <section className="destination-card"><div className="destination-heading"><div><p className="section-kicker">{asset.kind === "xstock" ? "XSTOCK" : "SOLANA TOKEN"}</p><h2>{asset.symbol}</h2></div><span className={`purchase-status ${purchase.status}`}>{complete && <StatusMark />}{purchase.status}</span></div><p className="destination-budget">{formatAtomic(BigInt(purchase.budget), 6, 6)} USDC budget</p>{quote && <p className="destination-quote">Expected {formatAtomic(BigInt(quote.expectedOutput), asset.decimals, 6)} {asset.symbol}. Minimum {formatAtomic(BigInt(quote.minimumOutput), asset.decimals, 6)}.</p>}<div className="destination-actions"><button className="secondary-action" onClick={() => onQuote(destinationId)} disabled={purchase.status === "skipped"}>Get quote</button>{mode === "fixture" && purchase.status === "ready" && <button onClick={() => onFixture(destinationId)}>Record simulation purchase</button>}{mode === "live" && canPrepare && <button onClick={() => onPrepare(destinationId)}>Prepare purchase</button>}{mode === "live" && prepared && purchase.status === "prepared" && <button onClick={() => onSign(destinationId)}>Review and sign</button>}{mode === "live" && purchase.status === "pending" && <button onClick={() => onRecover(destinationId)}>Reconcile purchase</button>}</div></section>;
}

function StatusMark() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" focusable="false"><path d="m3 8 3 3 7-7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>;
}

function formatExitTime(blockTime: number | null): string {
  return blockTime ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(blockTime * 1000)) : "Finalized on-chain";
}

function receiptText(operation: RuleOperation): string {
  return [`Banked rule receipt: ${operation.rule.name}`, `Sale: ${operation.saleStatus}`, `USDC proceeds: ${operation.actualProceeds ?? "pending"}`, ...Object.values(operation.purchases).map((purchase) => `${getPurchaseAsset(purchase.destinationId).symbol}: ${purchase.status}, budget ${purchase.budget} USDC${purchase.signature ? `, signature ${purchase.signature}` : ""}`)].join("\n");
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(window.atob(value), (character) => character.charCodeAt(0));
}

function bytesToBase64(value: Uint8Array): string {
  return window.btoa(String.fromCharCode(...value));
}

declare global {
  interface Window { phantom?: { solana?: { isPhantom?: boolean; connect: () => Promise<{ publicKey: { toBase58: () => string } }>; signTransaction: (transaction: VersionedTransaction) => Promise<VersionedTransaction>; signAndSendTransaction?: (transaction: Transaction | VersionedTransaction) => Promise<{ signature: string }> } } }
}
