# Banked Commit design and local proof

Banked Commit is a separate capability from exit rules. Exit rules remain browser-local intentions for a user-owned wallet. Commit uses an Anchor program to keep classified test-stock inventory in separate reserve and operating token accounts.

## Trust boundary

The owner creates, funds, pauses, revokes, updates, withdraws, and recovers the vault. The executor can only call `pay` with the active vault, recipient, mint, policy version, sequence, an amount within the current UTC daily allowance, and an expiry no more than five minutes away.

The program has separate `reserve` and `operating` authority PDAs. `pay` accepts only the operating account and a recipient account whose authority is the policy recipient. It does not expose arbitrary instructions, arbitrary CPI, token delegates, close-authority changes, or reserve-account selection.

The browser and API build views and verify capabilities. They have no signer or authoritative balance ledger. Local storage holds drafts only.

## Accounting

Deposits split using `ceil(amount * reserve_bps / 10_000)`. This favors the reserve when deposits fragment. The program reloads destination accounts and rejects deposits where Token-2022 behavior causes an unexpected balance increase, preventing transfer-fee mints from receiving normal credit.

The daily allowance uses `floor(unix_timestamp / 86_400)`. It resets only after the chain advances to a later UTC day. Policy, pause, revocation, withdrawal, and recovery changes advance policy version or sequence so old requests cannot execute.

Every mutation creates a receipt PDA from the vault and expected sequence. Direct token transfers do not create receipts or operating credit. The owner can recover actual account balances through `recover_all`; issuer controls such as mint pause or freeze can still prevent movement.

## Current capability status

The program has passed native Rust compilation and TypeScript accounting/PDA tests. The browser instruction layer builds only the program's fixed initialize, deposit, and payment account layouts, including canonical Token-2022 token accounts and receipt PDAs. Recipient token accounts are created through the associated-token program when an approved recipient does not already have one.

The vault's fixed allocation is 512 bytes including its discriminator. The contract is not deployed. It has not passed SBF compilation or a local-validator test because the installed Agave platform-tools download times out in WSL. The Commit workspace therefore reports no active spend authority until a deployed program, configured program ID, and matching cluster genesis hash are verified.

## Finish the local-validator proof

Run these commands from Ubuntu WSL after platform tools are available. The platform-tools archive is approximately 495 MB, so use a stable connection and leave at least 2 GB free on the WSL filesystem:

```bash
cd /mnt/d/Hackathon/BankedStocklana
CARGO_HOME=/mnt/c/Users/alexa/.cargo cargo-build-sbf --install-only
CARGO_HOME=/mnt/c/Users/alexa/.cargo anchor build
solana-test-validator --reset
```

In a second shell, deploy the generated `target/deploy/banked_commit.so` to the validator using an isolated test keypair. Set `BANKED_COMMIT_PROGRAM_ID` and the validator genesis hash only after deployment succeeds. Then run the integration suite that proves deposits, allowed payment, overspend rejection, reserve-account rejection, stale sequence rejection, executor revocation, and owner recovery.

No mainnet deployment, real stock transfer, creator-fee claim, USDC conversion, or Pyth-dependent behavior is included in this milestone.
