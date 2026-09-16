import { PublicKey } from "@solana/web3.js";

export const COMMIT_PROGRAM_ENV = "BANKED_COMMIT_PROGRAM_ID";

export type CommitAddresses = {
  vault: PublicKey;
  reserveAuthority: PublicKey;
  operatingAuthority: PublicKey;
};

export function deriveCommitAddresses(programId: PublicKey, owner: PublicKey): CommitAddresses {
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("commit"), owner.toBuffer()], programId);
  const [reserveAuthority] = PublicKey.findProgramAddressSync([Buffer.from("reserve"), vault.toBuffer()], programId);
  const [operatingAuthority] = PublicKey.findProgramAddressSync([Buffer.from("operating"), vault.toBuffer()], programId);
  return { vault, reserveAuthority, operatingAuthority };
}

export function deriveCommitReceipt(programId: PublicKey, vault: PublicKey, sequence: bigint): PublicKey {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(sequence);
  return PublicKey.findProgramAddressSync([Buffer.from("receipt"), vault.toBuffer(), bytes], programId)[0];
}
