"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { allocateCommitDeposit, describeCommitMandate, validateCommitPolicy, type CommitPolicyV1 } from "@/domain/commit/policy";
import { formatAtomic, parseDecimalToAtomic } from "@/domain/allocation";

type Capability = { available: boolean; reason?: string; programId?: string; genesisHash?: string; supportedActions?: string[] };

const draftKey = "banked:commit-draft:v1";
const initialDraft: CommitPolicyV1 = { schemaVersion: 1, reserveBps: 8_000, dailyLimitRaw: "100000000", executor: "", recipient: "" };

export function CommitVault() {
  const [draft, setDraft] = useState<CommitPolicyV1>(() => {
    if (typeof window === "undefined") return initialDraft;
    try {
      const saved = window.localStorage.getItem(draftKey);
      return saved ? JSON.parse(saved) as CommitPolicyV1 : initialDraft;
    } catch {
      return initialDraft;
    }
  });
  const [deposit, setDeposit] = useState("100");
  const [capability, setCapability] = useState<Capability | null>(null);
  const [message, setMessage] = useState("Commit drafts are local. Onchain authority begins only after a deployed program and owner signature.");

  useEffect(() => {
    void fetch("/api/commit/capabilities").then(async (response) => setCapability(await response.json() as Capability)).catch(() => setCapability({ available: false, reason: "Commit capability verification is unavailable." }));
  }, []);

  const preview = useMemo(() => {
    try { return allocateCommitDeposit(parseDecimalToAtomic(deposit, 8), draft.reserveBps); } catch { return null; }
  }, [deposit, draft.reserveBps]);
  const mandate = useMemo(() => describeCommitMandate(draft), [draft]);

  function update<K extends keyof CommitPolicyV1>(key: K, value: CommitPolicyV1[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function saveDraft() {
    try {
      validateCommitPolicy(draft);
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
      setMessage("Commit draft saved locally. It cannot authorize any token movement.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Commit draft is invalid.");
    }
  }

  function downloadReview() {
    try {
      validateCommitPolicy(draft);
      const review = {
        kind: "banked-commit-policy-review",
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        testStockDeposit: deposit,
        policy: draft,
        preview: preview ? { reservedRaw: preview.reservedRaw.toString(), operatingRaw: preview.operatingRaw.toString() } : null,
        authority: "This file records a review only. It cannot authorize a transfer.",
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(review, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "banked-commit-policy-review.json";
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Policy review downloaded. It records no signing authority and no transaction.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Complete the policy before downloading its review.");
    }
  }

  return <div className="workspace commit-workspace">
    <header className="workspace-header"><Link className="wordmark" href="/">Banked</Link><div className="workspace-meta"><Link className="link-button" href="/">Exit rules</Link><span>Commit vault</span></div></header>
    <main>
      <section className="workspace-intro"><p className="section-kicker">COMMIT VAULT</p><h1>Reserve stock inventory. Delegate a narrow operating budget.</h1><p>An executor can pay one approved recipient from the operating bucket. The reserve remains outside the executor path. This local-validator release uses a test-stock mint.</p></section>
      <section className="workspace-grid">
        <section className="rule-workbench" aria-labelledby="commit-policy"><div className="section-heading"><div><p className="section-kicker">01 · DEFINE</p><h2 id="commit-policy">Spending mandate</h2></div><div className="commit-heading-actions"><button className="link-button" onClick={downloadReview}>Download review</button><button className="link-button" onClick={saveDraft}>Save draft</button></div></div><div className="form-stack">
          <label className="workspace-field" htmlFor="commit-deposit"><span>Test-stock deposit</span><div className="amount-input"><input id="commit-deposit" value={deposit} inputMode="decimal" onChange={(event) => setDeposit(event.target.value)} /><strong>TEST</strong></div><small>Preview only. A deposit requires an owner signature after local deployment.</small></label>
          <label className="workspace-field" htmlFor="commit-reserve"><div><span>Reserve allocation</span><output>{(draft.reserveBps / 100).toFixed(2)}%</output></div><input id="commit-reserve" type="range" min="0" max="10000" step="100" value={draft.reserveBps} onChange={(event) => update("reserveBps", Number(event.target.value))} /><small>Each deposit rounds fractional units toward the reserve.</small></label>
          <label className="workspace-field" htmlFor="commit-limit"><span>Daily operating allowance</span><div className="amount-input"><input id="commit-limit" value={formatAtomic(BigInt(draft.dailyLimitRaw), 8, 8)} inputMode="decimal" onChange={(event) => { try { update("dailyLimitRaw", parseDecimalToAtomic(event.target.value, 8).toString()); } catch { setMessage("Use a non-negative test-stock amount with up to eight decimals."); } }} /><strong>TEST</strong></div><small>Resets at midnight UTC. Unused allowance does not carry forward.</small></label>
          <label className="workspace-field" htmlFor="commit-executor"><span>Executor wallet</span><input id="commit-executor" value={draft.executor} placeholder="Solana public key" onChange={(event) => update("executor", event.target.value.trim())} /><small>The executor cannot edit the policy or access reserves.</small></label>
          <label className="workspace-field" htmlFor="commit-recipient"><span>Approved recipient wallet</span><input id="commit-recipient" value={draft.recipient} placeholder="Solana public key" onChange={(event) => update("recipient", event.target.value.trim())} /><small>Payments can only reach this recipient’s test-stock account.</small></label>
        </div></section>
        <aside className="allocation-review" aria-labelledby="commit-review"><div className="section-heading"><div><p className="section-kicker">02 · REVIEW</p><h2 id="commit-review">Mandate preview</h2></div><span className="plain-status">{capability?.available ? "Cluster verified" : "Local proof pending"}</span></div><div className="proceeds"><span>Proposed deposit</span><strong>{deposit || "0"}</strong></div><dl className="allocation-lines"><AllocationLine label="Reserved inventory" amount={preview?.reservedRaw ?? 0n} /><AllocationLine label="Operating inventory" amount={preview?.operatingRaw ?? 0n} /><AllocationLine label="Daily allowance" amount={BigInt(draft.dailyLimitRaw || "0")} /></dl><div className="mandate-language"><p>{mandate.reserve}</p><p>{mandate.payment}</p></div><ol className="execution-steps"><Step number="01" label="Save reviewed draft" active /><Step number="02" label="Verify deployed program" active={Boolean(capability?.available)} /><Step number="03" label="Owner signs creation and deposit" active={false} /></ol><div className="commit-capability"><strong>{capability?.available ? "Commit program verified" : "No spend authority is active"}</strong><p>{capability?.available ? `Program ${capability.programId}` : capability?.reason ?? "Checking the configured RPC."}</p></div></aside>
      </section>
      <section className="commit-demo" aria-labelledby="commit-demo-title"><div><p className="section-kicker">LOCAL PROOF</p><h2 id="commit-demo-title">The 100 TEST evidence path</h2><p>This is the exact local-validator flow Banked must prove before it is called active.</p></div><ol><li><strong>Owner deposits 100 TEST.</strong><span>80 TEST enters reserve. 20 TEST enters operating inventory.</span></li><li><strong>Executor pays 6 TEST.</strong><span>The recipient receives 6 TEST and the remaining daily allowance becomes 4 TEST.</span></li><li><strong>Executor submits 5 TEST.</strong><span>The program rejects the over-limit payment with no inventory movement.</span></li><li><strong>Owner revokes and recovers.</strong><span>A new executor request fails. The owner recovers the remaining 94 TEST.</span></li></ol></section>
      <section className="commit-boundaries"><div><p className="section-kicker">AUTHORITY</p><h2>What the executor can do</h2><p>Submit an unexpired payment within the remaining UTC allowance to the approved recipient.</p></div><div><p className="section-kicker">RECOVERY</p><h2>What stays with the owner</h2><p>Pause, revoke, edit future policy, withdraw classified inventory, and recover unexpected deposits.</p></div><div><p className="section-kicker">LIMIT</p><h2>What Commit does not control</h2><p>Issuer-level token powers, assets outside the vault, price changes, and upstream earnings custody.</p></div></section>
      <p className="workspace-message" role="status">{message}</p>
      <footer className="workspace-footer">Commit does not request seed phrases or place a delegated authority on your wallet. Its authority exists only inside a deployed vault program.</footer>
    </main>
  </div>;
}

function AllocationLine({ label, amount }: { label: string; amount: bigint }) { return <div><dt>{label}</dt><dd>{formatAtomic(amount, 8, 8)} <span>TEST</span></dd></div>; }
function Step({ number, label, active }: { number: string; label: string; active: boolean }) { return <li className={active ? "complete" : ""}><span>{active ? <svg aria-hidden="true" viewBox="0 0 16 16" focusable="false"><path d="m3 8 3 3 7-7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg> : number}</span>{label}</li>; }
