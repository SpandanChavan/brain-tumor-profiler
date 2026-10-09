// Regression tests for the issues found in the UX audit (docs/ux_audit_report.md).
import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const F = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

test("URLs: each page has a real URL; Back/Forward and refresh work", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Start an analysis/ }).click();
  await expect(page).toHaveURL(/\/analyze$/);
  await expect(page).toHaveTitle(/Analyze/);
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/analyze$/);
  await expect(page.getByText("Find and profile brain tumors")).toBeVisible();
  await page.goBack();
  await expect(page.getByText("Brain tumors, outlined in")).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/analyze$/);
  await page.reload();
  await expect(page.getByText("Find and profile brain tumors")).toBeVisible();
});

test("URLs: deep links open the right page directly", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Your scan, your device");
  await page.goto("/model");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("What it is");
  await page.goto("/does-not-exist");
  await expect(page.getByText("Brain tumors, outlined in")).toBeVisible(); // unknown → home
});

test("skip link jumps keyboard users past the navigation", async ({ page }) => {
  await page.goto("/analyze");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});

test("same file for both sequences is rejected with a clear message", async ({ page }) => {
  test.skip(!existsSync(join(F, "ok_flair.nii.gz")), "fixtures missing");
  await page.goto("/analyze");
  await page.getByRole("checkbox").first().check();
  const inputs = page.locator('input[type="file"]');
  await inputs.nth(0).setInputFiles(join(F, "ok_flair.nii.gz"));
  await inputs.nth(1).setInputFiles(join(F, "ok_flair.nii.gz"));
  await page.getByRole("button", { name: /Analyze my scans/ }).click();
  await expect(page.getByRole("alert")).toContainText("same file for T1ce and FLAIR");
});

test("an analysis can be cancelled (slow / sleeping server)", async ({ page }) => {
  await page.route("**/v1/samples/*/segment**", () => { /* never answers: simulates a cold free server */ });
  await page.goto("/analyze");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: /synthetic 1/ }).click();
  await expect(page.getByText("Reading the scan")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Find and profile brain tumors")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0); // cancelling is not an error
});

test("mobile workspace shows scan, then result, then controls", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/analyze");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: /synthetic 1/ }).click();
  await expect(page.getByText("Region suggestive of tumor identified")).toBeVisible();
  const top = async (label: string) => (await page.getByLabel(label, { exact: true }).boundingBox())!.y;
  expect(await top("Scan viewer")).toBeLessThan(await top("Results"));
  expect(await top("Results")).toBeLessThan(await top("Viewer controls"));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test("mobile menu opens, navigates and closes", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.locator("#mobile-menu").getByRole("button", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.locator("#mobile-menu")).toBeHidden();
});
