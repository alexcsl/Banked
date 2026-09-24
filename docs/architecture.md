# Architecture

Banked uses a staged, user-signed flow. Stage one sells SOL for USDC. Once finalized, the application derives the sale's USDC credit from transaction metadata rather than wallet snapshots. Each opted-in SPYx or JUP purchase uses a fresh quote and a separate signature, capped by its share of that actual credit.

```
Wallet → sale transaction → finalized USDC delta → fresh destination quotes → separate purchase transactions
```

Exit-rule assets remain in accounts owned by the connected wallet. The application stores local operation state and rule receipts. The dashboard summarizes those receipts, not current wallet balances or transactions made outside Banked.

`src/domain/allocation.ts` is the accounting boundary. All amounts are `bigint` atomic units. Given actual proceeds `P` and equity allocation `b` basis points, the purchase budget is `floor(P × b / 10,000)` and the retained amount is the remainder. Rounding dust stays in retained USDC.

SPYx uses Token-2022 with scaled UI amounts. Raw atomic amounts are used for transaction construction. Any future display layer must apply the effective multiplier exactly once and retain execution-time multiplier context for historical receipts.

An imported external exit can be assigned a rule only after the sale has finalized. That records a plan for the proceeds; it cannot prove the rule existed before the trade.
