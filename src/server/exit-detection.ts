import { PublicKey, type Connection } from "@solana/web3.js";
import { USDC_MINT } from "@/domain/assets";

type TokenBalance = { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string } };

type TransactionForDetection = {
  slot: number;
  blockTime?: number | null;
  meta: {
    err: unknown;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: TokenBalance[] | null;
    postTokenBalances?: TokenBalance[] | null;
  } | null;
  transaction: { message: { staticAccountKeys: { toBase58: () => string }[] } };
};

export type DetectedExit = {
  signature: string;
  slot: number;
  blockTime: number | null;
  solDebited: string;
  usdcReceived: string;
};

function tokenDelta(balances: NonNullable<TransactionForDetection["meta"]>, wallet: string, mint: string): bigint {
  const entries = new Map<number, { pre: bigint; post: bigint }>();
  for (const balance of balances.preTokenBalances ?? []) {
    if (balance.owner !== wallet || balance.mint !== mint) continue;
    entries.set(balance.accountIndex, { pre: BigInt(balance.uiTokenAmount.amount), post: 0n });
  }
  for (const balance of balances.postTokenBalances ?? []) {
    if (balance.owner !== wallet || balance.mint !== mint) continue;
    const existing = entries.get(balance.accountIndex) ?? { pre: 0n, post: 0n };
    existing.post = BigInt(balance.uiTokenAmount.amount);
    entries.set(balance.accountIndex, existing);
  }
  return [...entries.values()].reduce((total, entry) => total + entry.post - entry.pre, 0n);
}

export function detectSolToUsdcExit(transaction: TransactionForDetection, wallet: string, signature: string): DetectedExit | null {
  if (!transaction.meta || transaction.meta.err) return null;
  const walletIndex = transaction.transaction.message.staticAccountKeys.findIndex((key) => key.toBase58() === wallet);
  if (walletIndex < 0) return null;
  const solDelta = BigInt(transaction.meta.postBalances[walletIndex] ?? 0) - BigInt(transaction.meta.preBalances[walletIndex] ?? 0);
  const usdcDelta = tokenDelta(transaction.meta, wallet, USDC_MINT);
  if (solDelta >= 0n || usdcDelta <= 0n) return null;
  return {
    signature,
    slot: transaction.slot,
    blockTime: transaction.blockTime ?? null,
    solDebited: (-solDelta).toString(),
    usdcReceived: usdcDelta.toString(),
  };
}

export async function findRecentSolToUsdcExits(connection: Connection, wallet: string, limit = 12): Promise<DetectedExit[]> {
  const address = new PublicKey(wallet);
  const signatures = await connection.getSignaturesForAddress(address, { limit }, "finalized");
  const candidates = await Promise.all(signatures.filter((entry) => !entry.err).map(async (entry) => {
    const transaction = await connection.getTransaction(entry.signature, { commitment: "finalized", maxSupportedTransactionVersion: 0 });
    return transaction ? detectSolToUsdcExit(transaction, wallet, entry.signature) : null;
  }));
  return candidates.filter((candidate): candidate is DetectedExit => candidate !== null);
}
