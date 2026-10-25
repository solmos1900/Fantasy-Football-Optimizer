/**
 * Regression: chat composer must not intersect the fixed primary nav.
 *
 * Viewports: 1280x430 (short desktop), 1280x800 (tall desktop), 390x844 (mobile).
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 node scripts/verify-chat-composer-nav.mjs
 *   BASE_URL=https://… SCREENSHOT_DIR=… node scripts/verify-chat-composer-nav.mjs
 *
 * Optional:
 *   SCREENSHOT_DIR=docs/screenshots/chat-composer-nav
 *   SCREENSHOT_PREFIX=after   # filename prefix
 *   SKIP_ASSERT=1            # capture only (e.g. production before fix)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || "";
const SCREENSHOT_PREFIX = process.env.SCREENSHOT_PREFIX || "shot";
const SKIP_ASSERT = process.env.SKIP_ASSERT === "1";

const VIEWPORTS = [
  { name: "desktop-short", width: 1280, height: 430 },
  { name: "desktop-tall", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
];

/** Normalize Playwright boundingBox ({x,y,width,height}) to edge rect. */
function toRect(box) {
  return {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    top: box.y,
    left: box.x,
    bottom: box.y + box.height,
    right: box.x + box.width,
  };
}

function boxesIntersect(a, b, pad = 0) {
  const A = toRect(a);
  const B = toRect(b);
  return !(
    A.bottom + pad <= B.top ||
    B.bottom + pad <= A.top ||
    A.right + pad <= B.left ||
    B.right + pad <= A.left
  );
}

async function dismissConnectGuide(page) {
  // First-run onboarding overlays the chat; skip so we can measure the composer.
  const skip = page.getByRole("button", { name: /^Skip$/i });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await skip.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
  }
  // Escape hatch if Skip is absent but dialog remains.
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
  }
}

async function guestSignIn(page) {
  await page.goto(`${BASE_URL}/login?mode=guest`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  // Ensure Auth.js CSRF cookie is ready before credentials POST.
  await page.waitForResponse(
    (r) => r.url().includes("/api/auth/csrf") && r.ok(),
    { timeout: 15_000 },
  ).catch(() => {});
  const name = page.getByPlaceholder("Guest");
  if (await name.isVisible().catch(() => false)) {
    await name.fill("Sebastian QA");
  }
  await page.getByRole("button", { name: /Continue as Guest/i }).click();
  await page.waitForURL(/\/dashboard/, {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  });
  await dismissConnectGuide(page);
  await page
    .getByLabel("Chat message")
    .waitFor({ state: "visible", timeout: 30_000 });
}

async function measure(page) {
  const composer = page.getByTestId("chat-composer");
  const composerFallback = page.getByLabel("Chat message");
  const nav = page.getByTestId("primary-nav");
  const navFallback = page.getByRole("navigation", { name: "Primary" });

  const composerEl = (await composer.count())
    ? composer
    : composerFallback;
  const navEl = (await nav.count()) ? nav : navFallback;

  // Prefer the outer composer form / dock for full control chrome.
  const dock = page.getByTestId("chat-composer-dock");
  const target =
    (await dock.count()) > 0
      ? dock
      : (await composer.count()) > 0
        ? composer
        : composerEl;

  await target.waitFor({ state: "visible", timeout: 15_000 });
  await navEl.waitFor({ state: "visible", timeout: 15_000 });

  const composerBox = await target.boundingBox();
  const navBox = await navEl.boundingBox();
  assert.ok(composerBox, "composer bounding box missing");
  assert.ok(navBox, "nav bounding box missing");

  // Also ensure the textarea itself is fully on-screen above the nav.
  const input = page.getByLabel("Chat message");
  const inputBox = await input.boundingBox();
  assert.ok(inputBox, "composer input bounding box missing");

  return { composerBox, navBox, inputBox };
}

async function main() {
  if (SCREENSHOT_DIR) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      });
      // Skip first-run connect guide so it doesn't cover the composer.
      await context.addInitScript(() => {
        try {
          sessionStorage.setItem("giq-connect-guide-seen-guest", "1");
        } catch {
          /* ignore */
        }
      });
      const page = await context.newPage();
      await guestSignIn(page);

      // Settle layout (fonts / sticky chrome).
      await page.waitForTimeout(400);
      await page.evaluate(() => window.scrollTo(0, 0));

      const { composerBox, navBox, inputBox } = await measure(page);

      if (SCREENSHOT_DIR) {
        const file = path.join(
          SCREENSHOT_DIR,
          `${SCREENSHOT_PREFIX}-${vp.name}-${vp.width}x${vp.height}.png`,
        );
        await page.screenshot({ path: file, fullPage: false });
        console.log(`screenshot ${file}`);
      }

      const composerRect = toRect(composerBox);
      const inputRect = toRect(inputBox);
      const navRect = toRect(navBox);
      const overlapComposer = boxesIntersect(composerRect, navRect);
      const overlapInput = boxesIntersect(inputRect, navRect);
      const gap = navRect.top - composerRect.bottom;

      const row = {
        viewport: `${vp.width}x${vp.height}`,
        name: vp.name,
        composer: composerRect,
        input: inputRect,
        nav: navRect,
        gapPx: Math.round(gap * 10) / 10,
        overlapComposer,
        overlapInput,
      };
      results.push(row);

      console.log(
        JSON.stringify(
          {
            viewport: row.viewport,
            gapPx: row.gapPx,
            overlapComposer,
            overlapInput,
          },
          null,
          0,
        ),
      );

      if (!SKIP_ASSERT) {
        assert.equal(
          overlapComposer,
          false,
          `${vp.name}: composer intersects primary nav (gap=${gap})`,
        );
        assert.equal(
          overlapInput,
          false,
          `${vp.name}: composer input intersects primary nav`,
        );
        assert.ok(
          gap >= 0,
          `${vp.name}: composer bottom (${composerRect.bottom}) is below nav top (${navRect.top})`,
        );
        // Input must be fully within the viewport vertically.
        assert.ok(
          inputRect.top >= 0 && inputRect.bottom <= vp.height + 1,
          `${vp.name}: composer input not fully within viewport (top=${inputRect.top}, bottom=${inputRect.bottom}, vh=${vp.height})`,
        );
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(
    SKIP_ASSERT
      ? "Captured screenshots (assertions skipped)."
      : "OK: composer stays above primary nav at all checked viewports.",
  );
  console.log(JSON.stringify({ baseUrl: BASE_URL, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
