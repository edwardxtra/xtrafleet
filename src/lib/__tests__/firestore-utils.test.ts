import { describe, it, expect } from 'vitest';
import { stripUndefined } from '../firestore-utils';

/**
 * Firestore's client SDK rejects `undefined` field values outright. Audit
 * entries are the common trap: they are assembled from optional fields on the
 * record being acted on, and the write happens AFTER the action it records —
 * so a rejected log reports failure on work that already succeeded. Cancelling
 * a match with no TLA did exactly that (details.tlaId was undefined).
 */
describe('stripUndefined', () => {
  it('drops undefined keys', () => {
    expect(stripUndefined({ a: 1, b: undefined })).toEqual({ a: 1 });
  });

  it('drops undefined nested inside details — the match-cancel case', () => {
    const entry = {
      action: 'match_cancelled',
      targetId: 'm1',
      details: { driver: 'Tom Brady', rate: undefined, tlaId: undefined },
    };
    expect(stripUndefined(entry)).toEqual({
      action: 'match_cancelled',
      targetId: 'm1',
      details: { driver: 'Tom Brady' },
    });
  });

  it('preserves null — Firestore accepts it', () => {
    expect(stripUndefined({ suspendedAt: null })).toEqual({ suspendedAt: null });
  });

  it('leaves class instances untouched (FieldValue sentinels, Date)', () => {
    class Sentinel {}
    const sentinel = new Sentinel();
    const date = new Date('2026-01-01T00:00:00.000Z');
    const out = stripUndefined({ timestamp: sentinel, createdAt: date });
    expect(out.timestamp).toBe(sentinel);
    expect(out.createdAt).toBe(date);
  });

  it('filters undefined out of arrays and recurses into their objects', () => {
    const out = stripUndefined({
      attestations: [{ type: 'a', at: undefined }, undefined, { type: 'b' }],
    });
    expect(out).toEqual({ attestations: [{ type: 'a' }, { type: 'b' }] });
  });

  it('passes primitives through unchanged', () => {
    expect(stripUndefined('x')).toBe('x');
    expect(stripUndefined(0)).toBe(0);
    expect(stripUndefined(false)).toBe(false);
  });
});
