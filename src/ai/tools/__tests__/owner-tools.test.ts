import { describe, it, expect } from 'vitest';
import { buildOwnerTools } from '../owner-tools';

/**
 * The agent's tool surface (DEV-151).
 *
 * These tools run with the Admin SDK, which bypasses Firestore rules. The
 * ONLY thing keeping one carrier out of another's data is that `ownerId`
 * lives in a closure and never in a tool's input schema — so the model can
 * choose which tool to call, but not whose data to read.
 *
 * That invariant is testable without touching Firestore, and it is the most
 * important thing in this file.
 */

function actionOf(t: unknown): { name: string; inputSchema?: { shape?: Record<string, unknown> } } {
  return (t as { __action: { name: string; inputSchema?: { shape?: Record<string, unknown> } } }).__action;
}

function inputKeys(t: unknown): string[] {
  const shape = actionOf(t).inputSchema?.shape;
  return shape ? Object.keys(shape) : [];
}

describe('buildOwnerTools', () => {
  const tools = buildOwnerTools('owner-123');

  it('exposes exactly the read-only tools the agent needs', () => {
    expect(tools.map((t) => actionOf(t).name).sort()).toEqual([
      'findAvailableDrivers',
      'getMyDrivers',
      'getMyLoads',
    ]);
  });

  it('NEVER accepts an owner or user id as a tool argument', () => {
    // Covers findAvailableDrivers too, which reads ACROSS carriers — there
    // the closure still decides who is asking, and so whose own fleet is
    // excluded from the results.
    // The security invariant. If an owner id were a parameter, a confused or
    // prompt-injected model could name someone else's and the query would
    // faithfully serve it.
    const forbidden = /owner|user|uid|account|tenant|company/i;
    for (const t of tools) {
      const offending = inputKeys(t).filter((k) => forbidden.test(k));
      expect(offending, `${actionOf(t).name} must not take an identity argument`).toEqual([]);
    }
  });

  it('takes only narrow, harmless filters', () => {
    const byName = Object.fromEntries(tools.map((t) => [actionOf(t).name, inputKeys(t)]));
    expect(byName.getMyDrivers).toEqual(['nameContains']);
    expect(byName.getMyLoads).toEqual(['onlyOpen']);
    // The capacity search takes trip details only — never a carrier, owner
    // or driver id it could be steered toward.
    expect(byName.findAvailableDrivers).toEqual([
      'origin',
      'destination',
      'pickupDate',
      'trailerType',
    ]);
  });

  it('builds an independent tool set per owner', () => {
    // Two callers must never share a tool instance — the closure is the
    // boundary, so a shared instance would be a shared boundary.
    const a = buildOwnerTools('owner-a');
    const b = buildOwnerTools('owner-b');
    expect(a[0]).not.toBe(b[0]);
  });

  it('describes each tool well enough for the model to pick correctly', () => {
    for (const t of tools) {
      const description = (actionOf(t) as unknown as { description?: string }).description ?? '';
      expect(description.length).toBeGreaterThan(40);
    }
  });
});
