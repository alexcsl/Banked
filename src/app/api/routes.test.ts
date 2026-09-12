import { describe, expect, it } from "vitest";
import { POST as orderPost } from "@/app/api/order/route";
import { hasExpectedReconciliation } from "@/app/api/reconcile/route";

describe("curated destination routes", () => {
  it("rejects an unknown destination before constructing an order", async () => {
    process.env.NEXT_PUBLIC_BANKED_MODE = "live";
    process.env.BANKED_LIVE_ENABLED = "true";
    const response = await orderPost(new Request("http://localhost/api/order", {
      method: "POST",
      body: JSON.stringify({ stage: "purchase", destinationId: "unknown", taker: "11111111111111111111111111111111", amount: "10000000" }),
    }));
    expect(response.status).toBe(400);
  });

  it("requires both a USDC debit and configured destination credit for a purchase", () => {
    expect(hasExpectedReconciliation("purchase", -10_000_000n, 0n)).toBe(false);
    expect(hasExpectedReconciliation("purchase", -10_000_000n, 1n)).toBe(true);
  });
});
