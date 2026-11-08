/**
 * mobile-drawer-issues.spec.js
 *
 * Focused tests for reported mobile drawer / chrome bugs:
 *  1. Inputs panel should start at the top of the screen when open
 *  2. "Calculate Outcomes" should close the drawer and show outputs
 *  3. "Go to Outputs" footer button must not be clipped at the bottom
 *  4. Pixel 5 empty state: FAB must not sit under #btn-adjust-inputs-bottom
 *  5. 320×727 empty state: same FAB clearance (narrow wrap follow-up)
 */

import { test, expect, devices } from '@playwright/test';
import { waitForAppReady } from './helpers.js';

const BASE = 'http://localhost:8080';

// iPhone 14 Pro dimensions
const MOBILE_VIEWPORT = { width: 390, height: 844 };

// Playwright Pixel 5 CSS viewport (short enough to expose the empty-state overlap)
const PIXEL5_VIEWPORT = devices['Pixel 5'].viewport;

// Narrow short phone — empty copy wraps taller than Pixel 5 and overlapped the FAB
const NARROW_320_VIEWPORT = { width: 320, height: 727 };

async function emptyStateFabGeometry(page) {
  return page.evaluate(() => {
    const fab = document.getElementById('btn-mobile-drawer');
    const bottom = document.getElementById('btn-adjust-inputs-bottom');
    const fabRect = fab.getBoundingClientRect();
    const bottomRect = bottom.getBoundingClientRect();
    const cx = fabRect.left + fabRect.width / 2;
    const cy = fabRect.top + fabRect.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const overlap = !(
      fabRect.right < bottomRect.left ||
      fabRect.left > bottomRect.right ||
      fabRect.bottom < bottomRect.top ||
      fabRect.top > bottomRect.bottom
    );
    return {
      overlap,
      gapPx: fabRect.top - bottomRect.bottom,
      hitId: hit?.id || null,
      hitIsFab: !!hit?.closest?.('#btn-mobile-drawer'),
    };
  });
}

test.describe('Mobile drawer — issue fixes', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
  });

  // -------------------------------------------------------------------------
  // Issue 1: Inputs panel must start at the top of the screen
  // -------------------------------------------------------------------------
  test('Issue 1: open drawer covers full viewport from top', async ({ page }) => {
    await page.locator('#btn-mobile-drawer').click();
    await page.waitForTimeout(400);

    const panel = page.locator('.panel-left');
    await expect(panel).toHaveClass(/drawer-open/);

    const bb = await panel.boundingBox();
    expect(bb).not.toBeNull();

    // The drawer top edge must be at or very near y=0 (top of screen)
    expect(bb.y).toBeLessThanOrEqual(5);

    // And it must span (near) the full viewport height
    expect(bb.height).toBeGreaterThanOrEqual(MOBILE_VIEWPORT.height * 0.95);
  });

  // -------------------------------------------------------------------------
  // Issue 2: "Calculate Outcomes" closes drawer and reveals outputs
  // -------------------------------------------------------------------------
  test('Issue 2: Calculate Outcomes closes drawer on mobile', async ({ page }) => {
    // Open the drawer first
    await page.locator('#btn-mobile-drawer').click();
    await page.waitForTimeout(400);
    await expect(page.locator('.panel-left')).toHaveClass(/drawer-open/);

    // Click Calculate Outcomes
    await page.locator('#btn-calculate').click();
    await page.waitForTimeout(600);

    // Drawer should now be closed
    await expect(page.locator('.panel-left')).not.toHaveClass(/drawer-open/);
  });

  test('Issue 2: After Calculate Outcomes, results panel is in view', async ({ page }) => {
    await page.locator('#btn-mobile-drawer').click();
    await page.waitForTimeout(400);

    await page.locator('#btn-calculate').click();
    await page.waitForTimeout(800);

    // Either results-content or results-empty should be visible
    const resultsContent = page.locator('#results-content');
    const resultsEmpty   = page.locator('#results-empty');
    const contentVisible = await resultsContent.isVisible().catch(() => false);
    const emptyVisible   = await resultsEmpty.isVisible().catch(() => false);
    expect(contentVisible || emptyVisible).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Issue 3: "Go to Outputs" footer button must not be clipped
  // -------------------------------------------------------------------------
  test('Issue 3: Go to Outputs button is fully visible inside drawer', async ({ page }) => {
    await page.locator('#btn-mobile-drawer').click();
    await page.waitForTimeout(400);

    const btn = page.locator('#btn-drawer-goto-outputs');
    await expect(btn).toBeVisible();

    const bb = await btn.boundingBox();
    expect(bb).not.toBeNull();

    // Button bottom edge must be within the viewport (not cut off)
    const btnBottom = bb.y + bb.height;
    expect(btnBottom).toBeLessThanOrEqual(MOBILE_VIEWPORT.height);
  });

  test('Issue 3: Go to Outputs button has meaningful height (not clipped to zero)', async ({ page }) => {
    await page.locator('#btn-mobile-drawer').click();
    await page.waitForTimeout(400);

    const btn = page.locator('#btn-drawer-goto-outputs');
    const bb  = await btn.boundingBox();
    expect(bb).not.toBeNull();
    // A fully rendered button should be at least 36px tall
    expect(bb.height).toBeGreaterThanOrEqual(36);
  });
});

// ---------------------------------------------------------------------------
// Issue 4: Pixel 5 empty-state FAB must clear the bottom Adjust Inputs row
// ---------------------------------------------------------------------------
test.describe('Mobile chrome — Pixel 5 empty-state FAB clearance', () => {
  test.use({ viewport: PIXEL5_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
  });

  test('Issue 4: FAB does not overlap #btn-adjust-inputs-bottom on empty state', async ({ page }) => {
    await expect(page.locator('#results-empty')).toBeVisible();
    await expect(page.locator('#btn-mobile-drawer')).toBeVisible();
    await expect(page.locator('#btn-adjust-inputs-bottom')).toBeVisible();

    const geometry = await emptyStateFabGeometry(page);

    expect(geometry.overlap).toBe(false);
    expect(geometry.hitIsFab).toBe(true);
    expect(geometry.hitId).not.toBe('btn-adjust-inputs-bottom');
  });

  test('Issue 4: FAB remains tappable and opens the drawer on empty state', async ({ page }) => {
    await page.locator('#btn-mobile-drawer').click();
    await page.waitForTimeout(400);
    await expect(page.locator('.panel-left')).toHaveClass(/drawer-open/);
  });
});

// ---------------------------------------------------------------------------
// Issue 5: 320×727 empty-state FAB must clear the bottom Adjust Inputs row
// ---------------------------------------------------------------------------
test.describe('Mobile chrome — 320px empty-state FAB clearance', () => {
  test.use({ viewport: NARROW_320_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
  });

  test('Issue 5: FAB does not overlap #btn-adjust-inputs-bottom on empty state', async ({ page }) => {
    await expect(page.locator('#results-empty')).toBeVisible();
    await expect(page.locator('#btn-mobile-drawer')).toBeVisible();
    await expect(page.locator('#btn-adjust-inputs-bottom')).toBeVisible();

    const geometry = await emptyStateFabGeometry(page);

    expect(geometry.overlap).toBe(false);
    expect(geometry.gapPx).toBeGreaterThan(0);
    expect(geometry.hitIsFab).toBe(true);
    expect(geometry.hitId).not.toBe('btn-adjust-inputs-bottom');
  });

  test('Issue 5: FAB remains tappable and opens the drawer on empty state', async ({ page }) => {
    await page.locator('#btn-mobile-drawer').click();
    await page.waitForTimeout(400);
    await expect(page.locator('.panel-left')).toHaveClass(/drawer-open/);
  });
});
