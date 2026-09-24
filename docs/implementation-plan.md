# Delivery status

## Product decision

Banked is an exit-rule product. A user sets an allocation before selling SOL through Banked. After the sale finalizes, Banked calculates from actual USDC received and prepares the opted-in SPYx and JUP purchases. The user signs each transaction separately. A saved receipt and dashboard show which purchase debits were recorded and which budgets still need action.

The pitch earns attention when the demo shows a rule before the exit, a clear allocation from proceeds, independent purchases, and recovery after interruption. The dashboard's retained-USDC figure is a plan, not a current wallet balance. The remaining product risk is whether active traders will use a deliberate exit flow and return to finish the plan. Validate that with target-user conversations before treating it as a broad consumer product.

Implemented:

- Minimal Next.js TypeScript application and responsive Banked workflow
- Curated SOL, USDC, and SPYx identities
- Integer allocation math and fixture receipt
- Read-only Jupiter USDC-to-SPYx quote proxy
- Local operation-state machine and recovery storage
- Receipt-based money-flow dashboard with routed, awaiting, and retained-plan amounts
- Reviewable import of recent finalized SOL-to-USDC exit candidates
- Wallet-bound live-order preparation endpoint, protected by an explicit server-side gate
- Phantom detection and connection flow
- Fixture/live-state disclosure and local setup documentation
- Type, lint, build, and unit-test scripts

Blocked by external inputs:

- The current `.env.local` exposes only `NEXT_PUBLIC_BANKED_MODE`; the live routes need a Jupiter API key and a Helius or other Solana RPC endpoint in this workspace.
- A connected Phantom wallet and user-approved mainnet transaction are required for end-to-end execution evidence.
- Mainnet RPC and permitted live test wallet
- Indonesian eligibility and distribution review

The next implementation milestone is the live feasibility spike described in `README.md`.
