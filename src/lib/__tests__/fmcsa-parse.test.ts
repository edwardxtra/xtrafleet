import { describe, it, expect } from 'vitest';
import { stripSAFERHtml, parseSAFERText } from '../fmcsa';

describe('stripSAFERHtml — tag stripping + entity decoding', () => {
  it('returns plain text unchanged (other than trim)', () => {
    expect(stripSAFERHtml('hello world')).toBe('hello world');
  });

  it('strips simple opening/closing tags', () => {
    expect(stripSAFERHtml('<b>hi</b>')).toBe('hi');
  });

  it('strips nested tags', () => {
    expect(stripSAFERHtml('<div><span>nested <b>bold</b></span></div>')).toBe('nested bold');
  });

  it('removes <script> blocks entirely (content too)', () => {
    const html = 'before<script>var x = 1; var y = 2;</script>after';
    expect(stripSAFERHtml(html)).toBe('before after');
  });

  it('removes <style> blocks entirely', () => {
    const html = 'a<style>.x { color: red; }</style>b';
    expect(stripSAFERHtml(html)).toBe('a b');
  });

  it('removes HTML comments', () => {
    expect(stripSAFERHtml('a<!-- hidden -->b')).toBe('a b');
  });

  it('decodes &nbsp; entities to spaces', () => {
    expect(stripSAFERHtml('a&nbsp;b')).toBe('a b');
  });

  it('decodes &amp; entities to ampersands', () => {
    expect(stripSAFERHtml('Smith&amp;Co')).toBe('Smith&Co');
  });

  it('collapses repeated whitespace to a single space', () => {
    expect(stripSAFERHtml('a   b\n\tc')).toBe('a b c');
  });

  it('handles empty input', () => {
    expect(stripSAFERHtml('')).toBe('');
  });

  it('strips a realistic chunk of SAFER markup', () => {
    const html = `
      <html><head><style>x</style></head>
      <body>
        <table><tr><td>USDOT Number:</td><td><b>123456</b></td></tr></table>
        <!-- ignored -->
        <p>Phone:&nbsp;(555)&nbsp;123-4567</p>
      </body></html>
    `;
    const text = stripSAFERHtml(html);
    expect(text).toContain('USDOT Number: 123456');
    expect(text).toContain('Phone: (555) 123-4567');
    expect(text).not.toContain('<');
    expect(text).not.toContain('ignored');
  });
});

describe('parseSAFERText — inactive detection', () => {
  it('flags "is inactive in the SAFER database" as inactive', () => {
    const text = 'This carrier is inactive in the SAFER database. Contact …';
    expect(parseSAFERText(text).inactive).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(parseSAFERText('IS INACTIVE IN THE SAFER DATABASE').inactive).toBe(true);
  });

  it('tolerates extra whitespace between words', () => {
    expect(parseSAFERText('is   inactive   in the safer  database').inactive).toBe(true);
  });

  it('does not flag inactive when only "inactive" appears alone', () => {
    expect(parseSAFERText('previously held an inactive endorsement').inactive).toBe(false);
  });

  it('returns inactive=false on plain active text', () => {
    expect(parseSAFERText('Active authority. Allowed to operate: Y').inactive).toBe(false);
  });
});

describe('parseSAFERText — phone extraction', () => {
  it('extracts a US phone number with parentheses + dashes', () => {
    expect(parseSAFERText('Phone: (555) 123-4567').phone).toContain('123-4567');
  });

  it('keeps a digits-only phone too', () => {
    expect(parseSAFERText('Phone: 5551234567').phone).toBe('5551234567');
  });

  it('returns undefined phone when the text after the label has no digits', () => {
    expect(parseSAFERText('Phone: ()').phone).toBeUndefined();
  });
});

describe('parseSAFERText — MC/MX/FF number extraction', () => {
  it('extracts a hyphenated MC number', () => {
    expect(parseSAFERText('MC/MX/FF Number(s): MC-12345').mcNumber).toBe('MC-12345');
  });

  it('normalizes a space-separated MC number to MC-#####', () => {
    expect(parseSAFERText('MC/MX/FF Number(s): MC 12345').mcNumber).toBe('MC-12345');
  });

  it('prefers MC over MX when both are present', () => {
    expect(parseSAFERText('MC/MX/FF Number(s): MX-99999, MC-12345').mcNumber).toBe('MC-12345');
  });

  it('falls back to MX when no MC is present', () => {
    expect(parseSAFERText('MC/MX/FF Number(s): MX-99999').mcNumber).toBe('MX-99999');
  });

  it('falls back to FF when only FF is present', () => {
    expect(parseSAFERText('MC/MX/FF Number(s): FF-7777').mcNumber).toBe('FF-7777');
  });

  it('returns undefined mcNumber when the label has no MC/MX/FF token', () => {
    expect(parseSAFERText('USDOT Number: 12345').mcNumber).toBeUndefined();
  });

  it('uppercases lowercase prefixes', () => {
    expect(parseSAFERText('MC/MX/FF Number(s): mc-12345').mcNumber).toBe('MC-12345');
  });
});
