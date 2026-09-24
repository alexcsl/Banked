import { NextResponse } from "next/server";
import { z } from "zod";
import { getPurchaseAsset, type PurchaseDestinationId, SOL_MINT, USDC_MINT } from "@/domain/assets";
import { inspectTransaction } from "@/server/transaction-inspection";
import { PublicKey } from "@solana/web3.js";
import { calculateExcessSol } from "@/domain/rules";
import { getRpcConnection } from "@/server/solana";

const requestSchema = z.object({
  stage: z.enum(["sale", "purchase"]),
  destinationId: z.enum(["spyx", "jup"]).optional(),
  taker: z.string().min(32).max(44),
  amount: z.string().regex(/^\d+$/).refine((value) => BigInt(value) > 0n),
  solToKeepLamports: z.string().regex(/^\d+$/).optional(),
});

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_BANKED_MODE !== "live" || process.env.BANKED_LIVE_ENABLED !== "true") {
    return NextResponse.json({ error: "Live order preparation is disabled." }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid order request." }, { status: 400 });

  const { stage, taker, amount } = parsed.data;
  if (stage === "purchase" && !parsed.data.destinationId) {
    return NextResponse.json({ error: "A purchase destination is required." }, { status: 400 });
  }
  if (stage === "sale") {
    if (parsed.data.solToKeepLamports === undefined) return NextResponse.json({ error: "Set the SOL balance to keep before preparing a sale." }, { status: 400 });
    try {
      const balance = BigInt(await getRpcConnection().getBalance(new PublicKey(taker), "confirmed"));
      const excess = calculateExcessSol(balance, BigInt(parsed.data.solToKeepLamports));
      if (BigInt(amount) > excess) return NextResponse.json({ error: "Wallet balance no longer has that much SOL above your trade balance. Refresh and review again." }, { status: 409 });
    } catch {
      return NextResponse.json({ error: "The wallet balance could not be verified." }, { status: 503 });
    }
  }
  const destination = stage === "purchase" ? getPurchaseAsset(parsed.data.destinationId as PurchaseDestinationId) : null;
  const params = new URLSearchParams({
    inputMint: stage === "sale" ? SOL_MINT : USDC_MINT,
    outputMint: stage === "sale" ? USDC_MINT : destination!.mint,
    amount,
    taker,
    slippageBps: "50",
  });
  const apiKey = process.env.JUPITER_API_KEY;
  const response = await fetch(`https://api.jup.ag/swap/v2/order?${params}`, {
    headers: apiKey ? { "x-api-key": apiKey } : {},
    cache: "no-store",
  });
  if (!response.ok) return NextResponse.json({ error: "The order provider is unavailable." }, { status: 503 });

  const order = await response.json();
  if (!order.transaction) return NextResponse.json({ error: order.errorMessage ?? "No executable transaction was returned." }, { status: 422 });

  let inspection;
  try {
    inspection = await inspectTransaction(order.transaction, taker);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Transaction inspection failed." }, { status: 422 });
  }

  return NextResponse.json({
    stage,
    destinationId: destination?.id ?? null,
    requestId: order.requestId,
    transaction: order.transaction,
    expectedOutput: order.outAmount,
    minimumOutput: order.otherAmountThreshold,
    feeBps: order.feeBps,
    feeMint: order.feeMint,
    lastValidBlockHeight: order.lastValidBlockHeight ?? null,
    expiresAt: order.expireAt ?? null,
    router: order.router,
    inspection,
  });
}
