export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SPYX_MINT = "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W";
export const JUP_MINT = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";

export const purchaseAssets = {
  spyx: { id: "spyx", symbol: "SPYx", mint: SPYX_MINT, decimals: 8, kind: "xstock" },
  jup: { id: "jup", symbol: "JUP", mint: JUP_MINT, decimals: 6, kind: "token" },
} as const;

export type PurchaseDestinationId = keyof typeof purchaseAssets;

export function getPurchaseAsset(id: PurchaseDestinationId) {
  return purchaseAssets[id];
}

export const supportedAssets = {
  sale: { symbol: "SOL", mint: SOL_MINT, decimals: 9 },
  settlement: { symbol: "USDC", mint: USDC_MINT, decimals: 6 },
  equity: { symbol: "SPYx", mint: SPYX_MINT, decimals: 8 },
} as const;
