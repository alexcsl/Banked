# Banked

Banked is a staged Solana exit-rule workflow. A user sells through the product, Banked reconciles the actual USDC received, and the user can independently approve the rule's curated SPYx and JUP purchases while retaining the unallocated USDC.

The application defaults to fixture mode. It provides named local rules, exact integer accounting, curated SPYx and JUP quote paths, receipt export, and a recovery model without presenting a mock transaction as live execution.

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
