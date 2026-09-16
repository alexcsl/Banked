import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getRpcConnection } from "@/server/solana";

export async function GET() {
  const programId = process.env.BANKED_COMMIT_PROGRAM_ID;
  const expectedGenesisHash = process.env.BANKED_COMMIT_GENESIS_HASH;
  if (!programId || !expectedGenesisHash) {
    return NextResponse.json({ available: false, reason: "Commit is not deployed to a configured cluster." });
  }

  try {
    const connection = getRpcConnection();
    const [genesisHash, account] = await Promise.all([
      connection.getGenesisHash(),
      connection.getAccountInfo(new PublicKey(programId), "finalized"),
    ]);
    if (genesisHash !== expectedGenesisHash) {
      return NextResponse.json({ available: false, reason: "The configured RPC is not the Commit deployment cluster." });
    }
    if (!account?.executable) {
      return NextResponse.json({ available: false, reason: "The configured Commit program is not executable on this cluster." });
    }
    return NextResponse.json({ available: true, programId, genesisHash, schemaVersion: 1, supportedActions: ["initialize", "deposit", "pay", "update-policy", "pause", "revoke", "withdraw", "recover"] });
  } catch {
    return NextResponse.json({ available: false, reason: "Commit capability verification is unavailable." }, { status: 503 });
  }
}
