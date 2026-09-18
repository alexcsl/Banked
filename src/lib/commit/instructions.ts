import { PublicKey, SystemProgram, TransactionInstruction, type AccountMeta } from "@solana/web3.js";
import { deriveCommitAddresses, deriveCommitReceipt } from "@/lib/commit/client";

const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

const discriminators = {
  initialize: bytes("afaf6d1f0d989bed"),
  deposit: bytes("f223c68952e1f2b6"),
  pay: bytes("7712d841c0757adc"),
  updatePolicy: bytes("d4f5f607a3971239"),
  setPaused: bytes("5b3c7dc0b0e1a6da"),
  revokeExecutor: bytes("0e0ad8de04a24536"),
  withdraw: bytes("b712469c946da122"),
  recoverAll: bytes("c0dca2247cdcfb9"),
};

export type CommitDeployment = {
  programId: PublicKey;
  mint: PublicKey;
  tokenProgram: PublicKey;
};

export function deriveCommitAssociatedTokenAddress(owner: PublicKey, deployment: Pick<CommitDeployment, "mint" | "tokenProgram">) {
  return PublicKey.findProgramAddressSync([owner.toBuffer(), deployment.tokenProgram.toBuffer(), deployment.mint.toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID)[0];
}

export function buildInitializeInstruction(deployment: CommitDeployment, owner: PublicKey, args: { reserveBps: number; dailyLimitRaw: bigint; executor: PublicKey; recipient: PublicKey; deploymentDomain: Uint8Array }) {
  if (!Number.isInteger(args.reserveBps) || args.reserveBps < 0 || args.reserveBps > 10_000) throw new Error("Reserve allocation is invalid.");
  if (args.deploymentDomain.length !== 32) throw new Error("Deployment domain must be 32 bytes.");
  const addresses = deriveCommitAddresses(deployment.programId, owner);
  const reserveTokenAccount = deriveCommitAssociatedTokenAddress(addresses.reserveAuthority, deployment);
  const operatingTokenAccount = deriveCommitAssociatedTokenAddress(addresses.operatingAuthority, deployment);
  return instruction(deployment.programId, discriminators.initialize, [u16(args.reserveBps), u64(args.dailyLimitRaw), args.executor.toBytes(), args.recipient.toBytes(), args.deploymentDomain], [
    writableSigner(owner), readonly(deployment.mint), readonly(deployment.tokenProgram), writable(addresses.vault), readonly(addresses.reserveAuthority), readonly(addresses.operatingAuthority), writable(reserveTokenAccount), writable(operatingTokenAccount), readonly(ASSOCIATED_TOKEN_PROGRAM_ID), readonly(SystemProgram.programId),
  ]);
}

export function buildDepositInstruction(deployment: CommitDeployment, owner: PublicKey, args: { sequence: bigint; amount: bigint }) {
  const addresses = deriveCommitAddresses(deployment.programId, owner);
  return instruction(deployment.programId, discriminators.deposit, [u64(args.sequence), u64(args.amount)], [
    writableSigner(owner), readonly(deployment.mint), readonly(deployment.tokenProgram), writable(addresses.vault), writable(deriveCommitAssociatedTokenAddress(owner, deployment)), readonly(addresses.reserveAuthority), readonly(addresses.operatingAuthority), writable(deriveCommitAssociatedTokenAddress(addresses.reserveAuthority, deployment)), writable(deriveCommitAssociatedTokenAddress(addresses.operatingAuthority, deployment)), writable(deriveCommitReceipt(deployment.programId, addresses.vault, args.sequence)), readonly(SystemProgram.programId),
  ]);
}

export function buildPayInstruction(deployment: CommitDeployment, owner: PublicKey, executor: PublicKey, args: { sequence: bigint; policyVersion: bigint; amount: bigint; expiresAt: bigint; recipient: PublicKey }) {
  const addresses = deriveCommitAddresses(deployment.programId, owner);
  return instruction(deployment.programId, discriminators.pay, [u64(args.sequence), u64(args.policyVersion), u64(args.amount), i64(args.expiresAt)], [
    writableSigner(executor), readonly(deployment.mint), readonly(deployment.tokenProgram), writable(addresses.vault), readonly(addresses.operatingAuthority), writable(deriveCommitAssociatedTokenAddress(addresses.operatingAuthority, deployment)), readonly(args.recipient), writable(deriveCommitAssociatedTokenAddress(args.recipient, deployment)), writable(deriveCommitReceipt(deployment.programId, addresses.vault, args.sequence)), readonly(ASSOCIATED_TOKEN_PROGRAM_ID), readonly(SystemProgram.programId),
  ]);
}

function instruction(programId: PublicKey, discriminator: Uint8Array, fields: Uint8Array[], keys: AccountMeta[]) {
  return new TransactionInstruction({ programId, data: Buffer.from(concat(discriminator, ...fields)), keys });
}

function writableSigner(pubkey: PublicKey): AccountMeta { return { pubkey, isSigner: true, isWritable: true }; }
function writable(pubkey: PublicKey): AccountMeta { return { pubkey, isSigner: false, isWritable: true }; }
function readonly(pubkey: PublicKey): AccountMeta { return { pubkey, isSigner: false, isWritable: false }; }

function u16(value: number) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u64(value: bigint) {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) throw new Error("Value must be an unsigned 64-bit integer.");
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}

function i64(value: bigint) {
  if (value < -0x8000_0000_0000_0000n || value > 0x7fff_ffff_ffff_ffffn) throw new Error("Value must be a signed 64-bit integer.");
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, value, true);
  return bytes;
}

function bytes(hex: string) {
  return Uint8Array.from(hex.match(/../g)?.map((pair) => Number.parseInt(pair, 16)) ?? []);
}

function concat(...parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
