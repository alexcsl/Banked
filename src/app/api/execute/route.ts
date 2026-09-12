import { NextResponse } from "next/server";
import { z } from "zod";
import { inspectTransaction } from "@/server/transaction-inspection";

const requestSchema = z.object({
  stage: z.enum(["sale", "equity"]),
  taker: z.string().min(32).max(44),
  requestId: z.string().min(1),
  signedTransaction: z.string().min(1),
});

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_BANKED_MODE !== "live" || process.env.BANKED_LIVE_ENABLED !== "true") {
    return NextResponse.json({ error: "Live execution is disabled." }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid execution request." }, { status: 400 });

  try {
    await inspectTransaction(parsed.data.signedTransaction, parsed.data.taker);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Transaction inspection failed." }, { status: 422 });
  }

  const apiKey = process.env.JUPITER_API_KEY;
  const response = await fetch("https://api.jup.ag/swap/v2/execute", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { "x-api-key": apiKey } : {}),
    },
    body: JSON.stringify({
      signedTransaction: parsed.data.signedTransaction,
      requestId: parsed.data.requestId,
    }),
    cache: "no-store",
  });
  if (!response.ok) return NextResponse.json({ error: "The order provider rejected the execution request." }, { status: 502 });

  const result = await response.json();
  return NextResponse.json({
    stage: parsed.data.stage,
    status: result.status,
    signature: result.signature,
    code: result.code,
    totalInputAmount: result.totalInputAmount,
    totalOutputAmount: result.totalOutputAmount,
    error: result.error ?? null,
  });
}
