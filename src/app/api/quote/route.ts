import { NextResponse } from "next/server";
import { z } from "zod";
import { getPurchaseAsset, type PurchaseDestinationId, USDC_MINT } from "@/domain/assets";

const requestSchema = z.object({
  amount: z.string().regex(/^\d+$/).refine((value) => BigInt(value) > 0n),
  destinationId: z.enum(["spyx", "jup"]),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid atomic USDC amount." }, { status: 400 });

  const apiKey = process.env.JUPITER_API_KEY;
  const asset = getPurchaseAsset(parsed.data.destinationId as PurchaseDestinationId);
  const params = new URLSearchParams({ inputMint: USDC_MINT, outputMint: asset.mint, amount: parsed.data.amount, slippageBps: "50" });
  const response = await fetch(`https://api.jup.ag/swap/v2/order?${params}`, {
    headers: apiKey ? { "x-api-key": apiKey } : {},
    cache: "no-store",
  });
  if (!response.ok) return NextResponse.json({ error: "A live destination quote is unavailable." }, { status: 503 });
  const quote = await response.json();
  return NextResponse.json({
    inputAmount: quote.inAmount,
    destinationId: asset.id,
    expectedOutput: quote.outAmount,
    minimumOutput: quote.otherAmountThreshold,
    feeBps: quote.feeBps,
    feeMint: quote.feeMint,
    expiresAt: quote.expireAt ?? null,
    route: quote.router,
  });
}
