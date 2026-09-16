# Architecture

Banked uses two user-signed stages. Stage one sells SOL for USDC. Once finalized, the application derives the sale's USDC credit from transaction metadata rather than wallet snapshots. Stage two uses a fresh quote to buy SPYx from a capped portion of that actual credit.

```
Wallet → sale transaction → finalized USDC delta → fresh equity quote → purchase transaction
```

Exit-rule assets remain in accounts owned by the connected wallet. The application stores local operation state only for that flow. The separate Commit capability introduces a program-controlled local-validator vault design with distinct reserve and operating accounts; it is unavailable until an executable deployment and matching cluster identity are verified.

`src/domain/allocation.ts` is the accounting boundary. All amounts are `bigint` atomic units. Given actual proceeds `P` and equity allocation `b` basis points, the purchase budget is `floor(P × b / 10,000)` and the retained amount is the remainder. Rounding dust stays in retained USDC.

SPYx uses Token-2022 with scaled UI amounts. Raw atomic amounts are used for transaction construction. Any future display layer must apply the effective multiplier exactly once and retain execution-time multiplier context for historical receipts.

Commit uses a test-stock mint in its initial proof. It does not currently authorize live SPYx transfers, automatic earnings, USDC conversion, or price-dependent rules. See `docs/commit-design.md` for its authority boundary and validation status.
