import { describe, expect, it } from "vitest";
import { allocateProceeds, allocateRuleProceeds, parseDecimalToAtomic } from "@/domain/allocation";

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

  it("allocates independent SPYx and JUP budgets and retains the remainder", () => {
    const result = allocateRuleProceeds(100_000_000n, { spyxBps: 20, jupBps: 20 });
    expect(result.spyx.budget).toBe(20_000_000n);
    expect(result.jup.budget).toBe(20_000_000n);
    expect(result.retainedUsdc).toBe(60_000_000n);
    expect(result.spyx.eligible).toBe(true);
    expect(result.jup.eligible).toBe(true);
  });

  it("skips a destination below the economic minimum while retaining its budget", () => {
    const result = allocateRuleProceeds(20_000_000n, { spyxBps: 20, jupBps: 0 });
    expect(result.spyx.eligible).toBe(false);
    expect(result.retainedUsdc).toBe(16_000_000n);
  });

  it("rejects combined destination allocations above 100 percent", () => {
    expect(() => allocateRuleProceeds(1n, { spyxBps: 60, jupBps: 50 })).toThrow("cannot exceed");
  });
});
