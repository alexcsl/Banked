import { describe, expect, it } from "vitest";
import { detectSolToUsdcExit } from "@/server/exit-detection";
import { USDC_MINT } from "@/domain/assets";

const wallet = "11111111111111111111111111111111";

describe("external exit detection", () => {
  it("detects a finalized SOL debit and USDC credit for the connected wallet", () => {
    const exit = detectSolToUsdcExit({
      slot: 42,
      blockTime: 1_789_000_000,
      meta: {
        err: null,
        preBalances: [2_000_000_000],
        postBalances: [1_000_000_000],
        preTokenBalances: [],
        postTokenBalances: [{ accountIndex: 1, mint: USDC_MINT, owner: wallet, uiTokenAmount: { amount: "500000000" } }],
      },
      transaction: { message: { staticAccountKeys: [{ toBase58: () => wallet }] } },
    }, wallet, "signature");
    expect(exit).toMatchObject({ signature: "signature", solDebited: "1000000000", usdcReceived: "500000000" });
  });

  it("rejects a transaction without both a SOL debit and USDC credit", () => {
    const exit = detectSolToUsdcExit({
      slot: 42,
      blockTime: null,
      meta: { err: null, preBalances: [1_000_000_000], postBalances: [2_000_000_000], preTokenBalances: [], postTokenBalances: [] },
      transaction: { message: { staticAccountKeys: [{ toBase58: () => wallet }] } },
    }, wallet, "signature");
    expect(exit).toBeNull();
  });
});
