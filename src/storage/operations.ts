import type { BankedOperation } from "@/domain/operation";
import { createExitRule, reconcileRuleSale, type RuleOperation } from "@/domain/rules";

const storageKey = "banked:operations:v1";
const ruleStorageKey = "banked:rules:v1";
const ruleOperationStorageKey = "banked:rule-operations:v1";

export function loadOperations(): BankedOperation[] {
  if (typeof window === "undefined") return [];
  try {
    const value = window.localStorage.getItem(storageKey);
    return value ? JSON.parse(value) as BankedOperation[] : [];
  } catch {
    return [];
  }
}

export function saveOperation(operation: BankedOperation): void {
  const operations = loadOperations();
  const index = operations.findIndex((candidate) => candidate.id === operation.id);
  if (index >= 0) operations[index] = operation;
  else operations.unshift(operation);
  window.localStorage.setItem(storageKey, JSON.stringify(operations.slice(0, 50)));
}

export function migrateLegacyOperation(candidate: BankedOperation): RuleOperation {
  const rule = createExitRule("Imported SPYx rule", { spyxBps: candidate.equityBps, jupBps: 0 }, candidate.createdAt);
  rule.id = `legacy-rule-${candidate.id}`;
  rule.updatedAt = candidate.updatedAt;
  const saleStatus = candidate.status === "reconciliation-required" ? "reconciliation-required" : candidate.actualProceeds ? "finalized" : candidate.status === "sale-submitted" ? "submitted" : "prepared";
  const spyxStatus = candidate.status === "complete" ? "finalized" : candidate.status === "equity-prepared" ? "prepared" : candidate.status === "equity-submitted" ? "submitted" : candidate.status === "allocation-pending" ? "pending" : "skipped";
  const migrated: RuleOperation = {
    id: candidate.id,
    wallet: candidate.wallet,
    rule,
    saleStatus,
    saleSignature: candidate.saleSignature,
    actualProceeds: candidate.actualProceeds,
    purchases: {
      spyx: { destinationId: "spyx", budget: "0", status: spyxStatus, signature: candidate.equitySignature },
      jup: { destinationId: "jup", budget: "0", status: "skipped" },
    },
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
  const reconciled = candidate.actualProceeds ? reconcileRuleSale(migrated, BigInt(candidate.actualProceeds)) : migrated;
  return {
    ...reconciled,
    saleStatus,
    purchases: {
      ...reconciled.purchases,
      spyx: { ...reconciled.purchases.spyx, status: spyxStatus, signature: candidate.equitySignature },
    },
  };
}

export function loadRules(): ReturnType<typeof createExitRule>[] {
  if (typeof window === "undefined") return [];
  try {
    const value = window.localStorage.getItem(ruleStorageKey);
    return value ? JSON.parse(value) as ReturnType<typeof createExitRule>[] : [];
  } catch {
    return [];
  }
}

export function saveRule(rule: ReturnType<typeof createExitRule>): void {
  const rules = loadRules();
  const index = rules.findIndex((candidate) => candidate.id === rule.id);
  if (index >= 0) rules[index] = rule;
  else rules.unshift(rule);
  window.localStorage.setItem(ruleStorageKey, JSON.stringify(rules.slice(0, 50)));
}

export function deleteRule(id: string): void {
  window.localStorage.setItem(ruleStorageKey, JSON.stringify(loadRules().filter((rule) => rule.id !== id)));
}

export function loadRuleOperations(): RuleOperation[] {
  if (typeof window === "undefined") return [];
  try {
    const value = window.localStorage.getItem(ruleOperationStorageKey);
    if (value) return JSON.parse(value) as RuleOperation[];
    const legacy = loadOperations();
    const migrated = legacy.map(migrateLegacyOperation);
    if (migrated.length) window.localStorage.setItem(ruleOperationStorageKey, JSON.stringify(migrated.slice(0, 50)));
    return migrated;
  } catch {
    return [];
  }
}

export function saveRuleOperation(operation: RuleOperation): void {
  const operations = loadRuleOperations();
  const index = operations.findIndex((candidate) => candidate.id === operation.id);
  if (index >= 0) operations[index] = operation;
  else operations.unshift(operation);
  window.localStorage.setItem(ruleOperationStorageKey, JSON.stringify(operations.slice(0, 50)));
}
