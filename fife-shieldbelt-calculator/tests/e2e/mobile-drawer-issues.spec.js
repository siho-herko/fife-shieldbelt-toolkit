/**
 * mobile-drawer-issues.spec.js
 *
 * Focused tests for three reported mobile drawer bugs:
 *  1. Inputs panel should start at the top of the screen when open
 *  2. "Calculate Outcomes" should close the drawer and show outputs
 *  3. "Go to Outputs" footer button must not be clipped at the bottom
 */

import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers.js';

const BASE = 'http://localhost:8080';

// iPhone 14 Pro dimensions
const MOBILE_VIEWPORT = { width: 390, height: 844 };

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
