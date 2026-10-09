import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Let entrance animations finish so axe measures final colours, not mid-fade opacity. */
async function settle(page: Page) {
  await page.evaluate(() => document.querySelectorAll(".reveal").forEach((e) => e.classList.add("is-visible")));
  await page.waitForTimeout(1200);
}

async function start(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Start an analysis/ }).click();
  await expect(page.getByText("Find and profile brain tumors")).toBeVisible();
}

test("consent gate blocks analysis until ticked (PR-5)", async ({ page }) => {
  await start(page);
  const sample = page.getByRole("button", { name: /synthetic 1/ });
  await expect(sample).toBeDisabled();
  await page.getByRole("checkbox").first().check();
  await expect(sample).toBeEnabled();
});

test("server mode: sample → viewer → profile → layers → exports → delete", async ({ page }) => {
  await start(page);
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: /synthetic 1/ }).click();
  await expect(page.getByText("Region suggestive of tumor identified")).toBeVisible();
  await expect(page.getByText("server · in memory")).toBeVisible();
  await expect(page.getByText("112.9 mL")).toBeVisible();
  await expect(page.getByText("Agreement with the expert outline")).toBeVisible();
  await expect(page.getByText("Loading scan…")).toBeHidden();

  // layers + keyboard shortcuts
  await page.keyboard.press("u");
  await expect(page.getByRole("checkbox", { name: /Uncertainty map/ })).toBeChecked();
  await page.keyboard.press("2");
  await expect(page.getByRole("button", { name: "Axial" })).toHaveAttribute("aria-pressed", "true");

  // exports are produced client-side without metadata
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /PDF/ }).click()]);
  expect(pdf.suggestedFilename()).toBe("tumor_summary.pdf");
  const [mask] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /^Mask$/ }).click()]);
  expect(mask.suggestedFilename()).toBe("tumor_mask.nii.gz");

  // delete now → DELETE request + back to start
  const del = page.waitForRequest((r) => r.method() === "DELETE" && r.url().includes("/v1/results/"));
  await page.getByRole("button", { name: /Delete my data now/ }).click();
  await del;
  await expect(page.getByText("Find and profile brain tumors")).toBeVisible();
});

test("private mode runs in the browser and uploads nothing (SR-13)", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (r) => { if (r.method() !== "GET" && r.method() !== "OPTIONS") posts.push(`${r.method()} ${r.url()}`); });
  await start(page);
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: /Private mode/ }).click();
  await page.getByRole("button", { name: /synthetic 2/ }).click();
  await expect(page.getByText("Region suggestive of tumor identified")).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText(/on device · (WEBGPU|WASM)/)).toBeVisible();
  // parity with the server result for the same case
  await expect(page.getByText("51.6 mL")).toBeVisible();
  expect(posts).toEqual([]);
});

test("no-tumor sample uses calm, non-diagnostic wording (UX-8)", async ({ page }) => {
  await start(page);
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: /synthetic 3 no tumor/ }).click();
  await expect(page.getByText("No tumor region detected by the model")).toBeVisible();
  await expect(page.getByText(/does not rule out disease/)).toBeVisible();
});

for (const [name, nav] of [["start", null], ["about", "The model"], ["privacy", "Privacy"]] as const) {
  test(`accessibility (axe, WCAG 2.1 AA): ${name} page`, async ({ page }) => {
    await start(page);
    if (nav) await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: nav }).click();
    await settle(page);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}

test("accessibility (axe, WCAG 2.1 AA): landing page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("What do you want to do?")).toBeAttached();
  // reveal everything so axe evaluates final colours, not mid-animation opacity
  await page.evaluate(() => document.querySelectorAll(".reveal").forEach((e) => e.classList.add("is-visible")));
  await page.waitForTimeout(1200);
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
});

test("accessibility (axe, WCAG 2.1 AA): workspace", async ({ page }) => {
  await start(page);
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: /synthetic 1/ }).click();
  await expect(page.getByText("Region suggestive of tumor identified")).toBeVisible();
  await settle(page);
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
});

// ---------------------------------------------------------------- DICOM (fixtures from scripts/make_dicom_fixture.py)
const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const dicom = [join(FIX, "t1ce_dicom.zip"), join(FIX, "flair_dicom.zip")];

async function uploadDicom(page: Page) {
  const inputs = page.locator('input[type="file"]');
  await inputs.nth(0).setInputFiles(dicom[0]);
  await inputs.nth(1).setInputFiles(dicom[1]);
}

test("server mode: DICOM upload is de-identified before processing (PR-3)", async ({ page }) => {
  test.skip(!existsSync(dicom[0]), "run scripts/make_dicom_fixture.py first");
  await start(page);
  await page.getByRole("checkbox").first().check();
  await uploadDicom(page);
  await page.getByRole("button", { name: /Analyze my scans/ }).click();
  await expect(page.getByText(/Removed \d+ identifying DICOM attributes/).first()).toBeVisible();
  await expect(page.getByText(/Region suggestive|No tumor region/).first()).toBeVisible();
});

test("private mode: DICOM converted on device, nothing uploaded (FR-A15, SR-13)", async ({ page }) => {
  test.skip(!existsSync(dicom[0]), "run scripts/make_dicom_fixture.py first");
  const sent: string[] = [];
  page.on("request", (r) => { if (!["GET", "OPTIONS"].includes(r.method())) sent.push(r.url()); });
  await start(page);
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: /Private mode/ }).click();
  await uploadDicom(page);
  await page.getByRole("button", { name: /Analyze on this device/ }).click();
  await expect(page.getByText(/all header fields were dropped/)).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText(/on device · /)).toBeVisible();
  expect(sent).toEqual([]);
});
