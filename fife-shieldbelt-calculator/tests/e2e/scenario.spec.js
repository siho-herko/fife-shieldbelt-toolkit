import { test,expect } from '@playwright/test';
import { waitForAppReady,openStep } from './helpers.js';
async function inputs(page){if(await page.locator('#btn-mobile-drawer').isVisible())await page.locator('#btn-mobile-drawer').click();await openStep(page,6);}
test('zero-sales scenario survives sharing without an ONCRA pass',async({page})=>{
 await page.goto('/?variant=HV2');await waitForAppReady(page);await inputs(page);
 await page.getByText('Sales and sponsorship',{exact:true}).click();
 await page.locator('#scenario-soldPercent').fill('0');await page.locator('#scenario-soldPercent').press('Tab');
 await expect(page.locator('#stat-25yr-carbon')).toHaveText('£0');
 const url=page.url();await page.goto(url);await waitForAppReady(page);
 await expect(page.locator('#scenario-soldPercent')).toHaveValue('0');
 await expect(page.locator('#stack-tests')).not.toContainText('Passes screen');
 await expect(page.locator('#stack-tests')).toContainText('No IRR exists');
});
test('sponsorship uses a contribution amount rather than a gross-tonne price',async({page})=>{
 await page.goto('/?variant=HV2');await waitForAppReady(page);await inputs(page);
 await page.locator('[data-carbon-route="contribution"]').click();
 await page.getByText('Sales and sponsorship',{exact:true}).click();
 await page.locator('#scenario-sponsorshipPerKm').fill('100');await page.locator('#scenario-sponsorshipPerKm').press('Tab');
 await expect(page.locator('#stat-25yr-carbon')).toHaveText('£2,500');
 await expect(page.locator('#stack-table')).toContainText('no tonnes sold');
});
test('incompatible riparian URL placement is corrected and baseline applied',async({page})=>{
 await page.goto('/?variant=HV7&placement=downSlope');await waitForAppReady(page);
 await expect(page).toHaveURL(/placement=riparian/);
 await expect(page.locator('#stat-agro-benefit')).toHaveText('−£690/yr');
 await expect(page.locator('[data-placement="downSlope"]')).toBeDisabled();
});
test('changing preset from riparian to contour updates placement',async({page,isMobile})=>{
 test.skip(isMobile,'Preset switching is additionally covered by the mobile input smoke check.');
 await page.goto('/?variant=HV7');await waitForAppReady(page);await openStep(page,4);
 const id=await page.locator('#variant-select option').filter({hasText:'HV6.'}).getAttribute('value');
 await page.locator('#variant-select').selectOption(id);
 await expect(page).toHaveURL(/placement=crossSlope/);
});

test('IRR "none" explains whether the cash flows never pay back (default HV2)', async ({ page }) => {
  await page.goto('/?variant=HV2'); await waitForAppReady(page);
  await expect(page.locator('#stack-tests')).toContainText('lose money at every discount rate');
});

test('planting cost basis and custom cost change the establishment row', async ({ page }) => {
  await page.goto('/?variant=HV2'); await waitForAppReady(page); await inputs(page);
  await expect(page.locator('#stack-table')).toContainText('planting £16.00/m');
  await page.getByText('Planting costs', { exact: true }).click();
  await page.locator('#scenario-establishmentBasis').selectOption('high');
  await expect(page.locator('#stack-table')).toContainText('planting £23.00/m');
  await page.locator('#scenario-establishmentBasis').selectOption('custom');
  await page.locator('#scenario-plantingCostPerM').fill('12.5'); await page.locator('#scenario-plantingCostPerM').press('Tab');
  await expect(page.locator('#stack-table')).toContainText('planting £12.50/m');
  await expect(page.locator('#scenario-cost-hint')).toContainText('low £11.00, central £16.00, high £23.00');
});
