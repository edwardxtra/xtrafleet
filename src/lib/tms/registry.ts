/**
 * Adapter registry + capability guard (DEV-155).
 *
 * Adapters register themselves here so call sites depend on the port, not on
 * a concrete provider. Registration is explicit (no dynamic import scanning)
 * because Next.js bundles per route and a scan would drag every provider SDK
 * into every bundle.
 */

import type {
  TmsAdapter,
  TmsCapability,
  TmsContext,
  TmsProviderId,
  TmsResult,
} from './types';
import { tmsErr, tmsOk } from './types';
import { mockTmsAdapter } from './adapters/mock';

const adapters = new Map<TmsProviderId, TmsAdapter>();

export function registerTmsAdapter(adapter: TmsAdapter): void {
  adapters.set(adapter.provider, adapter);
}

export function getTmsAdapter(provider: TmsProviderId): TmsAdapter | undefined {
  return adapters.get(provider);
}

export function registeredProviders(): TmsProviderId[] {
  return [...adapters.keys()];
}

/** Test seam — resets to the built-in set. */
export function resetTmsRegistry(): void {
  adapters.clear();
  registerTmsAdapter(mockTmsAdapter);
}

resetTmsRegistry();

export function adapterSupports(
  adapter: TmsAdapter,
  capability: TmsCapability
): boolean {
  return adapter.capabilities.includes(capability);
}

/**
 * Resolve an adapter and assert a capability in one step.
 *
 * Two separate failure modes on purpose: "we've never heard of this
 * provider" is a configuration bug, "this provider can't do that" is an
 * expected runtime condition the UI should render as a disabled feature.
 */
export function resolveAdapter(
  provider: TmsProviderId,
  capability: TmsCapability
): TmsResult<TmsAdapter> {
  const adapter = adapters.get(provider);
  if (!adapter) {
    return tmsErr('not_configured', `No adapter registered for "${provider}"`, {
      retryable: false,
    });
  }
  if (!adapterSupports(adapter, capability)) {
    return tmsErr(
      'unsupported',
      `Provider "${provider}" does not support "${capability}"`,
      { retryable: false }
    );
  }
  return tmsOk(adapter);
}

/**
 * The capabilities actually usable on a connection: what the adapter can do,
 * intersected with what the customer's account granted. A licence that
 * doesn't include the dispatch API is indistinguishable from a provider that
 * lacks it, as far as the UI is concerned.
 */
export function effectiveCapabilities(ctx: TmsContext): TmsCapability[] {
  const adapter = adapters.get(ctx.connection.provider);
  if (!adapter) return [];
  const granted = new Set(ctx.connection.grantedCapabilities);
  return adapter.capabilities.filter((c) => granted.has(c));
}
