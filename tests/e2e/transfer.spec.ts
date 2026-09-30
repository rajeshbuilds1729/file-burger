/**
 * End-to-end test: the complete File Burger transfer flow.
 *
 * 1. Open the sender (landing page).
 * 2. Select a file.
 * 3. Create the transfer.
 * 4. Open the receiver in a second tab.
 * 5. Accept the transfer.
 * 6. WebRTC connects and the file transfers.
 * 7. Verify the downloaded file byte-for-byte.
 * 8. Session completes on both sides.
 */

import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const FILE_CONTENT = "burger e2e transfer " + "B".repeat(8 * 1024 * 1024);

// Applies to every test: headless Chromium obfuscates host candidates as
// mDNS names that don't resolve in CI sandboxes — use real IPs so WebRTC
// connects.
test.use({
  launchOptions: {
    args: ["--disable-features=WebRtcHideLocalIpsWithMdns"],
  },
});

test("full transfer flow: sender to receiver", async ({ page, context }) => {
  test.setTimeout(180_000);

  // 1. Open sender.
  await page.goto("/");
  await expect(page.getByRole("button", { name: /drop your files/i })).toBeVisible();

  // 2. Select a file (via the file picker input).
  await page.setInputFiles('input[type="file"]', {
    name: "e2e-test.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(FILE_CONTENT, "utf8"),
  });

  // Lands on /send with the file queued.
  await expect(page).toHaveURL(/\/send$/);
  await expect(page.getByText("e2e-test.txt")).toBeVisible();

  // 3. Create the transfer.
  await page.getByRole("button", { name: /create transfer/i }).click();
  await page.waitForURL(/\/send\/[0-9A-Z]{12}$/i, { timeout: 30_000 });

  // Share card shows the link.
  const shareCode = await page
    .locator('code[aria-label^="Share link"]')
    .textContent();
  expect(shareCode).toBeTruthy();

  // 4. Open the receiver in a second tab.
  const receiverPage = await context.newPage();
  await receiverPage.goto(shareCode!);
  await expect(
    receiverPage.getByText(/someone wants to send you 1 file/i),
  ).toBeVisible({ timeout: 30_000 });

  // 5. Accept the transfer.
  await receiverPage.getByRole("button", { name: /accept transfer/i }).click();

  // 6. The premium transfer dashboard appears on both sides mid-transfer.
  await expect(receiverPage.getByText(/serving your files/i).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(/serving your files/i).first()).toBeVisible({
    timeout: 60_000,
  });

  // 7. Completion state appears.
  await expect(receiverPage.getByText(/burger served/i)).toBeVisible({
    timeout: 90_000,
  });

  // The downloaded file matches byte-for-byte.
  const downloadPromise = receiverPage.waitForEvent("download");
  await receiverPage.getByRole("button", { name: "Download", exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const downloaded = await readFile(downloadPath!, "utf8");
  expect(downloaded).toBe(FILE_CONTENT);

  // 8. The sender reaches the completion state too.
  await expect(page.getByText(/burger served/i)).toBeVisible({
    timeout: 30_000,
  });
});

test("invalid transfer link shows a clear error", async ({ page }) => {
  await page.goto("/receive/AAAAAAAAAAAA");
  await expect(
    page.getByText(/exist|expired|revoked|not found/i).first(),
  ).toBeVisible({ timeout: 20_000 });
});

test("landing page renders the primary interaction", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/File Burger/);
  await expect(page.getByRole("button", { name: /drop your files/i })).toBeVisible();
  await expect(page.getByText(/or click to browse/i)).toBeVisible();
});

test.describe("mobile layout", () => {
  test.use({
    viewport: { width: 375, height: 720 },
    isMobile: true,
    hasTouch: true,
  });

  test("no horizontal scrolling, transfer completes", async ({ page, context }) => {
    test.setTimeout(180_000);

    // Landing: no horizontal scroll, dropzone reachable.
    await page.goto("/");
    const horizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(horizontalScroll).toBe(false);
    await expect(page.getByRole("button", { name: /drop your files/i })).toBeVisible();

    // Full transfer on the mobile viewport.
    await page.setInputFiles('input[type="file"]', {
      name: "mobile-test.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("mobile transfer " + "M".repeat(100_000), "utf8"),
    });
    await expect(page).toHaveURL(/\/send$/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
    await page.getByRole("button", { name: /create transfer/i }).click();
    await page.waitForURL(/\/send\/[0-9A-Z]{12}$/i, { timeout: 30_000 });
    const shareUrl = await page.locator('code[aria-label^="Share link"]').textContent();

    const receiverPage = await context.newPage();
    await receiverPage.goto(shareUrl!);
    await expect(receiverPage.getByText(/someone wants to send you 1 file/i)).toBeVisible({
      timeout: 30_000,
    });
    await receiverPage.getByRole("button", { name: /accept transfer/i }).click();
    await expect(receiverPage.getByText(/burger served/i)).toBeVisible({ timeout: 90_000 });
  });
});
