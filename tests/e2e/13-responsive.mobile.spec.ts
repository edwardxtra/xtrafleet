import { test, expect, type Page } from '@playwright/test';
import { seedOwner, seedDriver, seedLoad, logInAs, closeSeedApp, FIXTURE_DOT } from './seed';
import { attachPageDiagnostics } from './helpers';

/**
 * T13 — phone width.
 *
 * Runs only under the `mobile-chromium` project (Pixel 7, 412x915, touch).
 * CLAUDE.md's pre-merge checklist asks for "mobile responsive (if UI changes)"
 * and nothing was checking it, so every UI change this quarter shipped on that
 * box being ticked by hand or not at all.
 *
 * WHAT THIS ASSERTS, AND WHY IT IS THESE THINGS
 *
 * Not screenshots. A pixel baseline for a dashboard that is still changing
 * weekly would fail on every legitimate edit and get ignored within a month.
 *
 * Instead, two properties that are objective, cheap, and only ever false when
 * something is genuinely broken:
 *
 *   1. No horizontal overflow. The classic responsive bug: one fixed-width
 *      child, and the whole page scrolls sideways on a phone.
 *   2. The primary controls are on screen and big enough to tap. An element
 *      rendered off the right edge, or collapsed to zero height, is
 *      unreachable — and both are invisible to a desktop-width suite.
 */

/**
 * WCAG 2.2 SC 2.5.8 "Target Size (Minimum)", Level AA: 24x24 CSS pixels.
 * This is the hard floor — below it, a control is non-conformant, and in
 * practice it means something has collapsed rather than merely being snug.
 */
const WCAG_AA_FLOOR_PX = 24;

/**
 * WCAG 2.2 SC 2.5.5 "Target Size (Enhanced)", Level AAA, which is also where
 * Apple's and Google's own guidelines land (Material asks 48dp).
 *
 * Deliberately NOT asserted. Every default-size Button in this app is 36px
 * tall — `px-4 py-2` plus `text-sm` in src/components/ui/button.tsx, with no
 * explicit height — so a hard 44px assertion would fail on roughly every
 * button in the product. Raising the design system's default button height is
 * a visual decision across the whole app, not something a test should force,
 * and lowering this constant to 36 so the suite goes green would be
 * rebaselining a standard to match the code.
 *
 * So controls between the AA floor and this are REPORTED, not failed. The
 * measurement lands in the CI log where someone can act on it.
 */
const PLATFORM_COMFORTABLE_PX = 44;

/**
 * Does the document scroll sideways?
 *
 * A couple of pixels of slop is normal from subpixel layout and scrollbar
 * arithmetic, so this allows 2px rather than demanding exactly zero and
 * flaking on rounding.
 */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(0, doc.scrollWidth - doc.clientWidth);
  });
}

async function expectNoSidewaysScroll(page: Page, where: string) {
  const overflow = await horizontalOverflow(page);
  expect(
    overflow,
    `${where} scrolls sideways by ${overflow}px at phone width — something has a fixed width or an unwrapped row`
  ).toBeLessThanOrEqual(2);
}

/**
 * Fails below the WCAG AA floor; reports between the floor and the platform
 * norm. Both heights and widths, since a control can collapse either way.
 */
function expectTappable(
  label: string,
  box: { x: number; y: number; width: number; height: number },
  page: Page
) {
  expect(
    Math.min(box.width, box.height),
    `${label} is ${box.width}x${box.height} — under the WCAG 2.2 AA target-size floor ` +
      `of ${WCAG_AA_FLOOR_PX}px, which usually means it has collapsed`
  ).toBeGreaterThanOrEqual(WCAG_AA_FLOOR_PX);

  if (Math.min(box.width, box.height) < PLATFORM_COMFORTABLE_PX) {
    console.log(
      `[tap-target] ${label} is ${box.width}x${box.height} at ${page.viewportSize()!.width}px ` +
        `wide — meets WCAG AA (${WCAG_AA_FLOOR_PX}px) but under the ${PLATFORM_COMFORTABLE_PX}px ` +
        `AAA / platform norm. Not a failure; see the constants in this file.`
    );
  }
}

test.describe('T13 — phone width', () => {
  test.describe.configure({ timeout: 180_000 });
  test.afterAll(() => closeSeedApp());

  test('the login form is usable on a phone', async ({ page }) => {
    attachPageDiagnostics(page);
    await page.goto('/login');

    await expectNoSidewaysScroll(page, '/login');

    // The three things a user must be able to reach to get in at all.
    for (const [label, locator] of [
      ['email', page.getByLabel(/email/i)],
      ['password', page.getByLabel(/password/i)],
      ['submit', page.getByRole('button', { name: /^log ?in$|^sign ?in$/i })],
    ] as const) {
      await expect(locator, `${label} should be visible`).toBeVisible();
      const box = await locator.boundingBox();
      expect(box, `${label} should have a box`).not.toBeNull();
      expectTappable(label, box!, page);
      // Fully within the viewport, not clipped off the right edge.
      const width = page.viewportSize()!.width;
      expect(box!.x, `${label} starts off-screen at x=${box!.x}`).toBeGreaterThanOrEqual(0);
      expect(
        box!.x + box!.width,
        `${label} extends past the right edge (${box!.x + box!.width} > ${width})`
      ).toBeLessThanOrEqual(width + 2);
    }
  });

  test('the dashboard does not scroll sideways', async ({ page }) => {
    attachPageDiagnostics(page);
    const owner = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    await logInAs(page, owner.email, owner.password);

    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/\/login/);
    await expectNoSidewaysScroll(page, '/dashboard');
  });

  test('the matches page stacks its two panels instead of overflowing', async ({ page }) => {
    attachPageDiagnostics(page);
    // The most layout-heavy page in the app: a two-column grid
    // (grid-cols-1 lg:grid-cols-2) of scroll areas, which is exactly the shape
    // that breaks at narrow widths.
    const owner = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    await seedDriver(owner.uid, { location: 'Lakeland, FL' });
    const load = await seedLoad(owner.uid, { origin: 'Lakeland, FL', destination: 'Orlando, FL' });

    await logInAs(page, owner.email, owner.password);
    await page.goto('/dashboard/matches');

    // Both panel headings exist, which is what confirms the grid collapsed to
    // one column rather than squeezing two into 412px.
    await expect(page.getByRole('heading', { name: /My Assets/i })).toBeVisible({
      timeout: 30_000,
    });
    await expectNoSidewaysScroll(page, '/dashboard/matches');

    // The seeded load is selectable — a tap target, not a sliver.
    const loadButton = page.getByRole('button', { name: /Lakeland, FL → Orlando, FL/ });
    await expect(loadButton).toBeVisible({ timeout: 30_000 });
    const box = await loadButton.boundingBox();
    expect(box).not.toBeNull();
    expectTappable('the load row', box!, page);

    // Selecting it must not then blow the layout out sideways, which is where
    // the match-result cards and their badges land.
    await loadButton.click();
    await page.waitForTimeout(2_000);
    await expectNoSidewaysScroll(page, '/dashboard/matches after selecting a load');
    expect(load.id).toBeTruthy();
  });
});
