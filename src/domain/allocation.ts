export const BASIS_POINTS = 10_000n;
export const MIN_EQUITY_BUDGET_USDC = 10_000_000n;

export type Allocation = {
  proceeds: bigint;
  equityBps: number;
  equityBudget: bigint;
  retainedUsdc: bigint;
};

export function parseDecimalToAtomic(value: string, decimals: number): bigint {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error("Enter a positive decimal amount.");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error(`This amount supports at most ${decimals} decimal places.`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals));
}

export function formatAtomic(amount: bigint, decimals: number, precision = decimals): string {
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const fraction = (amount % scale).toString().padStart(decimals, "0").slice(0, precision).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function allocateProceeds(proceeds: bigint, equityBps: number): Allocation {
  if (!Number.isInteger(equityBps) || equityBps < 0 || equityBps > 100) {
    throw new Error("Equity allocation must be a whole percentage from 0 to 100.");
  }
  if (proceeds < 0n) throw new Error("Proceeds cannot be negative.");
  const equityBudget = (proceeds * BigInt(equityBps * 100)) / BASIS_POINTS;
  return { proceeds, equityBps, equityBudget, retainedUsdc: proceeds - equityBudget };
}

export function hasEconomicEquityBudget(allocation: Allocation): boolean {
  return allocation.equityBps === 0 || allocation.equityBudget >= MIN_EQUITY_BUDGET_USDC;
}

export type RulePercentages = {
  spyxBps: number;
  jupBps: number;
};

export type DestinationAllocation = {
  bps: number;
  budget: bigint;
  eligible: boolean;
};

export type RuleAllocation = {
  proceeds: bigint;
  spyx: DestinationAllocation;
  jup: DestinationAllocation;
  retainedUsdc: bigint;
};

export function validateRulePercentages(percentages: RulePercentages): void {
  for (const percentage of Object.values(percentages)) {
    if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
      throw new Error("Each destination allocation must be a whole percentage from 0 to 100.");
    }
  }
  if (percentages.spyxBps + percentages.jupBps > 100) {
    throw new Error("Destination allocations cannot exceed 100% of proceeds.");
  }
}

export function allocateRuleProceeds(proceeds: bigint, percentages: RulePercentages): RuleAllocation {
  if (proceeds < 0n) throw new Error("Proceeds cannot be negative.");
  validateRulePercentages(percentages);
  const budget = (percentage: number) => (proceeds * BigInt(percentage * 100)) / BASIS_POINTS;
  const spyxBudget = budget(percentages.spyxBps);
  const jupBudget = budget(percentages.jupBps);
  return {
    proceeds,
    spyx: { bps: percentages.spyxBps, budget: spyxBudget, eligible: percentages.spyxBps > 0 && spyxBudget >= MIN_EQUITY_BUDGET_USDC },
    jup: { bps: percentages.jupBps, budget: jupBudget, eligible: percentages.jupBps > 0 && jupBudget >= MIN_EQUITY_BUDGET_USDC },
    retainedUsdc: proceeds - spyxBudget - jupBudget,
  };
}
