export const COMMIT_SCHEMA_VERSION = 1;
export const COMMIT_BPS_DENOMINATOR = 10_000n;
export const COMMIT_DAY_SECONDS = 86_400n;

export type CommitPolicyV1 = {
  schemaVersion: typeof COMMIT_SCHEMA_VERSION;
  reserveBps: number;
  dailyLimitRaw: string;
  executor: string;
  recipient: string;
};

export type CommitRequestV1 = {
  vault: string;
  sequence: string;
  policyVersion: string;
  amount: string;
  expiresAt: string;
};

export type CommitBalances = {
  reservedRaw: bigint;
  operatingRaw: bigint;
  actualReserveRaw: bigint;
  actualOperatingRaw: bigint;
};

export function validateCommitPolicy(policy: CommitPolicyV1): void {
  if (!Number.isInteger(policy.reserveBps) || policy.reserveBps < 0 || policy.reserveBps > 10_000) {
    throw new Error("Reserve allocation must be a whole number from 0 to 10,000 basis points.");
  }
  if (!/^\d+$/.test(policy.dailyLimitRaw)) throw new Error("Daily allowance must be an atomic whole number.");
  if (!isPublicKeyLike(policy.executor)) throw new Error("Choose an executor wallet.");
  if (!isPublicKeyLike(policy.recipient)) throw new Error("Choose an approved recipient wallet.");
}

export function reserveShare(amount: bigint, reserveBps: number): bigint {
  if (amount < 0n) throw new Error("Deposit amount cannot be negative.");
  if (!Number.isInteger(reserveBps) || reserveBps < 0 || reserveBps > 10_000) throw new Error("Reserve allocation is invalid.");
  return (amount * BigInt(reserveBps) + COMMIT_BPS_DENOMINATOR - 1n) / COMMIT_BPS_DENOMINATOR;
}

export function allocateCommitDeposit(amount: bigint, reserveBps: number) {
  const reservedRaw = reserveShare(amount, reserveBps);
  return { reservedRaw, operatingRaw: amount - reservedRaw };
}

export function utcPeriodId(timestampSeconds: bigint): bigint {
  if (timestampSeconds < 0n) throw new Error("Timestamp cannot be before the Unix epoch.");
  return timestampSeconds / COMMIT_DAY_SECONDS;
}

export function remainingDailyAllowance(limit: bigint, spent: bigint, periodId: bigint, now: bigint) {
  if (limit < 0n || spent < 0n) throw new Error("Allowance accounting cannot be negative.");
  const currentPeriod = utcPeriodId(now);
  if (currentPeriod < periodId) throw new Error("Clock period moved backwards.");
  return currentPeriod > periodId ? limit : limit > spent ? limit - spent : 0n;
}

export function unclassifiedInventory(balances: CommitBalances) {
  const reserve = balances.actualReserveRaw > balances.reservedRaw ? balances.actualReserveRaw - balances.reservedRaw : 0n;
  const operating = balances.actualOperatingRaw > balances.operatingRaw ? balances.actualOperatingRaw - balances.operatingRaw : 0n;
  return reserve + operating;
}

export function describeCommitMandate(policy: Pick<CommitPolicyV1, "reserveBps" | "dailyLimitRaw" | "executor" | "recipient">, decimals = 8) {
  const reservePercent = (policy.reserveBps / 100).toFixed(policy.reserveBps % 100 === 0 ? 0 : 2);
  const allowance = formatCommitAmount(policy.dailyLimitRaw, decimals);
  const executor = policy.executor || "the executor you choose";
  const recipient = policy.recipient || "the recipient you approve";

  return {
    reserve: `${reservePercent}% of each deposit is classified as reserve inventory.`,
    payment: `${executor} can send up to ${allowance} TEST each UTC day, only to ${recipient}.`,
  };
}

function formatCommitAmount(amount: string, decimals: number) {
  try {
    const raw = BigInt(amount);
    const unit = 10n ** BigInt(decimals);
    const whole = raw / unit;
    const fraction = (raw % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
    return fraction ? `${whole}.${fraction}` : whole.toString();
  } catch {
    return "0";
  }
}

function isPublicKeyLike(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}
