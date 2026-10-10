// Regression tests for the second UX audit (docs/ux_audit_report.md, round 2).
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

async function runSample(page: Page, name = /synthetic 1/) {
  await page.goto("/analyze");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name }).click();
  await expect(page.getByRole("heading", { name: /Region suggestive|No tumor region/ })).toBeVisible();
  await expect(page.getByText("Loading scan…")).toBeHidden();
}

test("results keep working after the server copy is gone (TTL / delete-on-arrival)", async ({ page }) => {
  await runSample(page);
  // from now on the server has nothing: every result request 404s
  await page.route("**/v1/results/**", (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.getByRole("button", { name: "T1ce" }).click(); // reloads all viewer volumes
  await expect(page.getByText("Loading scan…")).toBeHidden();
  await expect(page.locator("section[aria-label='Scan viewer']")).not.toContainText("Not Found");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /^Mask$/ }).click()]);
  const bytes = gunzipSync(readFileSync((await dl.path())!));
  expect(bytes.length).toBeGreaterThan(348);           // a real NIfTI, not a 2-byte error body
  expect(bytes.readInt32LE(0)).toBe(348);              // NIfTI-1 header size field
});

test("PNG and PDF snapshots contain the rendered scan (not a blank canvas)", async ({ page }) => {
  await runSample(page);
  await page.waitForTimeout(800);
  const [png] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /PNG/ }).click()]);
  const pngSize = readFileSync((await png.path())!).length;
  expect(pngSize).toBeGreaterThan(20_000); // a blank WebGL capture is a few KB
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /PDF/ }).click()]);
  const pdfBuf = readFileSync((await pdf.path())!);
  expect(pdfBuf.includes(Buffer.from("/DCTDecode"))).toBe(true);   // embedded JPEG snapshot
  expect(pdfBuf.length).toBeLessThan(1_500_000);                   // was 3.5 MB with a blank PNG
});

test("PDF warns when the model uses synthetic demo weights", async ({ page }) => {
  const card = await (await page.request.get(`${process.env.E2E_API_URL ?? "http://localhost:8001"}/v1/model`)).json();
  test.skip(!card.synthetic, "real model deployed");
  await runSample(page);
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /PDF/ }).click()]);
  expect(readFileSync((await pdf.path())!).toString("latin1")).toContain("DEMO WEIGHTS");
});

test("private mode can be prepared for offline use, with progress, then says it is ready", async ({ page }) => {
  await page.goto("/analyze");
  await page.getByRole("button", { name: /Private mode/ }).click();
  await page.getByRole("button", { name: "Download for offline use" }).click();
  await expect(page.getByText("Ready offline.")).toBeVisible({ timeout: 120_000 });
  await page.reload(); // persisted in Cache Storage
  await page.getByRole("button", { name: /Private mode/ }).click();
  await expect(page.getByText("Ready offline.")).toBeVisible();
});

test("new users can download a sample pair to try the upload", async ({ page }) => {
  await page.goto("/analyze");
  const t1 = page.getByRole("link", { name: "T1ce", exact: true });
  await expect(t1).toHaveAttribute("href", /\/v1\/samples\/.+\/t1ce\.nii\.gz$/);
  await expect(page.getByRole("link", { name: "FLAIR", exact: true })).toHaveAttribute("href", /flair\.nii\.gz$/);
});

test("glossary and viewer help are available in the workspace", async ({ page }) => {
  await runSample(page);
  await page.getByText("What do these numbers mean?").click();
  await expect(page.getByText(/Two human experts typically agree/)).toBeVisible();
  await page.getByText("Mouse & keyboard").click();
  await expect(page.getByText(/change slice/)).toBeVisible();
  await page.keyboard.press("u");
  await expect(page.getByRole("img", { name: /Uncertainty colour scale/ })).toBeVisible();
});
