"use client";

import { useEffect, useMemo, useState } from "react";
import { VersionedTransaction } from "@solana/web3.js";
import { allocateRuleProceeds, formatAtomic, parseDecimalToAtomic } from "@/domain/allocation";
import { getPurchaseAsset, type PurchaseDestinationId } from "@/domain/assets";
import { createExitRule, createRuleOperation, exitRuleTemplates, reconcileRuleSale, summarizeRuleOperations, updatePurchase, type ExitRule, type RuleOperation } from "@/domain/rules";
import { deleteRule, loadRuleOperations, loadRules, saveRule, saveRuleOperation } from "@/storage/operations";

type Quote = { destinationId: PurchaseDestinationId; expectedOutput: string; minimumOutput: string; feeBps: number; route: string };
type PreparedOrder = Quote & { requestId: string; transaction: string; stage: "sale" | "purchase"; destinationId?: PurchaseDestinationId | null };
type ExecutionResult = { status: "Success" | "Failed"; signature?: string; error?: string | null };
type Reconciliation = { status: string; usdcDelta?: string; destinationDelta?: string };

const fixtureUsdcPerSol = 125_030_864n;
const lamportsPerSol = 1_000_000_000n;

export function CuratedRuleFlow() {
  const [saleAmount, setSaleAmount] = useState("1");
  const [ruleName, setRuleName] = useState("De-risk SOL rally");
  const [spyxBps, setSpyxBps] = useState(20);
  const [jupBps, setJupBps] = useState(20);
  const [mode, setMode] = useState<"fixture" | "live">("fixture");
  const [wallet, setWallet] = useState<string | null>(null);
  const [message, setMessage] = useState("Create an exit rule, then review its receipt before enabling live execution.");
  const [rules, setRules] = useState<ExitRule[]>([]);
  const [history, setHistory] = useState<RuleOperation[]>([]);
  const [operation, setOperation] = useState<RuleOperation | null>(null);
  const [preparedSale, setPreparedSale] = useState<PreparedOrder | null>(null);
  const [preparedPurchases, setPreparedPurchases] = useState<Partial<Record<PurchaseDestinationId, PreparedOrder>>>({});
  const [quotes, setQuotes] = useState<Partial<Record<PurchaseDestinationId, Quote>>>({});

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRules(loadRules());
      setHistory(loadRuleOperations());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const fixtureProceeds = useMemo(() => {
    try {
      return (parseDecimalToAtomic(saleAmount, 9) * fixtureUsdcPerSol) / lamportsPerSol;
    } catch {
      return 0n;
    }
  }, [saleAmount]);
  const formAllocation = useMemo(() => allocateRuleProceeds(fixtureProceeds, { spyxBps, jupBps }), [fixtureProceeds, spyxBps, jupBps]);
  const activeAllocation = useMemo(() => operation?.actualProceeds ? allocateRuleProceeds(BigInt(operation.actualProceeds), { spyxBps: operation.rule.spyxBps, jupBps: operation.rule.jupBps }) : formAllocation, [formAllocation, operation]);
  const discipline = useMemo(() => summarizeRuleOperations(history), [history]);

  function persistOperation(next: RuleOperation) {
    saveRuleOperation(next);
    setOperation(next);
    setHistory(loadRuleOperations());
  }

  function buildRule(existing?: ExitRule): ExitRule | null {
    try {
      const next = createExitRule(ruleName, { spyxBps, jupBps });
      if (!existing) return next;
      return { ...next, id: existing.id, createdAt: existing.createdAt };
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

  function saveCurrentRule(existing?: ExitRule) {
    const rule = buildRule(existing);
    if (!rule) return;
    saveRule(rule);
    setRules(loadRules());
    setMessage(`Saved ${rule.name}.`);
  }

  function selectRule(rule: ExitRule) {
    setRuleName(rule.name);
    setSpyxBps(rule.spyxBps);
    setJupBps(rule.jupBps);
    setMessage(`Loaded ${rule.name}.`);
  }

  function applyTemplate(template: (typeof exitRuleTemplates)[number]) {
    setRuleName(template.name);
    setSpyxBps(template.spyxBps);
    setJupBps(template.jupBps);
    setMessage(`${template.name} loaded. Adjust it before saving or preparing a sale.`);
  }

  function duplicateRule(rule: ExitRule) {
    const copy = createExitRule(`${rule.name} copy`, { spyxBps: rule.spyxBps, jupBps: rule.jupBps });
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
    setMessage("Wallet connected. Every live purchase still requires your approval.");
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

  function recordFixtureSale() {
    const rule = buildRule();
    if (!rule) return;
    persistOperation(reconcileRuleSale(createRuleOperation(rule, "fixture"), fixtureProceeds));
    setMessage("Fixture sale recorded. Each eligible destination can now be recorded independently.");
  }

  async function prepareLiveSale() {
    if (!wallet) {
      setMessage("Connect Phantom before preparing a live sale.");
      return;
    }
    const rule = buildRule();
    if (!rule) return;
    let amount: bigint;
    try {
      amount = parseDecimalToAtomic(saleAmount, 9);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Enter a valid SOL amount.");
      return;
    }
    const response = await fetch("/api/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage: "sale", taker: wallet, amount: amount.toString() }) });
    const result = await response.json() as PreparedOrder & { error?: string };
    if (!response.ok) {
      setMessage(result.error ?? "A live sale could not be prepared.");
      return;
    }
    persistOperation(createRuleOperation(rule, wallet));
    setPreparedSale(result);
    setMessage("Live sale prepared. Review the transaction in Phantom before signing.");
  }

  async function signAndSubmitSale() {
    const provider = window.phantom?.solana;
    if (!provider || !preparedSale || !operation || !wallet) return;
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
    if (!operation?.actualProceeds || operation.saleStatus !== "finalized" || !wallet) {
      setMessage("Finalize the sale and connect Phantom before preparing a purchase.");
      return;
    }
    const purchase = operation.purchases[destinationId];
    if (purchase.status !== "ready" && purchase.status !== "pending") return;
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
        persistOperation(updatePurchase(submitted, destinationId, { status: "finalized", signature: result.signature, actualOutput: reconciliation.destinationDelta }));
        setMessage(`${getPurchaseAsset(destinationId).symbol} purchase finalized.`);
      } else {
        persistOperation(updatePurchase(submitted, destinationId, { status: "pending", signature: result.signature }));
        setMessage(`${getPurchaseAsset(destinationId).symbol} purchase submitted and awaiting reconciliation.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet signing was not completed.");
    }
  }

  function recordFixturePurchase(destinationId: PurchaseDestinationId) {
    if (!operation) return;
    persistOperation(updatePurchase(operation, destinationId, { status: "finalized", actualOutput: "fixture" }));
    setMessage(`${getPurchaseAsset(destinationId).symbol} fixture purchase recorded.`);
  }

  async function reconcile(stage: "sale" | "purchase", signature: string, destinationId?: PurchaseDestinationId): Promise<Reconciliation | null> {
    const response = await fetch("/api/reconcile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage, destinationId, wallet, signature }) });
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

  return <div className="workspace">
    <header className="workspace-header"><a className="wordmark" href="#rule">Banked</a><div className="workspace-meta"><span>{mode === "fixture" ? "Simulation mode" : "Mainnet execution"}</span><span>Solana</span><button className="link-button" onClick={() => setMode(mode === "fixture" ? "live" : "fixture")}>Use {mode === "fixture" ? "live mode" : "simulation"}</button><button className="wallet-button" onClick={connectWallet}>{wallet ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : "Connect wallet"}</button></div></header>
    <main>
      <section className="workspace-intro"><p className="section-kicker">EXIT ALLOCATION</p><h1>Set the rule before you sell.</h1><p>Convert a SOL exit into a planned allocation. Banked calculates from finalized USDC proceeds and requires your approval for every purchase.</p></section>
      <section className="workspace-grid" id="rule">
        <section className="rule-workbench" aria-labelledby="rule-heading"><div className="section-heading"><p className="section-kicker">01 · DEFINE</p><h2 id="rule-heading">Exit rule</h2><button className="link-button" onClick={() => saveCurrentRule()}>Save rule</button></div><div className="form-stack"><label className="workspace-field" htmlFor="rule-name"><span>Rule name</span><input id="rule-name" value={ruleName} maxLength={60} onChange={(event) => setRuleName(event.target.value)} /></label><label className="workspace-field" htmlFor="sale"><span>SOL to sell</span><div className="amount-input"><input id="sale" inputMode="decimal" value={saleAmount} onChange={(event) => setSaleAmount(event.target.value)} /><strong>SOL</strong></div><small>Simulation uses 1 SOL = 125.030864 USDC.</small></label><AllocationControl id="spyx" value={spyxBps} onChange={changePercentage} /><AllocationControl id="jup" value={jupBps} onChange={changePercentage} /></div><div className="template-list" aria-label="Rule templates"><p className="section-kicker">START WITH A TEMPLATE</p>{exitRuleTemplates.map((template) => <button className="template-row" key={template.id} onClick={() => applyTemplate(template)}><span><strong>{template.name}</strong><small>{template.description}</small></span><span>{template.spyxBps}% SPYx / {template.jupBps}% JUP</span></button>)}</div></section>
        <aside className="allocation-review" aria-labelledby="allocation-heading"><div className="section-heading"><div><p className="section-kicker">02 · REVIEW</p><h2 id="allocation-heading">Allocation</h2></div><span className="plain-status">{operation?.actualProceeds ? "Finalized proceeds" : "Estimated proceeds"}</span></div><div className="proceeds"><span>{operation?.actualProceeds ? "USDC received" : "Estimated USDC"}</span><strong>{formatAtomic(activeAllocation.proceeds, 6, 6)}</strong></div><dl className="allocation-lines"><AllocationLine label="SPYx" amount={activeAllocation.spyx.budget} note={activeAllocation.spyx.eligible ? "Eligible" : "Below 10 USDC"} /><AllocationLine label="JUP" amount={activeAllocation.jup.budget} note={activeAllocation.jup.eligible ? "Eligible" : "Below 10 USDC"} /><AllocationLine label="Retained USDC" amount={activeAllocation.retainedUsdc} note="Stays spendable" /></dl><ol className="execution-steps"><Step number="01" label="Define rule" active /><Step number="02" label="Confirm proceeds" active={Boolean(operation?.actualProceeds)} /><Step number="03" label="Complete destinations" active={operation?.saleStatus === "finalized"} /></ol><div className="primary-action">{mode === "fixture" ? <button onClick={recordFixtureSale}>Record simulation proceeds</button> : <>{!preparedSale && <button onClick={prepareLiveSale}>Prepare live sale</button>}{preparedSale && operation?.saleStatus === "prepared" && <button onClick={signAndSubmitSale}>Review and sign sale</button>}</>}</div></aside>
      </section>
      {operation?.saleStatus === "finalized" && <section className="destination-section" aria-labelledby="destinations-heading"><div className="section-heading"><div><p className="section-kicker">03 · COMPLETE</p><h2 id="destinations-heading">Finish eligible destinations</h2></div><p>Each destination is independent. A delayed purchase never locks retained USDC.</p></div><div className="destination-grid">{(["spyx", "jup"] as PurchaseDestinationId[]).map((destinationId) => <PurchaseCard key={destinationId} destinationId={destinationId} operation={operation} quote={quotes[destinationId]} mode={mode} onQuote={loadQuote} onFixture={recordFixturePurchase} onPrepare={preparePurchase} onSign={signAndSubmitPurchase} prepared={Boolean(preparedPurchases[destinationId])} />)}</div></section>}
      {operation && <section className="receipt-summary"><div><p className="section-kicker">RULE RECEIPT</p><h2>{operation.rule.name}</h2><p>{operation.rule.spyxBps}% SPYx, {operation.rule.jupBps}% JUP, {100 - operation.rule.spyxBps - operation.rule.jupBps}% retained USDC.</p></div><div><button className="secondary-action" onClick={copyReceipt}>Copy receipt</button><button className="secondary-action" onClick={downloadReceipt}>Download JSON</button></div></section>}
      <details className="secondary-section" open={discipline.pendingPurchases > 0}><summary><span>Discipline and recovery</span><span>{discipline.pendingPurchases > 0 ? `${discipline.pendingPurchases} purchase${discipline.pendingPurchases === 1 ? "" : "s"} need attention` : "View history"}</span></summary><div className="secondary-content"><div className="discipline-metrics"><WorkspaceMetric label="Rules followed" value={`${discipline.completedRules}/${discipline.totalRules}`} /><WorkspaceMetric label="Pending purchases" value={discipline.pendingPurchases.toString()} /><WorkspaceMetric label="Retained across exits" value={`${formatAtomic(discipline.retainedUsdc, 6, 4)} USDC`} /></div><section className="history-block"><h2>Saved rules</h2>{rules.length ? rules.map((rule) => <div className="history-row" key={rule.id}><span>{rule.name}</span><span>{rule.spyxBps}% SPYx / {rule.jupBps}% JUP</span><div><button className="link-button" onClick={() => selectRule(rule)}>Load</button><button className="link-button" onClick={() => duplicateRule(rule)}>Duplicate</button><button className="link-button destructive" onClick={() => { deleteRule(rule.id); setRules(loadRules()); }}>Delete</button></div></div>) : <p>No saved rules yet.</p>}</section><section className="history-block"><h2>Recent operations</h2>{history.length ? history.map((item) => <div className="history-row" key={item.id}><span>{item.rule.name}</span><span>{item.saleStatus}</span><span>{item.actualProceeds ? `${formatAtomic(BigInt(item.actualProceeds), 6, 4)} USDC` : "Awaiting proceeds"}</span>{item.saleStatus === "finalized" && <button className="link-button" onClick={() => { setOperation(item); setMessage(`${item.rule.name} restored. Continue any ready or pending purchase.`); }}>Resume</button>}</div>) : <p>No operations yet.</p>}</section></div></details>
      <p className="workspace-message" role="status">{message}</p>
      <footer className="workspace-footer">Banked never requests seed phrases, delegated authority, or custody transfers.</footer>
    </main>
  </div>;
}

function AllocationControl({ id, value, onChange }: { id: PurchaseDestinationId; value: number; onChange: (id: PurchaseDestinationId, value: number) => void }) {
  const asset = getPurchaseAsset(id);
  return <div className="workspace-field"><div><span>Allocate to {asset.symbol}</span><output>{value}%</output></div><input id={`${id}-allocation`} type="range" min="0" max="100" value={value} aria-label={`Allocate to ${asset.symbol}`} onChange={(event) => onChange(id, Number(event.target.value))} /><small>{asset.kind === "xstock" ? "xStock economic exposure, not direct share ownership." : "Curated Solana token destination."}</small></div>;
}

function AllocationLine({ label, amount, note }: { label: string; amount: bigint; note: string }) {
  return <div><dt>{label}<small>{note}</small></dt><dd>{formatAtomic(amount, 6, 6)} <span>USDC</span></dd></div>;
}

function Step({ number, label, active }: { number: string; label: string; active: boolean }) {
  return <li className={active ? "complete" : ""}><span>{active ? <StatusMark /> : number}</span>{label}</li>;
}

function WorkspaceMetric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function PurchaseCard({ destinationId, operation, quote, mode, onQuote, onFixture, onPrepare, onSign, prepared }: { destinationId: PurchaseDestinationId; operation: RuleOperation; quote?: Quote; mode: "fixture" | "live"; onQuote: (id: PurchaseDestinationId) => void; onFixture: (id: PurchaseDestinationId) => void; onPrepare: (id: PurchaseDestinationId) => void; onSign: (id: PurchaseDestinationId) => void; prepared: boolean }) {
  const asset = getPurchaseAsset(destinationId);
  const purchase = operation.purchases[destinationId];
  const canPrepare = purchase.status === "ready" || purchase.status === "pending";
  const complete = purchase.status === "finalized";
  return <section className="destination-card"><div className="destination-heading"><div><p className="section-kicker">{asset.kind === "xstock" ? "XSTOCK" : "SOLANA TOKEN"}</p><h2>{asset.symbol}</h2></div><span className={`purchase-status ${purchase.status}`}>{complete && <StatusMark />}{purchase.status}</span></div><p className="destination-budget">{formatAtomic(BigInt(purchase.budget), 6, 6)} USDC budget</p>{quote && <p className="destination-quote">Expected {formatAtomic(BigInt(quote.expectedOutput), asset.decimals, 6)} {asset.symbol}. Minimum {formatAtomic(BigInt(quote.minimumOutput), asset.decimals, 6)}.</p>}<div className="destination-actions"><button className="secondary-action" onClick={() => onQuote(destinationId)} disabled={purchase.status === "skipped"}>Get quote</button>{mode === "fixture" && purchase.status === "ready" && <button onClick={() => onFixture(destinationId)}>Record simulation purchase</button>}{mode === "live" && canPrepare && <button onClick={() => onPrepare(destinationId)}>Prepare purchase</button>}{mode === "live" && prepared && purchase.status === "prepared" && <button onClick={() => onSign(destinationId)}>Review and sign</button>}</div></section>;
}

function StatusMark() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" focusable="false"><path d="m3 8 3 3 7-7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>;
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
  interface Window { phantom?: { solana?: { isPhantom?: boolean; connect: () => Promise<{ publicKey: { toBase58: () => string } }>; signTransaction: (transaction: VersionedTransaction) => Promise<VersionedTransaction> } } }
}
