import { expect, test } from "@playwright/test";

test("dashboard navigation remains usable with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page).toHaveURL(/#dashboard$/);
  await expect(page.getByRole("region", { name: "Where the exit went" })).toBeVisible();
  await expect(page.locator(".scroll-progress")).toBeHidden();
  await page.getByRole("button", { name: "Save rule" }).click();
  await page.getByRole("button", { name: "Activate rule" }).click();
  await page.getByRole("button", { name: "Record simulation proceeds" }).click();
  await expect(page.getByRole("region", { name: "Where the exit went" })).toContainText("125.030864");
});

test("scroll progress follows the page without hiding the exit controls", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

  await expect.poll(() => page.locator(".scroll-progress").evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)).toBeGreaterThan(0.8);
  await expect(page.getByRole("button", { name: "Record simulation proceeds" })).toBeDisabled();
});
