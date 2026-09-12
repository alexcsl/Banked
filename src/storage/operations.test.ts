import { describe, expect, it } from "vitest";
import { migrateLegacyOperation } from "@/storage/operations";

describe("legacy operation migration", () => {
  it("preserves a completed SPYx operation and adds a skipped JUP destination", () => {
    const migrated = migrateLegacyOperation({
      id: "legacy",
      wallet: "wallet",
      status: "complete",
      equityBps: 20,
      actualProceeds: "100000000",
      equitySignature: "spyx-signature",
      createdAt: "2026-09-12T00:00:00.000Z",
      updatedAt: "2026-09-12T00:00:00.000Z",
    });
    expect(migrated.rule.spyxBps).toBe(20);
    expect(migrated.rule.jupBps).toBe(0);
    expect(migrated.purchases.spyx.status).toBe("finalized");
    expect(migrated.purchases.spyx.budget).toBe("20000000");
    expect(migrated.purchases.jup.status).toBe("skipped");
  });
});
