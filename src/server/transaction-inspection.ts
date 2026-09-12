import { VersionedTransaction } from "@solana/web3.js";
import { getRpcConnection } from "@/server/solana";

export type TransactionInspection = {
  payer: string;
  requiredSigners: string[];
  programIds: string[];
  lookupTableCount: number;
  recentBlockhash: string;
};

export async function inspectTransaction(transactionBase64: string, wallet: string): Promise<TransactionInspection> {
  const transaction = VersionedTransaction.deserialize(Buffer.from(transactionBase64, "base64"));
  const message = transaction.message;
  const payer = message.staticAccountKeys[0]?.toBase58();
  if (!payer || payer !== wallet) throw new Error("The transaction fee payer does not match the connected wallet.");

  const requiredSigners = message.staticAccountKeys
    .slice(0, message.header.numRequiredSignatures)
    .map((key) => key.toBase58());
  if (!requiredSigners.includes(wallet)) throw new Error("The connected wallet is not a required transaction signer.");
  if (!message.recentBlockhash) throw new Error("The transaction does not have a recent blockhash.");

  const connection = getRpcConnection();
  const lookupTables = await Promise.all(message.addressTableLookups.map(async (lookup) => {
    const response = await connection.getAddressLookupTable(lookup.accountKey, { commitment: "finalized" });
    if (!response.value) throw new Error(`Address lookup table ${lookup.accountKey.toBase58()} is unavailable.`);
    return response.value;
  }));
  const accountKeys = message.getAccountKeys({ addressLookupTableAccounts: lookupTables });
  const programIds = message.compiledInstructions.map((instruction) => {
    const programId = accountKeys.get(instruction.programIdIndex);
    if (!programId) throw new Error("A transaction instruction references an unavailable program.");
    return programId.toBase58();
  });

  return {
    payer,
    requiredSigners,
    programIds: [...new Set(programIds)],
    lookupTableCount: lookupTables.length,
    recentBlockhash: message.recentBlockhash,
  };
}
