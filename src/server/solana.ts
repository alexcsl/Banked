import { Connection } from "@solana/web3.js";

export function getRpcConnection(): Connection {
  const endpoint = process.env.SOLANA_RPC_URL ?? process.env.HELIUS_RPC_URL;
  if (!endpoint) throw new Error("A Solana RPC endpoint is not configured.");
  return new Connection(endpoint, "finalized");
}
