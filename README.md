# Banked

Try the [public simulation demo](https://banked-ruby.vercel.app/). It does not execute live trades.

Banked helps Solana traders keep a chosen SOL balance in their wallet and route only the excess through an exit plan. If the wallet holds less than the amount to keep, the rule proposes no sale. Rules start paused, and every live sale and destination purchase requires the trader's wallet approval.

After a sale, Banked allocates the actual USDC proceeds across SPYx, JUP, and USDC kept in the wallet. Its dashboard shows what was routed, what still needs approval, and what was planned to remain. The application defaults to simulation mode; live execution is gated while wallet signing and reconciliation are validated. See the [short and long product descriptions](docs/product-description.md) for reusable copy.

## Run locally

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Verification

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

## Live-mode gate

Live signing is intentionally unavailable until all of the following are proven with the intended wallet and a permitted account:

- Jupiter transaction construction and execution access
- Full versioned-transaction inspection, including lookup tables and account privileges
- Reconciliation of the sale's exact USDC token-account delta
- Each purchase whose USDC debit does not exceed its independently allocated budget
- SPYx Token-2022 compatibility and current issuer metadata
- User and distribution eligibility for the intended jurisdiction

Banked never requests a seed phrase, takes custody, or relies on a saved allocation as authority to spend funds.

## Demo and pitch readiness

The simulation keeps a chosen SOL amount available to trade and calculates a sale only from the wallet balance above it. New rules start paused; active rules still require explicit review and signing for live transactions. The app allocates synthetic USDC proceeds, completes destination purchases independently, and shows the resulting money flow in a dashboard. The dashboard uses saved operation receipts and distinguishes routed purchase debits from pending budgets and planned retained USDC. It is not a current wallet balance. See [MVP readiness and demo brief](docs/mvp-readiness.md) for the proof sequence and release gates.
