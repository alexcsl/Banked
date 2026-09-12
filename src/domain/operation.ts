export type OperationStage = "sale" | "equity";
export type OperationStatus =
  | "draft"
  | "sale-prepared"
  | "sale-submitted"
  | "sale-finalized"
  | "equity-prepared"
  | "equity-submitted"
  | "complete"
  | "reconciliation-required"
  | "allocation-pending";

export type BankedOperation = {
  id: string;
  wallet: string;
  status: OperationStatus;
  equityBps: number;
  saleSignature?: string;
  equitySignature?: string;
  actualProceeds?: string;
  createdAt: string;
  updatedAt: string;
};

const allowedTransitions: Record<OperationStatus, OperationStatus[]> = {
  draft: ["sale-prepared"],
  "sale-prepared": ["sale-submitted"],
  "sale-submitted": ["sale-finalized", "reconciliation-required"],
  "sale-finalized": ["equity-prepared", "allocation-pending"],
  "equity-prepared": ["equity-submitted", "allocation-pending"],
  "equity-submitted": ["complete", "allocation-pending", "reconciliation-required"],
  complete: [],
  "reconciliation-required": ["sale-finalized", "allocation-pending", "complete"],
  "allocation-pending": ["equity-prepared"],
};

export function transitionOperation(operation: BankedOperation, nextStatus: OperationStatus): BankedOperation {
  if (!allowedTransitions[operation.status].includes(nextStatus)) {
    throw new Error(`Cannot move an operation from ${operation.status} to ${nextStatus}.`);
  }
  return { ...operation, status: nextStatus, updatedAt: new Date().toISOString() };
}

export function requiresReconciliation(operation: BankedOperation): boolean {
  return operation.status === "reconciliation-required" || operation.status.endsWith("submitted");
}
