# Banked presentation script

Target length: about 3 minutes, followed by a 45-second browser demo. Speak in your own cadence. The lines below are a guide, not text to read from the slides.

## Slide 1: The problem

"I have won a trade, felt more confident, increased my next position, and put the gain straight back at risk. As trade size grew, I was not ready for the pressure. That is the moment Banked is built for. This is not only a personal story: research on US stock accounts found that the most active households lagged the market. It does not prove Banked improves returns, but it shows why discipline matters."

## Slide 2: A concrete win

"A trader sets a rule to keep 10 SOL in the wallet. At a 9 SOL wallet balance, Banked proposes selling zero. At 11 SOL, only the 1 SOL above the target is eligible. In our simulation that becomes about 125.03 USDC: 20% toward SPYx, 20% toward JUP, and 60% kept as USDC. This is a balance threshold, not profit accounting."

## Slide 3: The rule

"Before selling, the trader sets the SOL balance to keep and chooses the split. The rule starts paused. They activate it when ready, then review the excess before signing. This screen is the working product in simulation mode."

## Slide 4: The dashboard

"After the sale, Banked shows the outcome. Here, the SPYx purchase is recorded, JUP is still waiting, and the retained USDC allocation stays visible. These are saved operation receipts, not a live wallet balance."

## Slide 5: Why I built it

"The product came from a simple failure in my own trading: position size rose faster than my discipline. Banked gives the proceeds a job before the next emotional decision, then makes unfinished steps hard to ignore."

## Slide 6: Why Solana, why now

"SOL, USDC, and tokenized stock exposure can be held in the same Solana wallet. That lets a future live flow measure the actual USDC received and attach wallet-signed receipts to each step. xStocks launched on Solana in 2025, so this route is now possible in one ecosystem. Banked still needs transaction validation and eligibility checks before live execution is enabled."

## Slide 7: Potential market

"We start with self-custodied SOL traders who already want to put some gains into tokenized stocks. Solana reported more than 190,000 xStocks holders in August 2026. That is an adjacent audience, not 190,000 Banked prospects. If 2% became paying customers, that would be 3,800 subscribers. We still have to prove the overlap, access, and willingness to pay."

## Slide 8: Business model

"The free product helps people plan and track. We would test an $8-a-month Pro subscription for wallet monitoring and alerts once the live route is safe and usable. I prefer a subscription because Banked should earn from helping users follow a plan, not from pushing more trades. In the illustrative 3,800-customer scenario, revenue would be $30,400 per month. If fixed costs were $20,000 and variable costs $1 per subscriber, that leaves $6,600 before customer acquisition and taxes. Those are assumptions to test, not current profit."

## Slide 9: Close and demo

"Banked turns one win into a decision made in advance and a record you can return to. I will show the simulation now: set the split, record the 1 SOL sale, complete SPYx, and show that JUP still needs action. Our next proof is a controlled wallet transaction and a paid-demand test with active traders."

## Browser demo cue

1. Show the 20/20/60 rule and record the simulated 1 SOL sale.
2. Point to the 125.030864 USDC proceeds and the three allocations.
3. Record the SPYx purchase. Point to the completed amount and the JUP amount awaiting action.
4. Refresh and resume the operation to show that the pending step persists.

## Answers to likely questions

**Does a connected wallet make every transaction follow a rule?** No. A sale started in Banked can be associated with the selected rule. A sale made elsewhere needs a manual wallet scan, review, and rule application. Purchases require separate signatures.

**Is the product profitable now?** No revenue or paid conversion is evidenced. The slide shows the price and cost thresholds to test after live execution and premium features are ready.

**Is 190,000 the total market?** No. It is a reported count of xStocks holders on Solana and a proxy for an adjacent audience. It is not a count of unique, eligible, reachable traders who need Banked.

**Does Banked automatically identify profit?** No. The trader sets a SOL balance to keep available for trading. Banked calculates sellable excess above that balance when the trader reviews a sale. A 9 SOL return against a 10 SOL target sells nothing; an 11 SOL wallet balance makes 1 SOL eligible. This is not cost-basis accounting, and other incoming SOL can also appear as excess. New rules start paused, and an active rule still needs the trader's signature.

## Sources

- Barber and Odean, *Trading Is Hazardous to Your Wealth* (2000): https://faculty.haas.berkeley.edu/odean/Papers%20current%20versions/Individual_Investor_Performance_Final.pdf
- Solana Foundation, xStocks case study: https://solana.com/id/news/case-study-xstocks
- Solana Foundation, August 2026 ecosystem roundup: https://solana.com/news/solana-ecosystem-roundup-august-2026
