/**
 * TMS integration layer (DEV-155) — public surface.
 *
 * Import from `@/lib/tms`, not from the individual modules, so the port can
 * be reorganized without touching call sites.
 *
 * Server-only modules (`events`, `connections`) are intentionally NOT
 * re-exported here: they pull in firebase-admin, which must never reach a
 * client bundle. Import those directly from server code.
 */

export * from './types';
export * from './registry';
export * from './normalize';
export * from './signature';
export { mockTmsAdapter, resetMockTmsData, failNextMockCall } from './adapters/mock';
