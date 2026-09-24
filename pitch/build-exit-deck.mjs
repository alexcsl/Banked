import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const modulePath = process.env.BANKED_SLIDE_MODULES ? pathToFileURL(path.join(process.env.BANKED_SLIDE_MODULES, "pptxgenjs", "dist", "pptxgen.es.js")).href : "pptxgenjs";
const { default: PptxGenJS } = await import(modulePath);
const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Banked";
pptx.subject = "Banked exit discipline and money routing";
pptx.title = "Banked | Make the exit count";
pptx.lang = "en-US";

const C = { bg: "0B0D10", panel: "12161B", raised: "171C22", ink: "F2F0EA", muted: "A8A39A", rule: "303740", gold: "D4A84F", green: "78C49A" };
const S = pptx.ShapeType;

function box(slide, x, y, w, h, fill = C.panel, line = C.rule) {
  slide.addShape(S.rect, { x, y, w, h, line: { color: line, width: 0.9 }, fill: { color: fill } });
}

function text(slide, value, x, y, w, h, size, color = C.ink, bold = false, extra = {}) {
  slide.addText(value, { x, y, w, h, fontFace: "Arial", fontSize: size, color, bold, margin: 0, valign: "mid", fit: "shrink", ...extra });
}

function kicker(slide, value, x, y, w = 5) {
  text(slide, value.toUpperCase(), x, y, w, 0.26, 11, C.gold, true, { charSpacing: 1.5 });
}

function base() {
  const slide = pptx.addSlide();
  slide.background = { color: C.bg };
  text(slide, "BANKED", 0.65, 0.35, 1.6, 0.35, 17, C.ink, true);
  return slide;
}

function title(slide, value, size = 43) {
  text(slide, value, 0.68, 1.15, 11.95, 1.15, size, C.ink, true, { valign: "top", charSpacing: -1.2 });
}

function note(slide, value) { slide.addNotes(value); }

{
  const slide = base();
  text(slide, "One trade wins.\nThe next one can erase it.", 0.68, 1.35, 8.5, 2.05, 51, C.ink, true, { valign: "top", charSpacing: -1.4 });
  text(slide, "As the position grows, the next trade feels easier to size up. Gains without a plan stay exposed.", 0.7, 3.75, 7.45, 0.95, 23, C.muted);
  box(slide, 9.05, 1.63, 3.48, 3.98);
  kicker(slide, "THE CYCLE", 9.42, 1.99, 2.3);
  text(slide, "Win 1 SOL", 9.42, 2.5, 2.78, 0.56, 30, C.green, true);
  text(slide, "Size up", 9.42, 3.42, 2.78, 0.56, 30, C.ink, true);
  text(slide, "Risk the gain", 9.42, 4.34, 2.78, 0.56, 30, C.gold, true);
  text(slide, "Most active stock-trading households: 11.4% annual return vs 17.9% market, 1991–96.", 0.7, 6.18, 11.9, 0.38, 17, C.ink);
  text(slide, "Barber & Odean, Journal of Finance (2000)", 0.7, 6.62, 8.9, 0.3, 13, C.muted, false, { hyperlink: { url: "https://faculty.haas.berkeley.edu/odean/Papers%20current%20versions/Individual_Investor_Performance_Final.pdf" } });
  note(slide, "The pressure to increase trade size after a win comes from the founder's experience and is the product hypothesis. Barber and Odean analyzed 66,465 US stock brokerage households from 1991 to 1996; their most active group returned 11.4% annually versus 17.9% for the market. The study is not about Solana, post-trade allocation, or Banked's effectiveness. Source: https://faculty.haas.berkeley.edu/odean/Papers%20current%20versions/Individual_Investor_Performance_Final.pdf");
}

{
  const slide = base();
  title(slide, "Keep 10 SOL. Route only the excess.", 39);
  text(slide, "Wallet at 9 SOL: sell 0", 0.7, 2.34, 5.1, 0.32, 17, C.muted);
  text(slide, "11 SOL", 0.7, 2.72, 2.3, 0.64, 36, C.ink, true);
  text(slide, "10 SOL stays in wallet", 3.17, 2.79, 5.4, 0.49, 25, C.green, true);
  text(slide, "1 SOL excess to sell", 0.7, 3.65, 5.2, 0.48, 25, C.ink, true);
  text(slide, "125.030864 USDC", 6.88, 3.58, 5.35, 0.64, 34, C.gold, true);
  slide.addShape(S.line, { x: 5.3, y: 3.95, w: 1.14, h: 0, line: { color: C.rule, width: 2, endArrowType: "triangle" } });
  const destinations = [
    { label: "SPYx", share: "20%", amount: "25.006172", color: C.gold },
    { label: "JUP", share: "20%", amount: "25.006172", color: C.green },
    { label: "Keep USDC", share: "60%", amount: "75.01852", color: C.ink },
  ];
  destinations.forEach((item, index) => {
    const x = 0.68 + index * 4.16;
    box(slide, x, 4.65, 3.72, 1.68);
    kicker(slide, item.label, x + 0.25, 4.94, 2.9);
    text(slide, item.share, x + 0.25, 5.31, 1.48, 0.49, 30, item.color, true);
    text(slide, `${item.amount} USDC`, x + 0.25, 5.9, 3.15, 0.25, 14, C.muted);
  });
  note(slide, "Illustrative example: the trader sets 10 SOL to keep in the wallet. At a 9 SOL wallet balance, Banked calculates zero to sell. At 11 SOL, it calculates 1 SOL of excess. This threshold is not cost-basis accounting and does not prove the excess came from a winning trade. In the simulation, 1 SOL produces synthetic proceeds of 125.030864 USDC. The 20/20/60 rule budgets those proceeds for SPYx, JUP, and retained USDC. Live execution still requires a wallet signature; purchases are separate steps.");
}

{
  const slide = base();
  title(slide, "Set the balance. Activate the rule.", 40);
  text(slide, "Set SOL to keep.", 0.7, 2.94, 4.9, 0.45, 26, C.ink, true);
  text(slide, "Choose where USDC goes.", 0.7, 3.8, 4.8, 0.45, 26, C.ink, true);
  text(slide, "Review each next step.", 0.7, 4.66, 4.5, 0.45, 26, C.ink, true);
  box(slide, 6.16, 2.02, 6.41, 5.26);
  slide.addImage({ path: path.join(directory, "rule-ui.png"), x: 6.24, y: 2.1, w: 6.25, h: 5.1 });
  note(slide, "Show the Banked interface. The user sets the SOL balance to keep, saves a paused rule, then activates it when ready. An active rule still requires explicit sale review and signing. The product can also import a detected finalized exit, but that is retrospective allocation. The screenshot uses simulation mode.");
}

{
  const slide = base();
  title(slide, "After the sale, see where the money went.", 39);
  text(slide, "SPYx completed. JUP still waiting.", 0.7, 2.43, 10.7, 0.48, 26, C.gold, true);
  box(slide, 0.7, 3.04, 11.92, 3.59);
  slide.addImage({ path: path.join(directory, "money-after.png"), x: 0.78, y: 3.12, w: 11.76, h: 3.39 });
  note(slide, "After recording only the SPYx purchase, the dashboard shows 25.006172 USDC routed there, the JUP budget awaiting action, and 75.01852 USDC planned for retention. These are saved operation receipts, not a current wallet balance. Simulation purchases use their allocated budget as a synthetic debit.");
}

{
  const slide = base();
  title(slide, "A bigger trade needs a stronger plan.", 42);
  text(slide, "My trade size grew faster than my discipline.", 0.7, 2.42, 11.6, 0.55, 27, C.gold, true);
  const items = [
    { x: 0.7, n: "01", name: "Decide early", detail: "Set the rule before selling" },
    { x: 4.85, n: "02", name: "Split proceeds", detail: "Give each share a job" },
    { x: 9.0, n: "03", name: "Stay honest", detail: "See unfinished actions" },
  ];
  items.forEach((item) => {
    box(slide, item.x, 3.05, 3.62, 2.42);
    kicker(slide, item.n, item.x + 0.3, 3.44, 1.1);
    text(slide, item.name, item.x + 0.3, 3.92, 3.0, 0.52, 27, C.ink, true);
    text(slide, item.detail, item.x + 0.3, 4.75, 3.0, 0.38, 16, C.muted);
  });
  note(slide, "This slide uses the founder's own experience: trading size increased faster than readiness for the emotional pressure. This is a personal observation, not a quantified claim about all traders. Banked's proposed discipline is to decide the split before the sale and retain a visible record of any unfinished destination. In the demo, completed simulation steps survive refresh. Live wallet execution remains gated.");
}

{
  const slide = base();
  title(slide, "SOL, USDC, and SPYx share one wallet.", 41);
  const items = [
    { y: 2.73, n: "01", value: "Sell SOL into USDC" },
    { y: 3.79, n: "02", value: "Route a share toward SPYx or JUP" },
    { y: 4.85, n: "03", value: "Check the receipt for every step" },
  ];
  items.forEach((item) => { kicker(slide, item.n, 0.74, item.y + 0.07, 0.8); text(slide, item.value, 1.58, item.y, 10.7, 0.54, 29, C.ink, true); });
  box(slide, 0.72, 6.16, 11.82, 0.65, C.raised, C.raised);
  text(slide, "Why now: tokenized stocks are already live on Solana.", 1.02, 6.28, 8.9, 0.32, 20, C.gold, true);
  text(slide, "Solana Foundation, 2025", 10.1, 6.32, 2.1, 0.23, 12, C.muted, false, { hyperlink: { url: "https://solana.com/id/news/case-study-xstocks" } });
  note(slide, "Solana allows the intended flow to keep SOL, USDC, and tokenized stocks in the user's wallet with on-chain transaction evidence. xStocks launched on Solana in June 2025, according to the Solana Foundation. Availability and eligibility depend on the issuer, market, and jurisdiction. Banked's current demo is simulation. An in-app sale can associate the selected rule with the connected wallet, but live execution remains gated. Purchases require separate wallet signatures. An external sale requires a manual scan, review, and rule application. Source: https://solana.com/id/news/case-study-xstocks");
}

{
  const slide = base();
  title(slide, "A focused market is already on Solana.", 42);
  box(slide, 0.7, 2.48, 5.55, 3.25);
  text(slide, "190K+", 1.05, 2.92, 4.6, 1.05, 60, C.gold, true);
  text(slide, "xStocks holders on Solana", 1.07, 4.06, 4.7, 0.43, 24, C.ink, true);
  text(slide, "Solana Foundation, August 2026", 1.07, 5.14, 4.6, 0.26, 13, C.muted, false, { hyperlink: { url: "https://solana.com/news/solana-ecosystem-roundup-august-2026" } });
  kicker(slide, "FIRST CUSTOMER", 6.83, 2.68, 3.2);
  text(slide, "A SOL trader who wants to split a realized win into stocks and USDC.", 6.83, 3.08, 5.35, 1.75, 31, C.ink, true, { valign: "top" });
  text(slide, "2% of 190K = 3,800 potential payers", 0.72, 6.25, 11.8, 0.4, 23, C.green, true);
  text(slide, "Illustrative conversion, not measured demand", 0.72, 6.71, 11.8, 0.28, 14, C.muted);
  note(slide, "Market entry point, not TAM: the Solana Foundation reported more than 190,000 xStocks holders on Solana in August 2026. These are holder accounts or addresses, not necessarily unique people, active SOL traders, eligible customers, or Banked prospects. Two percent conversion is an illustrative scenario, not a forecast. The overlap between active SOL exit traders and xStocks holders, user willingness to pay, reachability, and jurisdictional eligibility require validation. Source: https://solana.com/news/solana-ecosystem-roundup-august-2026");
}

{
  const slide = base();
  title(slide, "Charge for the plan, not more trades.", 43);
  box(slide, 0.7, 2.47, 5.57, 2.25);
  kicker(slide, "FREE", 1.04, 2.8, 2.0);
  text(slide, "Plan and track", 1.04, 3.28, 4.7, 0.55, 31, C.ink, true);
  text(slide, "Rules and receipts", 1.04, 4.12, 4.7, 0.36, 19, C.muted);
  box(slide, 6.74, 2.47, 5.57, 2.25);
  kicker(slide, "PRO, PRICE TO TEST", 7.08, 2.8, 3.5);
  text(slide, "$8 / month", 7.08, 3.28, 4.7, 0.55, 31, C.gold, true);
  text(slide, "Monitoring and alerts, planned", 7.08, 4.12, 4.9, 0.36, 19, C.muted);
  text(slide, "3,800 payers = $30.4K monthly revenue", 0.72, 5.32, 11.75, 0.46, 28, C.ink, true);
  text(slide, "$6.6K / month after assumed operating costs", 0.72, 5.92, 11.75, 0.4, 23, C.green, true);
  text(slide, "Assumes $20K fixed + $1 per payer monthly; excludes acquisition and taxes.", 0.72, 6.58, 11.7, 0.32, 15, C.muted);
  note(slide, "This is a proposed subscription model, not current revenue. The free tier would retain simple rule planning and receipts. The $8 monthly Pro tier is a price to test after live wallet-connected monitoring and alerts are validated and built. Subscription revenue aligns Banked with user discipline rather than maximizing trading volume. The scenario assumes 2% of the 190,000 xStocks holder proxy becomes 3,800 paying users: 3,800 times $8 is $30,400 monthly revenue. With assumed $20,000 monthly fixed costs and $1 monthly variable cost per paying user, monthly operating surplus is $6,600 before acquisition, taxes, and other unmodeled costs. At these assumptions operating break-even is 2,858 paying users. Conversion, price, churn, acquisition cost, actual service cost, eligibility, and premium feature demand are not validated. Do not call Banked profitable today.");
}

{
  const slide = base();
  text(slide, "Turn one win into a plan.", 0.68, 1.52, 11.7, 1.04, 52, C.ink, true, { charSpacing: -1.4 });
  text(slide, "Set the split", 0.7, 3.23, 3.6, 0.49, 28, C.gold, true);
  text(slide, "Sell 1 SOL", 4.72, 3.23, 3.8, 0.49, 28, C.ink, true);
  text(slide, "Track each share", 8.88, 3.23, 3.7, 0.49, 28, C.green, true);
  box(slide, 0.7, 4.5, 11.88, 1.3, C.raised, C.raised);
  text(slide, "Demo: SPYx completed. JUP still needs action.", 1.05, 4.86, 11.0, 0.58, 25, C.ink, true);
  note(slide, "End with the working browser simulation. Record the simulated 1 SOL sale, complete SPYx, refresh, resume JUP, and show the dashboard. The 10 SOL principal in slide two is an illustrative starting position outside Banked's tracking; Banked does not calculate gains. The demo proves product behavior in simulation, not live investment execution. Next evidence: a permitted wallet transaction with exact reconciliation, interviews with active SOL traders, and paid demand tests.");
}

await pptx.writeFile({ fileName: path.join(directory, "Banked-pitch-deck.pptx") });
