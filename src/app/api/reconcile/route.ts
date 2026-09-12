import { NextResponse } from "next/server";
import { z } from "zod";
import { getPurchaseAsset, type PurchaseDestinationId, USDC_MINT } from "@/domain/assets";
import { getRpcConnection } from "@/server/solana";

const requestSchema = z.object({
  stage: z.enum(["sale", "purchase"]),
  destinationId: z.enum(["spyx", "jup"]).optional(),
  wallet: z.string().min(32).max(44),
  signature: z.string().min(32).max(128),
});

type TokenBalance = { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string } };

function tokenDelta(balances: { preTokenBalances?: TokenBalance[] | null; postTokenBalances?: TokenBalance[] | null }, wallet: string, mint: string): bigint {
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

export function hasExpectedReconciliation(stage: "sale" | "purchase", usdcDelta: bigint, destinationDelta: bigint): boolean {
  return stage === "sale" ? usdcDelta > 0n : usdcDelta < 0n && destinationDelta > 0n;
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid reconciliation request." }, { status: 400 });
  if (parsed.data.stage === "purchase" && !parsed.data.destinationId) {
    return NextResponse.json({ error: "A purchase destination is required." }, { status: 400 });
  }

  try {
    const transaction = await getRpcConnection().getTransaction(parsed.data.signature, {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    });
    if (!transaction) return NextResponse.json({ status: "pending" });
    if (transaction.meta?.err) return NextResponse.json({ status: "failed", error: transaction.meta.err });

    const usdcDelta = tokenDelta(transaction.meta ?? {}, parsed.data.wallet, USDC_MINT);
    const destination = parsed.data.stage === "purchase" ? getPurchaseAsset(parsed.data.destinationId as PurchaseDestinationId) : null;
    const destinationDelta = destination ? tokenDelta(transaction.meta ?? {}, parsed.data.wallet, destination.mint) : 0n;
    const expectedDelta = hasExpectedReconciliation(parsed.data.stage, usdcDelta, destinationDelta);
    if (!expectedDelta) return NextResponse.json({ status: "ambiguous", usdcDelta: usdcDelta.toString(), destinationDelta: destinationDelta.toString() });

    return NextResponse.json({
      status: "finalized",
      slot: transaction.slot,
      feeLamports: transaction.meta?.fee.toString() ?? "0",
      usdcDelta: usdcDelta.toString(),
      destinationId: destination?.id ?? null,
      destinationDelta: destinationDelta.toString(),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reconciliation failed." }, { status: 503 });
  }
}
