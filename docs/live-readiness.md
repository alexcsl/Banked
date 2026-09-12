# Live readiness runbook

## What the application now supplies

The application can prepare a wallet-bound sale or equity order only when both `NEXT_PUBLIC_BANKED_MODE=live` and `BANKED_LIVE_ENABLED=true` are set. Preparation resolves all lookup tables and checks the intended wallet before Phantom can prompt for a signature. The application can submit only exact bytes already signed by the wallet. It cannot sign for the user.

`src/domain/operation.ts` enforces the sequence from sale preparation through final reconciliation. Unknown submission status becomes `reconciliation-required`; it never triggers a replacement transaction automatically.

## Actions the developer can complete

1. Add a controlled program allowlist to the existing versioned-transaction inspection. The current inspection verifies the payer, required signer, blockhash, and all lookup tables, then reports all invoked programs for review.
2. Bind a prepared order to its exact serialized transaction and Jupiter request ID before submitting `/api/execute`.
3. The existing reconciliation endpoint reads finalized Solana transaction metadata and derives the sale-specific USDC token-account delta. It rejects missing or ambiguous pre/post balances.
4. Build a fresh equity order for `floor(actualProceeds × equityBps / 10,000)`, accounting for the provider's fee denomination before the user signs.
5. Add browser recovery tests for rejection, expiry, RPC timeouts, refresh, and duplicate clicks.

## Actions requiring the user's touch

1. Create a Jupiter developer API key at the Jupiter developer portal. Do not paste it into chat. Put it in `.env.local` as `JUPITER_API_KEY`.
2. Provide a dedicated mainnet RPC endpoint if public RPC reliability is insufficient. Put it in `.env.local` as `SOLANA_RPC_URL`, or use `HELIUS_RPC_URL`.
3. Create or choose a disposable, self-custodied test wallet with a small amount of SOL. Never provide its seed phrase or private key. Connect it only through Phantom when a concrete reviewed transaction is ready.
4. Confirm that the intended Indonesian pilot and any public distribution are permitted by the applicable issuer, provider, and local rules before enabling public live trading.
5. For a controlled local test, set `NEXT_PUBLIC_BANKED_MODE=live` and `BANKED_LIVE_ENABLED=true`, restart the app, and inspect the prepared transaction before signing. Keep `BANKED_LIVE_ENABLED=false` until the inspection and reconciliation work is complete.
