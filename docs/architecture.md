# Architecture

Banked uses two user-signed stages. Stage one sells SOL for USDC. Once finalized, the application derives the sale's USDC credit from transaction metadata rather than wallet snapshots. Stage two uses a fresh quote to buy SPYx from a capped portion of that actual credit.

```
Wallet → sale transaction → finalized USDC delta → fresh equity quote → purchase transaction
```

Assets remain in accounts owned by the connected wallet. The application stores local operation state only. It has no program, delegated spending authority, executor, custody account, or reserve vault.

`src/domain/allocation.ts` is the accounting boundary. All amounts are `bigint` atomic units. Given actual proceeds `P` and equity allocation `b` basis points, the purchase budget is `floor(P × b / 10,000)` and the retained amount is the remainder. Rounding dust stays in retained USDC.

SPYx uses Token-2022 with scaled UI amounts. Raw atomic amounts are used for transaction construction. Any future display layer must apply the effective multiplier exactly once and retain execution-time multiplier context for historical receipts.
