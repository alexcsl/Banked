import { describe, expect, it } from "vitest";
import { createExitRule, createRuleOperation, reconcileRuleSale, summarizeRuleOperations, updatePurchase } from "@/domain/rules";

describe("curated rule operations", () => {
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
});
