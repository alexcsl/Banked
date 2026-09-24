import { allocateRuleProceeds, parseDecimalToAtomic, type RulePercentages } from "@/domain/allocation";
import { type PurchaseDestinationId } from "@/domain/assets";

export type ExitRule = RulePercentages & {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  solToKeepLamports: string | null;
  status: "paused" | "active";
};

export type PurchaseStatus = "ready" | "prepared" | "submitted" | "finalized" | "pending" | "skipped";

export type DestinationPurchase = {
  destinationId: PurchaseDestinationId;
  budget: string;
  status: PurchaseStatus;
  signature?: string;
  expectedOutput?: string;
  actualOutput?: string;
  usdcSpent?: string;
};

export type RuleOperation = {
  id: string;
  wallet: string;
  rule: ExitRule;
  saleStatus: "prepared" | "submitted" | "finalized" | "reconciliation-required";
  saleSignature?: string;
  saleSource?: "banked" | "detected";
  actualProceeds?: string;
  purchases: Record<PurchaseDestinationId, DestinationPurchase>;
  createdAt: string;
  updatedAt: string;
};

export const exitRuleTemplates = [
  { id: "de-risk-rally", name: "De-risk rally", description: "Move a portion of a SOL exit into SPYx and JUP while retaining dry powder.", spyxBps: 20, jupBps: 20 },
  { id: "bank-into-stocks", name: "Bank into stocks", description: "Prioritize SPYx exposure after a volatile-token exit.", spyxBps: 50, jupBps: 0 },
  { id: "keep-dry-powder", name: "Keep dry powder", description: "Make smaller destination purchases and retain most proceeds as USDC.", spyxBps: 10, jupBps: 10 },
] as const;

export type ExitDisciplineSummary = {
  totalRules: number;
  completedRules: number;
  pendingPurchases: number;
  retainedUsdc: bigint;
};

export type MoneyFlowSummary = {
  proceeds: bigint;
  routedSpyx: bigint;
  routedJup: bigint;
  awaitingAction: bigint;
  unverified: bigint;
  plannedRetained: bigint;
  completedExits: number;
  exitsNeedingAction: number;
};

export function calculateExcessSol(balanceLamports: bigint, keepLamports: bigint): bigint {
  if (balanceLamports < 0n || keepLamports < 0n) throw new Error("SOL balances cannot be negative.");
  const minimumBalance = keepLamports > 5_000_000n ? keepLamports : 5_000_000n;
  return balanceLamports > minimumBalance ? balanceLamports - minimumBalance : 0n;
}

export function createExitRule(name: string, percentages: RulePercentages, now = new Date().toISOString(), solToKeep?: string): ExitRule {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Enter a name for this exit rule.");
  if (trimmedName.length > 60) throw new Error("Rule names must be 60 characters or fewer.");
  allocateRuleProceeds(0n, percentages);
  const solToKeepLamports = solToKeep === undefined ? null : parseDecimalToAtomic(solToKeep, 9).toString();
  return { id: crypto.randomUUID(), name: trimmedName, ...percentages, createdAt: now, updatedAt: now, solToKeepLamports, status: "paused" };
}

export function createRuleOperation(rule: ExitRule, wallet: string, saleStatus: RuleOperation["saleStatus"] = "prepared"): RuleOperation {
  const allocation = allocateRuleProceeds(0n, { spyxBps: rule.spyxBps, jupBps: rule.jupBps });
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), wallet, rule, saleStatus, saleSource: "banked",
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

export function summarizeRuleOperations(operations: RuleOperation[]): ExitDisciplineSummary {
  return operations.reduce<ExitDisciplineSummary>((summary, operation) => {
    if (operation.saleStatus !== "finalized" || !operation.actualProceeds) return summary;
    const allocation = allocateRuleProceeds(BigInt(operation.actualProceeds), { spyxBps: operation.rule.spyxBps, jupBps: operation.rule.jupBps });
    const purchases = Object.values(operation.purchases);
    const completed = purchases.every((purchase) => purchase.status === "finalized" || purchase.status === "skipped");
    return {
      totalRules: summary.totalRules + 1,
      completedRules: summary.completedRules + Number(completed),
      pendingPurchases: summary.pendingPurchases + purchases.filter((purchase) => !["finalized", "skipped"].includes(purchase.status)).length,
      retainedUsdc: summary.retainedUsdc + allocation.retainedUsdc,
    };
  }, { totalRules: 0, completedRules: 0, pendingPurchases: 0, retainedUsdc: 0n });
}

export function summarizeMoneyFlow(operations: RuleOperation[]): MoneyFlowSummary {
  return operations.reduce<MoneyFlowSummary>((summary, operation) => {
    if (operation.saleStatus !== "finalized" || !operation.actualProceeds) return summary;
    const proceeds = BigInt(operation.actualProceeds);
    const allocation = allocateRuleProceeds(proceeds, { spyxBps: operation.rule.spyxBps, jupBps: operation.rule.jupBps });
    const routed = (destinationId: PurchaseDestinationId) => {
      const purchase = operation.purchases[destinationId];
      if (purchase.status !== "finalized") return 0n;
      return purchase.usdcSpent === undefined ? 0n : BigInt(purchase.usdcSpent);
    };
    const routedSpyx = routed("spyx");
    const routedJup = routed("jup");
    const purchases = Object.values(operation.purchases);
    const needsAction = purchases.some((purchase) => !["finalized", "skipped"].includes(purchase.status));
    const awaitingAction = purchases.reduce((total, purchase) => total + (!["finalized", "skipped"].includes(purchase.status) ? BigInt(purchase.budget) : 0n), 0n);
    const unverified = purchases.reduce((total, purchase) => total + (purchase.status === "finalized" && purchase.usdcSpent === undefined ? BigInt(purchase.budget) : 0n), 0n);
    return {
      proceeds: summary.proceeds + proceeds,
      routedSpyx: summary.routedSpyx + routedSpyx,
      routedJup: summary.routedJup + routedJup,
      awaitingAction: summary.awaitingAction + awaitingAction,
      unverified: summary.unverified + unverified,
      plannedRetained: summary.plannedRetained + allocation.retainedUsdc,
      completedExits: summary.completedExits + 1,
      exitsNeedingAction: summary.exitsNeedingAction + Number(needsAction),
    };
  }, { proceeds: 0n, routedSpyx: 0n, routedJup: 0n, awaitingAction: 0n, unverified: 0n, plannedRetained: 0n, completedExits: 0, exitsNeedingAction: 0 });
}
