#!/usr/bin/env node
/**
 * Evaluation harness for AI document extraction (DEV-153).
 *
 * Runs the Genkit extraction flow over documents you have ALREADY processed by
 * hand, and scores it against those hand-entered values. The point is to answer
 * one question with a number instead of a vibe:
 *
 *   at what confidence threshold, if any, is auto-applying a value safe?
 *
 * The headline output is the silent-error rate — how often the model returns a
 * confident value that is wrong. A missed field costs a manual entry. A wrong
 * expiry date lands in a driver's compliance record and looks authoritative.
 *
 * Usage (from repo root):
 *
 *   GEMINI_API_KEY=... npx tsx scripts/eval-doc-extraction.ts eval/ground-truth.json
 *   npm run eval:docs -- eval/ground-truth.json
 *
 * Options:
 *   --concurrency=N   parallel requests (default 4)
 *   --out=PATH        write full JSON results (default eval/results-<ts>.json)
 *   --limit=N         only run the first N documents (smoke test)
 *
 * PRIVACY: real compliance documents contain driver PII. Keep them under
 * eval/, which is gitignored. Never commit them.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';

config();

import { extractComplianceDocument } from '../src/ai/flows/document-extraction';
import {
  scoreDocument,
  summarize,
  recommendThreshold,
  type DocumentResult,
  type GroundTruth,
} from '../src/lib/document-extraction/score';

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
};

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [k, v = 'true'] = arg.slice(2).split('=');
      flags[k] = v;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

async function toDataUri(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    throw new Error(`Unsupported file type "${ext}". Supported: ${Object.keys(MIME_BY_EXT).join(', ')}`);
  }
  const bytes = await readFile(filePath);
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

/** Simple bounded-concurrency map — avoids hammering the API and tripping rate limits. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const manifestPath = positional[0] ?? 'eval/ground-truth.json';

  if (!existsSync(manifestPath)) {
    console.error(`Ground-truth manifest not found: ${manifestPath}`);
    console.error('See docs/DOCUMENT_EXTRACTION_EVAL.md and eval/ground-truth.example.json');
    process.exit(1);
  }

  const concurrency = Number(flags.concurrency ?? 4);
  const manifestDir = path.dirname(path.resolve(manifestPath));
  let truths: GroundTruth[] = JSON.parse(await readFile(manifestPath, 'utf8'));

  if (flags.limit) truths = truths.slice(0, Number(flags.limit));

  if (truths.length === 0) {
    console.error('Manifest is empty — nothing to evaluate.');
    process.exit(1);
  }

  console.log(`\nEvaluating ${truths.length} document(s) with concurrency ${concurrency}...\n`);

  const failures: Array<{ documentId: string; error: string }> = [];
  const started = Date.now();

  const settled = await mapWithConcurrency(truths, concurrency, async (truth) => {
    const filePath = path.isAbsolute(truth.file) ? truth.file : path.join(manifestDir, truth.file);
    try {
      const documentDataUri = await toDataUri(filePath);
      // Deliberately blind: no expectedDocumentType hint. Classification is
      // part of what is being measured.
      const extracted = await extractComplianceDocument({ documentDataUri });
      process.stdout.write('.');
      return scoreDocument(truth.documentId, extracted, truth);
    } catch (error) {
      process.stdout.write('x');
      failures.push({
        documentId: truth.documentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  });

  const results = settled.filter((r): r is DocumentResult => r !== null);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n\nExtracted ${results.length}/${truths.length} in ${elapsed}s\n`);

  if (failures.length) {
    console.log('Failed to process:');
    for (const f of failures) console.log(`  ${f.documentId}: ${f.error}`);
    console.log('');
  }

  if (results.length === 0) {
    console.error('No documents succeeded — nothing to score.');
    process.exit(1);
  }

  const summary = summarize(results);

  console.log('PER FIELD');
  console.log('  field            correct  wrong  missed  hallu  absent   recall  precision');
  for (const f of summary.byField) {
    const c = f.counts;
    console.log(
      `  ${f.field.padEnd(15)} ${String(c.correct).padStart(7)} ${String(c.wrong).padStart(6)} ` +
        `${String(c.missed).padStart(7)} ${String(c.hallucinated).padStart(6)} ${String(c.absent).padStart(7)}   ` +
        `${pct(f.recall).padStart(6)}     ${pct(f.precision).padStart(6)}`
    );
  }

  console.log('\nTHRESHOLD SWEEP  (auto-apply any answered field at or above the threshold)');
  console.log('  thresh   applied   silent errors   silent rate   coverage');
  for (const p of summary.thresholds) {
    console.log(
      `  ${p.threshold.toFixed(2).padStart(6)} ${String(p.autoApplied).padStart(9)} ` +
        `${String(p.silentErrors).padStart(15)} ${pct(p.silentErrorRate).padStart(13)} ${pct(p.coverage).padStart(10)}`
    );
  }

  const recommended = recommendThreshold(summary);
  console.log('');
  if (recommended) {
    console.log(
      `RECOMMENDATION: auto-apply at confidence >= ${recommended.threshold.toFixed(2)} ` +
        `(${pct(recommended.silentErrorRate)} silent errors, removes ${pct(recommended.coverage)} of manual entry).`
    );
    console.log('Everything below that threshold goes to human review.');
  } else {
    console.log(
      'RECOMMENDATION: do not auto-apply anything yet. No threshold reached <=1% silent errors\n' +
        'with enough samples to trust. Propose every value for review, or gather more documents.'
    );
  }

  if (summary.silentErrorDetail.length) {
    console.log(`\nSILENT ERRORS (${summary.silentErrorDetail.length}) — read every one of these:`);
    for (const e of summary.silentErrorDetail) {
      console.log(
        `  [${e.documentId}] ${e.field} (${e.outcome}, conf ${e.confidence.toFixed(2)})\n` +
          `      model: ${JSON.stringify(e.predicted)}\n` +
          `      truth: ${JSON.stringify(e.truth)}`
      );
    }
  } else {
    console.log('\nNo silent errors in this run.');
  }

  const outPath = flags.out ?? `eval/results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(
    outPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), summary, results, failures }, null, 2)
  );
  console.log(`\nFull results: ${outPath}\n`);

  // Non-zero exit when the model put wrong values into fields it was confident
  // about — makes this usable as a gate if it ever runs in CI against fixtures.
  process.exit(summary.silentErrorDetail.length > 0 ? 2 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
