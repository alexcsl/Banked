import { allocateRuleProceeds, type RulePercentages } from "@/domain/allocation";
import { type PurchaseDestinationId } from "@/domain/assets";

export type ExitRule = RulePercentages & {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseStatus = "ready" | "prepared" | "submitted" | "finalized" | "pending" | "skipped";

export type DestinationPurchase = {
  destinationId: PurchaseDestinationId;
  budget: string;
  status: PurchaseStatus;
  signature?: string;
  expectedOutput?: string;
  actualOutput?: string;
};

export type RuleOperation = {
  id: string;
  wallet: string;
  rule: ExitRule;
  saleStatus: "prepared" | "submitted" | "finalized" | "reconciliation-required";
  saleSignature?: string;
  actualProceeds?: string;
  purchases: Record<PurchaseDestinationId, DestinationPurchase>;
  createdAt: string;
  updatedAt: string;
};

export function createExitRule(name: string, percentages: RulePercentages, now = new Date().toISOString()): ExitRule {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Enter a name for this exit rule.");
  if (trimmedName.length > 60) throw new Error("Rule names must be 60 characters or fewer.");
  allocateRuleProceeds(0n, percentages);
  return { id: crypto.randomUUID(), name: trimmedName, ...percentages, createdAt: now, updatedAt: now };
}

export function createRuleOperation(rule: ExitRule, wallet: string, saleStatus: RuleOperation["saleStatus"] = "prepared"): RuleOperation {
  const allocation = allocateRuleProceeds(0n, { spyxBps: rule.spyxBps, jupBps: rule.jupBps });
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), wallet, rule, saleStatus,
    purchases: {
      spyx: { destinationId: "spyx", budget: allocation.spyx.budget.toString(), status: "skipped" },
      jup: { destinationId: "jup", budget: allocation.jup.budget.toString(), status: "skipped" },
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function reconcileRuleSale(operation: RuleOperation, proceeds: bigint): RuleOperation {
  const allocation = allocateRuleProceeds(proceeds, { spyxBps: operation.rule.spyxBps, jupBps: operation.rule.jupBps });
  const purchase = (destinationId: PurchaseDestinationId) => {
    const target = allocation[destinationId];
    return { destinationId, budget: target.budget.toString(), status: target.eligible ? "ready" : "skipped" } as DestinationPurchase;
  };
  return { ...operation, saleStatus: "finalized", actualProceeds: proceeds.toString(), purchases: { spyx: purchase("spyx"), jup: purchase("jup") }, updatedAt: new Date().toISOString() };
}

export function updatePurchase(operation: RuleOperation, destinationId: PurchaseDestinationId, changes: Partial<DestinationPurchase>): RuleOperation {
  return { ...operation, purchases: { ...operation.purchases, [destinationId]: { ...operation.purchases[destinationId], ...changes } }, updatedAt: new Date().toISOString() };
}
