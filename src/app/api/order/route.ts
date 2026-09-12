import { NextResponse } from "next/server";
import { z } from "zod";
import { SOL_MINT, SPYX_MINT, USDC_MINT } from "@/domain/assets";
import { inspectTransaction } from "@/server/transaction-inspection";

const requestSchema = z.object({
  stage: z.enum(["sale", "equity"]),
  taker: z.string().min(32).max(44),
  amount: z.string().regex(/^\d+$/).refine((value) => BigInt(value) > 0n),
});

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_BANKED_MODE !== "live" || process.env.BANKED_LIVE_ENABLED !== "true") {
    return NextResponse.json({ error: "Live order preparation is disabled." }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid order request." }, { status: 400 });

  const { stage, taker, amount } = parsed.data;
  const params = new URLSearchParams({
    inputMint: stage === "sale" ? SOL_MINT : USDC_MINT,
    outputMint: stage === "sale" ? USDC_MINT : SPYX_MINT,
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
