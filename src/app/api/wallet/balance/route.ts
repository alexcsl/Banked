import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getRpcConnection } from "@/server/solana";

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("wallet");
  if (!address) return NextResponse.json({ error: "A wallet is required." }, { status: 400 });

  try {
    const wallet = new PublicKey(address);
    const balanceLamports = await getRpcConnection().getBalance(wallet, "finalized");
    return NextResponse.json({ balanceLamports: balanceLamports.toString() }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The wallet balance could not be loaded." }, { status: 503 });
  }
}
