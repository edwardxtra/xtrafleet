import { test, expect } from '@playwright/test';
import { seedOwner, seedLoad, logInAs, closeSeedApp, FIXTURE_DOT } from '../e2e/seed';
import { seedMarketplace } from './seed-marketplace';

/**
 * Marketplace scale benchmark.
 *
 * Measures what /dashboard/matches actually costs a user as the marketplace
 * grows, because the page opens three UNFILTERED collection-group listeners —
 * every driver, every load, every committed match — and runs the matcher over
 * all of it in the browser. The work therefore grows with the size of the
 * network rather than with what the user asked for.
 *
 * This is a measurement tool, not a test. It asserts almost nothing: the
 * output is the table it prints. The one assertion is that the page loaded at
 * all, so a run that silently rendered nothing cannot be read as a fast result.
 *
 * Run: npm run bench:marketplace
 * Sizes: BENCH_STEPS="200,800,2000" (carriers) · BENCH_DRIVERS=8 (per carrier)
 */

const STEPS = (process.env.BENCH_STEPS ?? '200,800,2000')
  .split(',')
  .map((n) => parseInt(n.trim(), 10))
  .filter((n) => Number.isFinite(n) && n > 0);

const DRIVERS_PER_CARRIER = parseInt(process.env.BENCH_DRIVERS ?? '8', 10);

interface Row {
  carriers: number;
  drivers: number;
  seedMs: number;
  /** First moment the user sees ANY driver. */
  firstDataMs: number | null;
  /** Moment the count stopped changing — the real "ready". */
  settledMs: number | null;
  driversSeen: number | null;
  /** Snapshots delivered before the count settled. A leading 0 is an empty first paint. */
  emissions: number[];
  /** Bytes from the Firestore emulator — the marketplace payload itself. */
  dataBytes: number;
  /** Everything else, dominated by the Next.js dev bundle. Constant overhead. */
  appBytes: number;
}

const rows: Row[] = [];

test.describe.configure({ mode: 'serial', timeout: 30 * 60_000 });

test.afterAll(async () => {
  closeSeedApp();
  const fmt = (n: number) => n.toLocaleString();
  const mb = (b: number) => (b / 1_048_576).toFixed(1) + ' MB';
  console.log('\n\n=== MARKETPLACE SCALE BENCHMARK ===');
  const secs = (n: number | null) => (n === null ? 'never' : (n / 1000).toFixed(1) + ' s');
  console.log('carriers | drivers | first driver shown | count settled | marketplace data | received');
  console.log('---------|---------|--------------------|---------------|------------------|---------');
  for (const r of rows) {
    console.log(
      `${String(fmt(r.carriers)).padStart(8)} | ${String(fmt(r.drivers)).padStart(7)} | ` +
        `${secs(r.firstDataMs).padStart(18)} | ${secs(r.settledMs).padStart(13)} | ` +
        `${mb(r.dataBytes).padStart(16)} | ${r.driversSeen === null ? 'n/a' : fmt(r.driversSeen)}`
    );
  }
  console.log('\nSnapshot sequences (a leading 0 is an empty first paint — the user is');
  console.log('told there is no capacity before the real data lands):');
  for (const r of rows) {
    console.log(`  ${fmt(r.carriers).padStart(6)} carriers: [${r.emissions.join(', ')}]`);
  }
  console.log('\nMarketplace data is what grows with the network. The app bundle is dev-mode');
  console.log('overhead and roughly constant — production ships a fraction of it.');
  console.log('Seeding is cumulative: each step adds to what the previous one left.\n');
});

STEPS.forEach((carriers, step) => {
  test(`step ${step + 1}: +${carriers} carriers`, async ({ page, context }) => {
    // Each step ADDS to what the last one seeded, so the sizes accumulate the
    // way a growing network would rather than resetting between runs.
    const seeded = await seedMarketplace({ carriers, driversPerCarrier: DRIVERS_PER_CARRIER });

    // The measuring user: a real owner with a real load, so the matcher has
    // something to score the marketplace against.
    const owner = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    await seedLoad(owner.uid, { origin: 'Lakeland, FL', destination: 'Orlando, FL' });

    // Count bytes off the wire, split by origin. dataReceived fires per chunk,
    // which is what we need — Firestore streams over a long-lived channel, so
    // loadingFinished would not fire until the listener closes.
    //
    // Splitting matters: the dev server ships an unminified bundle that dwarfs
    // the data at small marketplace sizes and would hide the signal entirely.
    // Only the Firestore column grows with the network.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    const urlFor = new Map<string, string>();
    let dataBytes = 0;
    let appBytes = 0;
    cdp.on('Network.requestWillBeSent', (e: { requestId: string; request: { url: string } }) => {
      urlFor.set(e.requestId, e.request.url);
    });
    cdp.on('Network.dataReceived', (e: { requestId: string; encodedDataLength: number; dataLength: number }) => {
      const n = e.encodedDataLength > 0 ? e.encodedDataLength : e.dataLength;
      const url = urlFor.get(e.requestId) ?? '';
      if (url.includes(':8080')) dataBytes += n;
      else appBytes += n;
    });

    await logInAs(page, owner.email, owner.password);

    // Record EVERY snapshot the page reports, not just the first.
    //
    // Firestore can deliver an empty cached snapshot before the server
    // responds, and at larger sizes it reliably does — so taking the first
    // message would score an empty first paint as a complete, instant load.
    // What we actually want is two numbers: when the user first sees anything,
    // and when the count stops moving.
    const emissions: number[] = [];
    let firstDataMs: number | null = null;
    let lastChangeAt = 0;
    let startedAt = Date.now();

    page.on('console', (m) => {
      const t = m.text();
      if (!t.includes('allDrivers updated:')) return;
      const n = parseInt(t.split('allDrivers updated:')[1].trim(), 10);
      if (!Number.isFinite(n)) return;
      emissions.push(n);
      lastChangeAt = Date.now();
      if (n > 0 && firstDataMs === null) firstDataMs = lastChangeAt - startedAt;
    });
    page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));
    // A silently empty marketplace is the failure mode worth catching, so
    // surface whatever the snapshot handlers report rather than only the count.
    page.on('console', (m) => {
      if (m.type() !== 'error' && m.type() !== 'warning') return;
      const t = m.text();
      if (t.includes('snapshot error') || t.toLowerCase().includes('firestore') || t.includes('quota') || t.includes('RESOURCE')) {
        console.log(`  [browser:${m.type()}] ${t.slice(0, 400)}`);
      }
    });

    startedAt = Date.now();
    await page.goto('/dashboard/matches');

    // Settled = no new snapshot for 5s, or we give up after 10 minutes.
    const deadline = startedAt + 10 * 60_000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(1_000);
      if (emissions.length > 0 && Date.now() - lastChangeAt > 5_000) break;
    }
    const settledMs = emissions.length > 0 ? lastChangeAt - startedAt : null;
    const driversSeen = emissions.length > 0 ? emissions[emissions.length - 1] : null;

    rows.push({
      carriers: seeded.carriers,
      drivers: rows.reduce((a, r) => a + r.drivers, 0) + seeded.drivers,
      seedMs: seeded.seedMs,
      firstDataMs,
      settledMs,
      driversSeen,
      emissions,
      dataBytes,
      appBytes,
    });

    // The only assertion: the page is actually up. Without it, a run that
    // rendered nothing at all would post the fastest time on the table.
    await expect(page).toHaveURL(/\/dashboard\/matches/);
  });
});
