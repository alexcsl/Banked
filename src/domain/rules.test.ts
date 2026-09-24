import { describe, expect, it } from "vitest";
import { calculateExcessSol, createExitRule, createRuleOperation, reconcileRuleSale, summarizeMoneyFlow, summarizeRuleOperations, updatePurchase } from "@/domain/rules";

describe("curated rule operations", () => {
  it("sells only SOL above the trade balance", () => {
    const keep = 10_000_000_000n;
    expect(calculateExcessSol(0n, keep)).toBe(0n);
    expect(calculateExcessSol(9_000_000_000n, keep)).toBe(0n);
    expect(calculateExcessSol(10_000_000_000n, keep)).toBe(0n);
    expect(calculateExcessSol(11_000_000_000n, keep)).toBe(1_000_000_000n);
    expect(calculateExcessSol(1_000_000_000n, 0n)).toBe(995_000_000n);
  });

  it("creates a paused rule with a precise SOL target", () => {
    const rule = createExitRule("Keep capital", { spyxBps: 20, jupBps: 20 }, "2026-09-12T00:00:00.000Z", "10.123456789");
    expect(rule.status).toBe("paused");
    expect(rule.solToKeepLamports).toBe("10123456789");
  });
  it("allows either destination to finalize independently", () => {
    const rule = createExitRule("De-risk", { spyxBps: 20, jupBps: 20 }, "2026-09-12T00:00:00.000Z");
    const sale = reconcileRuleSale(createRuleOperation(rule, "wallet"), 100_000_000n);
    const jupComplete = updatePurchase(sale, "jup", { status: "finalized", signature: "jup-signature" });
    expect(jupComplete.purchases.jup.status).toBe("finalized");
    expect(jupComplete.purchases.spyx.status).toBe("ready");
  });

  it("marks low-value destination budgets as skipped after sale reconciliation", () => {
    const rule = createExitRule("Small exit", { spyxBps: 20, jupBps: 20 }, "2026-09-12T00:00:00.000Z");
    const sale = reconcileRuleSale(createRuleOperation(rule, "wallet"), 20_000_000n);
    expect(sale.purchases.spyx.status).toBe("skipped");
    expect(sale.purchases.jup.status).toBe("skipped");
  });

  it("summarizes completed rules, pending purchases, and retained USDC", () => {
    const rule = createExitRule("De-risk", { spyxBps: 20, jupBps: 20 }, "2026-09-12T00:00:00.000Z");
    const sale = reconcileRuleSale(createRuleOperation(rule, "wallet"), 100_000_000n);
    const complete = updatePurchase(updatePurchase(sale, "spyx", { status: "finalized" }), "jup", { status: "finalized" });
    const incomplete = updatePurchase(sale, "spyx", { status: "prepared" });
    expect(summarizeRuleOperations([complete, incomplete])).toEqual({ totalRules: 2, completedRules: 1, pendingPurchases: 2, retainedUsdc: 120_000_000n });
  });

  it("separates recorded debits from pending budgets and planned retention", () => {
    const rule = createExitRule("De-risk", { spyxBps: 20, jupBps: 20 }, "2026-09-12T00:00:00.000Z");
    const sale = reconcileRuleSale(createRuleOperation(rule, "fixture"), 100_000_000n);
    const partial = updatePurchase(sale, "spyx", { status: "finalized", usdcSpent: "19000000" });
    expect(summarizeMoneyFlow([partial])).toEqual({
      proceeds: 100_000_000n,
      routedSpyx: 19_000_000n,
      routedJup: 0n,
      awaitingAction: 20_000_000n,
      unverified: 0n,
      plannedRetained: 60_000_000n,
      completedExits: 1,
      exitsNeedingAction: 1,
    });
    const older = updatePurchase(partial, "jup", { status: "finalized" });
    expect(summarizeMoneyFlow([older]).unverified).toBe(20_000_000n);
  });
});
