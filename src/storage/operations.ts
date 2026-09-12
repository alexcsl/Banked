import type { BankedOperation } from "@/domain/operation";

const storageKey = "banked:operations:v1";

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
