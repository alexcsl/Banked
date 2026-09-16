import { describe, expect, it } from "vitest";
import { allocateCommitDeposit, remainingDailyAllowance, reserveShare, unclassifiedInventory, utcPeriodId } from "@/domain/commit/policy";

describe("Commit deposit accounting", () => {
  it("rounds every deposit toward the reserve", () => {
    expect(allocateCommitDeposit(100n, 8_000)).toEqual({ reservedRaw: 80n, operatingRaw: 20n });
    expect(allocateCommitDeposit(1n, 8_000)).toEqual({ reservedRaw: 1n, operatingRaw: 0n });
  });

  it("does not reserve less when deposits are fragmented", () => {
    const fragmented = reserveShare(1n, 3_333) + reserveShare(1n, 3_333) + reserveShare(1n, 3_333);
    expect(fragmented).toBeGreaterThanOrEqual(reserveShare(3n, 3_333));
  });

  it("resets the allowance only on a later UTC day", () => {
    expect(utcPeriodId(86_400n)).toBe(1n);
    expect(remainingDailyAllowance(10n, 6n, 1n, 86_499n)).toBe(4n);
    expect(remainingDailyAllowance(10n, 6n, 1n, 172_800n)).toBe(10n);
  });

  it("does not classify unsolicited deposits as executor inventory", () => {
    expect(unclassifiedInventory({ reservedRaw: 80n, operatingRaw: 20n, actualReserveRaw: 82n, actualOperatingRaw: 25n })).toBe(7n);
  });
});
