# Delivery status

## Product decision

Banked is an exit-rule product for xStocks, not a general trading terminal or background wallet manager. A user commits an allocation before selling SOL through Banked. After the sale finalizes, Banked calculates from actual USDC received and prepares the opted-in SPYx purchase. The user signs both transactions.

The pitch earns attention when the demo proves the pre-commitment, actual-output calculation, spendable retained-USDC balance, and recovery after interruption. It is weak when described only as a two-token swap or as automatic trading. The remaining product risk is whether active traders will leave their existing terminal for a deliberate exit flow. Validate that with target-user conversations before treating it as a broad consumer product.

Implemented:

- Minimal Next.js TypeScript application and responsive Banked workflow
- Curated SOL, USDC, and SPYx identities
- Integer allocation math and fixture receipt
- Read-only Jupiter USDC-to-SPYx quote proxy
- Local operation-state machine and recovery storage
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
