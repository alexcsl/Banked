# Security and tests

The fixture workflow does not sign or submit transactions. Future live mode must fail closed unless it can validate the returned transaction, expected owner, curated mints, allowed token programs, account privileges, lookup tables, slippage minimum, expiry, and fee denomination.

Critical invariants:

- Allocation uses the finalized USDC credit of the specific sale, not a later wallet balance.
- Purchase debit never exceeds the allocated budget.
- Equity budget plus retained USDC equals actual proceeds.
- A failed purchase does not erase or repeat a completed sale.
- Retry first reconciles every known signature before creating another transaction.
- An unrecognized token extension, destination, mint, delegate, hook, or transaction account fails closed.

Current automated coverage validates integer parsing, rounding conservation, and allocation limits. A live readiness spike must add versioned-transaction fixtures, fee-side accounting cases, Token-2022 compatibility tests, refresh/retry recovery tests, and a permitted real-wallet reconciliation test.

Commit has separate native Rust and TypeScript accounting coverage. It is designed to reject stale sequences, stale policies, expired executor requests, overspending, wrong recipient accounts, and reserve-account payment attempts. SBF compilation and local-validator adversarial transactions remain required before treating its policy as live authority.
