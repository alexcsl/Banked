import { NextResponse } from "next/server";
import { z } from "zod";
import { findRecentSolToUsdcExits } from "@/server/exit-detection";
import { getRpcConnection } from "@/server/solana";

const requestSchema = z.object({ wallet: z.string().min(32).max(44) });

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid wallet address." }, { status: 400 });
  try {
    const exits = await findRecentSolToUsdcExits(getRpcConnection(), parsed.data.wallet);
    return NextResponse.json({ exits });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Recent exit detection failed." }, { status: 503 });
  }
}
