import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { buildDepositInstruction, buildInitializeInstruction, buildPayInstruction, deriveCommitAssociatedTokenAddress } from "@/lib/commit/instructions";

const deployment = {
  programId: new PublicKey("BXbCRa6rLmCK3ZXGCrFmks4AGjR1ovBNbqbJhwqNbPD1"),
  mint: Keypair.generate().publicKey,
  tokenProgram: new PublicKey("TokenzQdBNbLqP5VEhdkFpdnqVpVvDoLbYGg9BfG8ZQ"),
};

describe("Commit instruction builders", () => {
  it("builds initialize with immutable program-owned accounts", () => {
    const owner = Keypair.generate().publicKey;
    const instruction = buildInitializeInstruction(deployment, owner, { reserveBps: 8_000, dailyLimitRaw: 100_000_000n, executor: Keypair.generate().publicKey, recipient: Keypair.generate().publicKey, deploymentDomain: new Uint8Array(32) });
    expect(instruction.keys).toHaveLength(10);
    expect(instruction.keys[0]).toMatchObject({ pubkey: owner, isSigner: true, isWritable: true });
    expect(Array.from(instruction.data.slice(0, 8))).toEqual([175, 175, 109, 31, 13, 152, 155, 237]);
  });

  it("uses canonical token accounts for deposit and payment", () => {
    const owner = Keypair.generate().publicKey;
    const executor = Keypair.generate().publicKey;
    const recipient = Keypair.generate().publicKey;
    const deposit = buildDepositInstruction(deployment, owner, { sequence: 1n, amount: 100_000_000n });
    const payment = buildPayInstruction(deployment, owner, executor, { sequence: 2n, policyVersion: 1n, amount: 6_000_000n, expiresAt: 1_800_000_000n, recipient });
    expect(deposit.keys).toHaveLength(11);
    expect(payment.keys).toHaveLength(11);
    expect(payment.keys[7].pubkey.equals(deriveCommitAssociatedTokenAddress(recipient, deployment))).toBe(true);
    expect(payment.keys[7].isWritable).toBe(true);
  });
});
