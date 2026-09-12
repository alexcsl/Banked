import { describe, expect, it } from "vitest";
import { transitionOperation, type BankedOperation } from "@/domain/operation";

const operation: BankedOperation = {
  id: "op_1",
  wallet: "wallet",
  status: "sale-submitted",
  equityBps: 20,
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
};

describe("operation state", () => {
  it("preserves a submitted sale while marking uncertain RPC state", () => {
    expect(transitionOperation(operation, "reconciliation-required").status).toBe("reconciliation-required");
  });

  it("does not allow a completed operation to be repeated", () => {
    const complete = { ...operation, status: "complete" as const };
    expect(() => transitionOperation(complete, "equity-prepared")).toThrow("Cannot move");
  });
});
