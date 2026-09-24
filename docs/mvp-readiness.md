# MVP readiness and demo brief

## Status

Banked focuses on one problem: a trader chooses how much SOL to keep in the wallet and routes only the balance above that amount. A rule starts paused and must be activated explicitly. The demonstrable slice is a browser simulation of a threshold-based SOL sale, allocation from synthetic USDC proceeds, separate SPYx and JUP purchases, saved receipts, and a money-flow dashboard.

If the trader sets 10 SOL to keep and the wallet holds 9 SOL, sellable excess is zero. If the wallet holds 11 SOL, sellable excess is 1 SOL. This is a wallet balance threshold, not profit or cost-basis accounting; any incoming SOL can appear as excess. The dashboard counts recorded purchase debits as routed, shows budgets still awaiting action, and labels retained USDC as a plan rather than a live wallet balance. Mainnet transaction execution remains gated and must not be presented as production trading. An active rule proposes a sale for wallet approval; it does not monitor or trade automatically.

## Verified locally on 2026-09-23

| Check | Result |
| --- | --- |
| TypeScript unit tests, typecheck, lint, production build | Passed |
| Browser simulation, refresh, and wallet-operation isolation | Passed in Chrome |
| Native Rust tests and SBF build | Passed |
| Money-flow dashboard and saved receipt recovery | Passed in simulation |

The browser's Phantom signing path has not been exercised with a real extension wallet.

## Verified locally on 2026-09-24

The threshold calculation was tested for 0, 9, 10, and 11 SOL against a 10 SOL trading balance. Browser tests covered paused activation, loss protection, simulated routing, refresh recovery, and migration of older saved rules. Unit tests, browser tests, lint, typecheck, and the production build passed. The live signing path remains unverified and disabled by default.

## Demo sequence

1. In simulation, leave "SOL to keep" at 10 and set "Wallet SOL balance (simulation)" to 9. Show that no sale can be recorded. Change the wallet balance to 11. Save and activate the rule, then record the 1 SOL excess. Show 125.030864 USDC divided into 25.006172 USDC for SPYx, 25.006172 USDC for JUP, and 75.01852 USDC retained.
2. Show the dashboard before purchases: 125.030864 USDC in simulated proceeds, 50.012344 USDC awaiting purchases, and 75.01852 USDC planned to remain.
3. Record only the SPYx purchase. Show 25.006172 USDC routed to SPYx while the JUP budget remains awaiting action.
4. Refresh, resume the operation, complete JUP, and show the saved receipt and dashboard update.

## Pitch framing

Lead with the balance threshold: keep 10 SOL, sell zero at 9 SOL, or make 1 SOL eligible at 11 SOL. Demonstrate pause and activation before the sale, then the dashboard after each independent purchase. Keep simulated values clearly labeled. Do not claim that importing an earlier external exit proves pre-sale commitment.

## Remaining release gates

- Verify the intended issuer, token, provider, and jurisdiction before offering real xStock or USDC trading.
- Complete transaction intent inspection and exact signed-order binding for the mainnet Exit Rules API before enabling live execution.
- Exercise the browser signing, reconciliation, and refresh path with a disposable permitted wallet.
- Record a short demo video of the rule, routing dashboard, and interrupted purchase recovery.
