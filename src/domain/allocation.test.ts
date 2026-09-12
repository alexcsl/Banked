import { describe, expect, it } from "vitest";
import { allocateProceeds, parseDecimalToAtomic } from "@/domain/allocation";

describe("allocation", () => {
  it("uses integer arithmetic and assigns dust to retained USDC", () => {
    const result = allocateProceeds(500_123_456n, 20);
    expect(result.equityBudget).toBe(100_024_691n);
    expect(result.retainedUsdc).toBe(400_098_765n);
    expect(result.equityBudget + result.retainedUsdc).toBe(result.proceeds);
  });

  it("rejects excessive decimals", () => {
    expect(() => parseDecimalToAtomic("1.0000001", 6)).toThrow("at most 6");
  });

  it("rejects allocations outside the allowed range", () => {
    expect(() => allocateProceeds(1n, 101)).toThrow("whole percentage");
  });
});
