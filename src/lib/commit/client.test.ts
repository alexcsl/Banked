import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { deriveCommitAddresses, deriveCommitReceipt } from "@/lib/commit/client";

describe("Commit PDA derivation", () => {
  it("derives stable, distinct vault authorities and receipts", () => {
    const programId = new PublicKey("BXbCRa6rLmCK3ZXGCrFmks4AGjR1ovBNbqbJhwqNbPD1");
    const owner = Keypair.generate().publicKey;
    const addresses = deriveCommitAddresses(programId, owner);
    expect(deriveCommitAddresses(programId, owner)).toEqual(addresses);
    expect(addresses.reserveAuthority.equals(addresses.operatingAuthority)).toBe(false);
    expect(deriveCommitReceipt(programId, addresses.vault, 1n).equals(deriveCommitReceipt(programId, addresses.vault, 2n))).toBe(false);
  });
});
