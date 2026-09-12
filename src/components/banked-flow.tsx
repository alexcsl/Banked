"use client";

import { useMemo, useState } from "react";
import { VersionedTransaction } from "@solana/web3.js";
import { allocateProceeds, formatAtomic, hasEconomicEquityBudget, parseDecimalToAtomic } from "@/domain/allocation";
import { transitionOperation, type BankedOperation } from "@/domain/operation";
import { saveOperation } from "@/storage/operations";

type Quote = { expectedOutput: string; minimumOutput: string; feeBps: number; route: string };
type PreparedOrder = Quote & { requestId: string; transaction: string; stage: "sale" | "equity" };
type ExecutionResult = { status: "Success" | "Failed"; signature?: string; error?: string | null };

const fixtureUsdcPerSol = 125_030_864n;
const lamportsPerSol = 1_000_000_000n;

export function BankedFlow() {
  const [saleAmount, setSaleAmount] = useState("1");
  const [equityPercent, setEquityPercent] = useState(20);
  const [mode, setMode] = useState<"fixture" | "live">("fixture");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [message, setMessage] = useState("Review a fixture-backed receipt before enabling a live transaction.");
  const [wallet, setWallet] = useState<string | null>(null);
  const [preparedSale, setPreparedSale] = useState<PreparedOrder | null>(null);
  const [preparedEquity, setPreparedEquity] = useState<PreparedOrder | null>(null);
  const [operation, setOperation] = useState<BankedOperation | null>(null);

  const fixtureProceeds = useMemo(() => {
    try {
      return (parseDecimalToAtomic(saleAmount, 9) * fixtureUsdcPerSol) / lamportsPerSol;
    } catch {
      return 0n;
    }
  }, [saleAmount]);
  const allocation = useMemo(() => allocateProceeds(fixtureProceeds, equityPercent), [equityPercent, fixtureProceeds]);
  const activeAllocation = useMemo(() => operation?.actualProceeds ? allocateProceeds(BigInt(operation.actualProceeds), operation.equityBps) : allocation, [allocation, operation]);

  async function connectWallet() {
    const provider = window.phantom?.solana;
    if (!provider?.isPhantom) {
      setMessage("Phantom is required for live execution. Fixture mode remains available.");
      return;
    }
    const result = await provider.connect();
    setWallet(result.publicKey.toBase58());
    setMessage("Wallet connected. Live execution remains disabled until a validated transaction builder is configured.");
  }

  async function requestQuote() {
    if (!hasEconomicEquityBudget(activeAllocation)) {
      setQuote(null);
      setMessage("Increase the equity allocation to at least 10 USDC for an economic purchase.");
      return;
    }
    setMessage("Loading an indicative SPYx quote.");
    const response = await fetch("/api/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount: activeAllocation.equityBudget.toString() }) });
    const result = await response.json() as Quote & { error?: string };
    if (!response.ok) {
      setQuote(null);
      setMessage(result.error ?? "The quote could not be loaded.");
      return;
    }
    setQuote(result);
    setMessage("Indicative quote loaded. Refresh it immediately before a future wallet signature.");
  }

  async function prepareLiveSale() {
    if (!wallet) {
      setMessage("Connect Phantom before preparing a live sale.");
      return;
    }
    let amount: bigint;
    try {
      amount = parseDecimalToAtomic(saleAmount, 9);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Enter a valid SOL amount.");
      return;
    }
    setMessage("Preparing a wallet-bound live sale.");
    const response = await fetch("/api/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "sale", taker: wallet, amount: amount.toString() }),
    });
    const result = await response.json() as PreparedOrder & { error?: string };
    if (!response.ok) {
      setMessage(result.error ?? "A live sale could not be prepared.");
      return;
    }
    const nextOperation: BankedOperation = {
      id: crypto.randomUUID(),
      wallet,
      status: "sale-prepared",
      equityBps: equityPercent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveOperation(nextOperation);
    setOperation(nextOperation);
    setPreparedSale(result);
    setMessage("Live sale prepared. Review the wallet transaction before signing.");
  }

  async function signAndSubmitSale() {
    const provider = window.phantom?.solana;
    if (!provider || !preparedSale || !operation || !wallet) return;
    try {
      const transaction = VersionedTransaction.deserialize(base64ToBytes(preparedSale.transaction));
      const signedTransaction = await provider.signTransaction(transaction);
      const submittedOperation = { ...transitionOperation(operation, "sale-submitted"), saleSignature: "pending" };
      saveOperation(submittedOperation);
      setOperation(submittedOperation);
      setMessage("Submitting the exact wallet-signed transaction.");
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: "sale", taker: wallet, requestId: preparedSale.requestId, signedTransaction: bytesToBase64(signedTransaction.serialize()) }),
      });
      const result = await response.json() as ExecutionResult & { error?: string };
      const signature = result.signature;
      if (!response.ok || result.status !== "Success" || !signature) {
        const uncertainOperation = { ...transitionOperation(submittedOperation, "reconciliation-required"), saleSignature: signature };
        saveOperation(uncertainOperation);
        setOperation(uncertainOperation);
        setMessage(result.error ?? "Submission needs chain reconciliation before any retry.");
        return;
      }
      const reconciliation = await reconcile("sale", signature);
      if (reconciliation?.status === "finalized" && reconciliation.usdcDelta) {
        const finalizedOperation = { ...transitionOperation(submittedOperation, "sale-finalized"), saleSignature: signature, actualProceeds: reconciliation.usdcDelta };
        saveOperation(finalizedOperation);
        setOperation(finalizedOperation);
        setMessage(`Sale finalized with ${formatAtomic(BigInt(reconciliation.usdcDelta), 6, 6)} USDC in actual proceeds.`);
      } else {
        const uncertainOperation = { ...transitionOperation(submittedOperation, "reconciliation-required"), saleSignature: signature };
        saveOperation(uncertainOperation);
        setOperation(uncertainOperation);
        setMessage("Sale submitted. Reconcile the chain result before preparing an equity purchase.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet signing was not completed.");
    }
  }

  async function prepareLiveEquity() {
    if (!wallet || !operation?.actualProceeds || operation.status !== "sale-finalized") {
      setMessage("Finalize and reconcile the sale before preparing an equity purchase.");
      return;
    }
    const actualAllocation = allocateProceeds(BigInt(operation.actualProceeds), operation.equityBps);
    if (!hasEconomicEquityBudget(actualAllocation)) {
      setMessage("The actual equity budget is below the 10 USDC minimum. USDC remains in your wallet.");
      return;
    }
    setMessage("Preparing a fresh equity order from finalized proceeds.");
    const response = await fetch("/api/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "equity", taker: wallet, amount: actualAllocation.equityBudget.toString() }),
    });
    const result = await response.json() as PreparedOrder & { error?: string };
    if (!response.ok) {
      setMessage(result.error ?? "An equity purchase could not be prepared.");
      return;
    }
    const preparedOperation = transitionOperation(operation, "equity-prepared");
    saveOperation(preparedOperation);
    setOperation(preparedOperation);
    setPreparedEquity(result);
    setMessage("Equity purchase prepared from actual proceeds. Review it in Phantom before signing.");
  }

  async function signAndSubmitEquity() {
    const provider = window.phantom?.solana;
    if (!provider || !preparedEquity || !operation || !wallet) return;
    try {
      const transaction = VersionedTransaction.deserialize(base64ToBytes(preparedEquity.transaction));
      const signedTransaction = await provider.signTransaction(transaction);
      const submittedOperation = { ...transitionOperation(operation, "equity-submitted"), equitySignature: "pending" };
      saveOperation(submittedOperation);
      setOperation(submittedOperation);
      setMessage("Submitting the exact wallet-signed equity transaction.");
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: "equity", taker: wallet, requestId: preparedEquity.requestId, signedTransaction: bytesToBase64(signedTransaction.serialize()) }),
      });
      const result = await response.json() as ExecutionResult & { error?: string };
      const signature = result.signature;
      if (!response.ok || result.status !== "Success" || !signature) {
        const pendingOperation = { ...transitionOperation(submittedOperation, "allocation-pending"), equitySignature: signature };
        saveOperation(pendingOperation);
        setOperation(pendingOperation);
        setMessage(result.error ?? "Equity submission is pending recovery. The completed sale remains unchanged.");
        return;
      }
      const reconciliation = await reconcile("equity", signature);
      if (reconciliation?.status === "finalized") {
        const completeOperation = { ...transitionOperation(submittedOperation, "complete"), equitySignature: signature };
        saveOperation(completeOperation);
        setOperation(completeOperation);
        setMessage("Equity purchase finalized. Your receipt is ready for chain verification.");
      } else {
        const pendingOperation = { ...transitionOperation(submittedOperation, "allocation-pending"), equitySignature: signature };
        saveOperation(pendingOperation);
        setOperation(pendingOperation);
        setMessage("Equity transaction submitted. Reconcile its result before retrying.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet signing was not completed.");
    }
  }

  async function reconcile(stage: "sale" | "equity", signature: string): Promise<{ status: string; usdcDelta?: string } | null> {
    const response = await fetch("/api/reconcile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage, wallet, signature }),
    });
    if (!response.ok) return null;
    return response.json() as Promise<{ status: string; usdcDelta?: string }>;
  }

  function updateSaleAmount(value: string) {
    setSaleAmount(value);
    try {
      parseDecimalToAtomic(value, 9);
      setMessage("Demo estimates use a fixed synthetic rate. Live allocation uses finalized sale proceeds.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invalid sale amount.");
    }
  }

  return <div className="shell">
    <header><span className="brand">Banked</span><span className={`mode ${mode}`}>{mode === "fixture" ? "Fixture mode" : "Live gate"}</span></header>
    <section className="hero"><p className="eyebrow">EXIT RULES FOR SOL AND XSTOCKS</p><h1>Set the rule before you sell.</h1><p>Banked applies an allocation only to a sale you start here. Your wallet signs each stage, and the xStock purchase is prepared from finalized proceeds.</p></section>
    <section className="panel controls">
      <div className="field"><label htmlFor="sale">Sell SOL</label><input id="sale" inputMode="decimal" value={saleAmount} onChange={(event) => updateSaleAmount(event.target.value)} /><small>Demo rate: 1 SOL = 125.030864 USDC. This is synthetic test data, not a price quote.</small></div>
      <div className="field"><label htmlFor="allocation">Allocate to SPYx</label><div className="range-row"><input id="allocation" type="range" min="0" max="100" value={equityPercent} onChange={(event) => setEquityPercent(Number(event.target.value))} /><output>{equityPercent}%</output></div><small>The rule is snapshotted before a live sale. Banked does not monitor or sweep other wallets or terminals.</small></div>
      <div className="actions"><button className="secondary" onClick={() => setMode(mode === "fixture" ? "live" : "fixture")}>Switch to {mode === "fixture" ? "live gate" : "fixture"}</button><button onClick={connectWallet}>{wallet ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : "Connect Phantom"}</button></div>
    </section>
    <section className="grid">
      <article className="panel receipt"><p className="eyebrow">{operation?.actualProceeds ? "FINALIZED PROCEEDS" : "DEMO PROCEEDS"}</p><strong>{formatAtomic(activeAllocation.proceeds, 6, 6)} USDC</strong><span>{operation?.actualProceeds ? "Actual sale output used for allocation" : "Synthetic sale output for flow testing"}</span></article>
      <article className="panel receipt"><p className="eyebrow">SPYx BUDGET</p><strong>{formatAtomic(activeAllocation.equityBudget, 6, 6)} USDC</strong><span>Maximum total purchase debit</span></article>
      <article className="panel receipt"><p className="eyebrow">RETAINED USDC</p><strong>{formatAtomic(activeAllocation.retainedUsdc, 6, 6)} USDC</strong><span>Spendable in your connected wallet</span></article>
    </section>
    <section className="panel review"><div><p className="eyebrow">SECOND-STAGE REVIEW</p><h2>Buy SPYx from actual proceeds</h2><p>The sale must finalize before this stage. If this purchase fails, the sale remains complete and the USDC stays in your wallet.</p></div><button onClick={requestQuote} disabled={!hasEconomicEquityBudget(activeAllocation)}>Get indicative quote</button></section>
    {quote && <section className="panel quote"><span>Expected output</span><strong>{formatAtomic(BigInt(quote.expectedOutput), 8, 6)} SPYx</strong><span>Minimum output</span><strong>{formatAtomic(BigInt(quote.minimumOutput), 8, 6)} SPYx</strong><span>{quote.feeBps} bps via {quote.route}</span></section>}
    {mode === "live" && <section className="panel live-action"><div><p className="eyebrow">LIVE EXECUTION</p><h2>Prepare, then sign in Phantom</h2><p>Banked can only submit the exact bytes you approve. A rejected or uncertain submission must be reconciled before retrying.</p></div><div className="actions"><button className="secondary" onClick={prepareLiveSale} disabled={operation?.status === "sale-submitted"}>Prepare live sale</button>{preparedSale && operation?.status === "sale-prepared" && <button onClick={signAndSubmitSale}>Sign and submit sale</button>}{operation?.status === "sale-finalized" && <button className="secondary" onClick={prepareLiveEquity}>Prepare SPYx purchase</button>}{preparedEquity && operation?.status === "equity-prepared" && <button onClick={signAndSubmitEquity}>Sign and submit SPYx purchase</button>}</div></section>}
    <p className="status" role="status">{message}</p>
    <section className="disclosure"><h2>Before using live mode</h2><p>Live transactions stay unavailable until Jupiter access, transaction inspection, fee reconciliation and your eligibility are verified. This build never requests a seed phrase, delegate approval or custody transfer.</p></section>
  </div>;
}

declare global {
  interface Window { phantom?: { solana?: { isPhantom?: boolean; connect: () => Promise<{ publicKey: { toBase58: () => string } }>; signTransaction: (transaction: VersionedTransaction) => Promise<VersionedTransaction> } } }
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(window.atob(value), (character) => character.charCodeAt(0));
}

function bytesToBase64(value: Uint8Array): string {
  return window.btoa(String.fromCharCode(...value));
}
