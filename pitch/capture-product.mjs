import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ channel: "chrome" });

try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
  await page.goto(process.env.BANKED_DEMO_URL ?? "http://localhost:3101/");
  await page.addStyleTag({ content: ".workspace-header { position: static !important; } .template-list, .detected-exits { display: none !important; }" });
  await page.locator(".workspace-grid").scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.locator(".workspace-grid").screenshot({ path: path.join(directory, "rule-ui.png") });
  await page.getByRole("button", { name: "Save rule" }).click();
  await page.getByRole("button", { name: "Activate rule" }).click();
  await page.getByRole("button", { name: "Record simulation proceeds" }).click();
  await page.locator(".money-dashboard").scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.locator(".money-dashboard").screenshot({ path: path.join(directory, "money-before.png") });
  await page.locator(".destination-card").filter({ has: page.getByRole("heading", { name: "SPYx", exact: true }) }).getByRole("button", { name: "Record simulation purchase" }).click();
  await page.locator(".money-dashboard").scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.locator(".money-dashboard").screenshot({ path: path.join(directory, "money-after.png") });
} finally {
  await browser.close();
}
