import { expect, test } from "@playwright/test";

test("simulation survives refresh and resumes the remaining purchase", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Save rule" }).click();
  await page.getByRole("button", { name: "Activate rule" }).click();
  await page.getByRole("button", { name: "Record simulation proceeds" }).click();
  const spyx = page.locator(".destination-card").filter({ has: page.getByRole("heading", { name: "SPYx", exact: true }) });
  await spyx.getByRole("button", { name: "Record simulation purchase" }).click();
  await expect(spyx.locator(".purchase-status")).toHaveText("finalized");
  const dashboard = page.getByRole("region", { name: "Where the exit went" });
  await expect(dashboard.locator(".money-proceeds strong")).toContainText("125.030864");
  await expect(dashboard.locator(".money-flow-grid > div").filter({ hasText: "Routed to SPYx" })).toContainText("25.006172");
  await expect(dashboard.locator(".money-flow-grid > div").filter({ hasText: "Planned to keep" })).toContainText("75.01852");

  await page.reload();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(spyx.locator(".purchase-status")).toHaveText("finalized");
  await expect(dashboard.locator(".money-flow-grid > div").filter({ hasText: "Routed to SPYx" })).toContainText("25.006172");
  await expect(page.locator(".destination-card").filter({ has: page.getByRole("heading", { name: "JUP", exact: true }) }).getByRole("button", { name: "Record simulation purchase" })).toBeVisible();
});

test("a restored wallet operation cannot be completed as a simulation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Save rule" }).click();
  await page.getByRole("button", { name: "Activate rule" }).click();
  await page.getByRole("button", { name: "Record simulation proceeds" }).click();
  await page.evaluate(() => {
    const key = "banked:rule-operations:v1";
    const operations = JSON.parse(localStorage.getItem(key) ?? "[]");
    operations[0].wallet = "11111111111111111111111111111111";
    localStorage.setItem(key, JSON.stringify(operations));
  });
  await page.reload();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("button", { name: "Record simulation purchase" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Prepare purchase" }).first()).toBeVisible();
});

test("losses do not trigger sales and paused rules leave incoming SOL untouched", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Save rule" }).click();
  await expect(page.getByRole("button", { name: "Record simulation proceeds" })).toBeDisabled();
  await page.getByRole("button", { name: "Activate rule" }).click();
  await page.getByLabel("Wallet SOL balance (simulation)").fill("9");
  await expect(page.getByRole("button", { name: "Record simulation proceeds" })).toBeDisabled();
  await expect(page.getByText("0 SOL above your keep amount.", { exact: false })).toBeVisible();
  await page.getByLabel("Wallet SOL balance (simulation)").fill("11");
  await expect(page.getByRole("button", { name: "Record simulation proceeds" })).toBeEnabled();
  await page.getByRole("button", { name: "Pause rule" }).click();
  await expect(page.getByRole("button", { name: "Record simulation proceeds" })).toBeDisabled();
  await expect(page.locator("#sol-to-keep")).toBeEnabled();
});

test("older saved rules remain paused until a SOL target is set", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("banked:rules:v1", JSON.stringify([{
    id: "old-rule", name: "Old rule", spyxBps: 20, jupBps: 20,
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  }])));
  await page.goto("/");
  await page.locator("#history summary").click();
  const oldRule = page.locator(".history-row").filter({ hasText: "Old rule" });
  await expect(oldRule).toContainText("paused");
  await oldRule.getByRole("button", { name: "Activate" }).click();
  await expect(page.locator(".workspace-message")).toContainText("Set and save a SOL balance");
  await oldRule.getByRole("button", { name: "Load" }).click();
  await expect(page.locator("#sol-to-keep")).toHaveValue("");
});
