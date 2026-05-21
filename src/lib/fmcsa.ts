/**
 * FMCSA QCMobile API Service
 * Confirmed field names from live API response:
 *
 *   phyStreet, phyCity, phyState, phyZipcode
 *   MC number -> GET /carriers/{dot}/mc-numbers
 *   phone     -> scraped from SAFER HTML (not in QCMobile API)
 *   carrierOperation -> nested { carrierOperationCode, carrierOperationDesc }
 *
 * SAFER vs QCMobile:
 *   QCMobile allowedToOperate is authoritative. SAFER can lag after reinstatements.
 *   When they disagree we set saferDiscrepancy=true for the UI to warn the user.
 */

const FMCSA_BASE = 'https://mobile.fmcsa.dot.gov/qc/services';
const SAFER_QUERY = 'https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=';
const LI_BASE = 'https://li-public.fmcsa.dot.gov/LIVIEW';

// FMCSA's public scraping hosts (safer, li-public) sit behind Akamai, which
// 403s requests without a browser-like User-Agent. Without these headers our
// fetch silently fails and nothing scraped populates in production.
const FMCSA_SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export interface LIInsurancePolicy {
  docketNumber: string;       // e.g. "MC359197", "FF023551"
  formCode: string;           // "91X", "91", "34", "84", "85" (FMCSA filing form)
  insuranceType: string;      // "BIPD/Primary", "CARGO", "SURETY", etc.
  insurer: string;            // "TRANSGUARD INSURANCE COMPANY OF AMERICA INC."
  policyNumber: string;
  effectiveDate?: string;     // MM/DD/YYYY as served by Socrata
  cancellationDate?: string;
  maxCoverage?: string;       // "750" = $750k
  underlyingLimit?: string;
}

export interface LIInsuranceSummary {
  primaryInsurer?: string;
  primaryPolicyNumber?: string;
  primaryEffectiveDate?: string;
  primaryMaxCoverage?: string;
  hasBIPD: boolean;
  hasCargo: boolean;
  hasSurety: boolean;
  policyCount: number;
}

export interface FMCSACarrier {
  dotNumber: string;
  legalName: string;
  dbaName?: string;
  mcNumber?: string;
  carrierOperation?: string;
  isBrokerOnly?: boolean;
  hqState?: string;
  hqAddress?: string;
  hqCity?: string;
  hqZip?: string;
  phone?: string;
  safetyRating?: string;
  authorityStatus?: string;
  insuranceRequired?: string;
  insuranceOnFile?: string;
  bicInsurance?: string;
  cargoInsuranceRequired?: string;
  cargoInsuranceOnFile?: string;
  allowedToOperate?: boolean;
  saferDiscrepancy?: boolean;
  liInsurance?: LIInsurancePolicy[];
  liInsuranceSummary?: LIInsuranceSummary;
}

export interface FMCSALookupResult {
  success: boolean;
  carrier?: FMCSACarrier;
  error?: string;
  raw?: unknown;
}

function getWebKey(): string {
  const key = process.env.FMCSA_WEB_KEY;
  if (!key) throw new Error('FMCSA_WEB_KEY_MISSING');
  return key;
}

function cleanDOT(dotNumber: string): string {
  return String(parseInt(dotNumber.replace(/\D/g, ''), 10));
}

function unwrapCarrier(content: Record<string, unknown>): Record<string, unknown> {
  if (content.carrier && typeof content.carrier === 'object' && content.carrier !== null) {
    return content.carrier as Record<string, unknown>;
  }
  return content;
}

function detectBrokerOnly(raw: Record<string, unknown>): boolean {
  const brokerAuth = String(raw.brokerAuthorityStatus ?? '').toUpperCase().trim();
  const commonAuth = String(raw.commonAuthorityStatus ?? '').toUpperCase().trim();
  const contractAuth = String(raw.contractAuthorityStatus ?? '').toUpperCase().trim();
  return brokerAuth === 'A' && commonAuth !== 'A' && contractAuth !== 'A';
}

/**
 * Fetch MC number from /carriers/{dot}/mc-numbers
 * Response: { content: [{ docketNumber, docketNumberId, dotNumber, prefix }] }
 */
async function fetchMCNumber(dot: string, webKey: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${FMCSA_BASE}/carriers/${dot}/mc-numbers?webKey=${webKey}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return undefined;
    const json = await res.json();
    const list: Record<string, unknown>[] = Array.isArray(json?.content) ? json.content : [];
    if (list.length === 0) return undefined;
    const mc = list.find(d => String(d.prefix ?? '').toUpperCase() === 'MC') ?? list[0];
    if (!mc.docketNumber) return undefined;
    const prefix = mc.prefix ? String(mc.prefix) : 'MC';
    return `${prefix}-${mc.docketNumber}`;
  } catch {
    return undefined;
  }
}

interface SAFERResult {
  inactive: boolean;
  phone?: string;
  mcNumber?: string;
}

/**
 * Strip scripts, styles, comments, tags, and entities from SAFER HTML and
 * collapse whitespace. SAFER's HTML wraps labels and values in deeply nested
 * legacy tags (<font>, <b>, etc.), which makes DOM-structure regexes
 * unreliable. Matching against plain text is simpler and more robust.
 */
function stripSAFERHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

interface SAFERParsed {
  inactive: boolean;
  phone?: string;
  phoneRaw?: string;
  mcNumber?: string;
  mcRaw?: string;
}

/**
 * Parse the tag-stripped SAFER text for the fields we care about.
 */
function parseSAFERText(text: string): SAFERParsed {
  const inactive = /is\s+inactive\s+in\s+the\s+safer\s+database/i.test(text);

  const phoneMatch = text.match(/\bPhone:\s*([()\d\s.+-]{7,20})/i);
  const phoneRaw = phoneMatch?.[1]?.trim();
  const phone = phoneRaw && /\d{3}/.test(phoneRaw) ? phoneRaw : undefined;

  const mcMatch = text.match(/MC\/MX\/FF Number\(s\):\s*((?:(?:MC|MX|FF)[-\s]?\d+[\s,]*)+)/i);
  const mcRaw = mcMatch?.[1]?.trim();
  let mcNumber: string | undefined;
  if (mcRaw) {
    const tokens = mcRaw.match(/(MC|MX|FF)[-\s]?\d+/gi) ?? [];
    const normalized = tokens.map(t => t.replace(/\s+/g, '-').toUpperCase());
    mcNumber =
      normalized.find(t => t.startsWith('MC-')) ??
      normalized.find(t => t.startsWith('MX-')) ??
      normalized.find(t => t.startsWith('FF-'));
  }

  return { inactive, phone, phoneRaw, mcNumber, mcRaw };
}

/**
 * Scrape SAFER HTML for inactive status, phone, and MC/MX/FF number.
 * SAFER is the only source that exposes phone (from MCS-150 filings).
 * It also provides MC/MX/FF numbers for freight forwarders, which QCMobile's
 * /mc-numbers endpoint often omits.
 */
async function checkSAFER(dot: string): Promise<SAFERResult> {
  try {
    const res = await fetch(`${SAFER_QUERY}${dot}`, {
      cache: 'no-store',
      headers: FMCSA_SCRAPE_HEADERS,
    });
    if (!res.ok) {
      console.warn(`[fmcsa] SAFER returned ${res.status} for DOT ${dot}`);
      return { inactive: false };
    }
    const html = await res.text();
    const text = stripSAFERHtml(html);
    const parsed = parseSAFERText(text);
    return { inactive: parsed.inactive, phone: parsed.phone, mcNumber: parsed.mcNumber };
  } catch (err) {
    console.warn(`[fmcsa] SAFER fetch failed for DOT ${dot}:`, err);
    return { inactive: false };
  }
}

/**
 * Debug: fetch SAFER and return status, response size, stripped-text
 * length and context windows around each label we care about, plus what
 * our extractor parsed. Used by /api/fmcsa-debug to diagnose why phone /
 * MC / inactive detection might be failing for a given DOT.
 */
export async function fetchSAFERDebug(dot: string): Promise<{
  url: string;
  status: number;
  ok: boolean;
  htmlLength: number;
  textLength: number;
  context: {
    aroundPhone?: string;
    aroundMcFfMx?: string;
    aroundInactive?: string;
  };
  parsed: SAFERParsed;
  error?: string;
}> {
  const url = `${SAFER_QUERY}${dot}`;
  try {
    const res = await fetch(url, { cache: 'no-store', headers: FMCSA_SCRAPE_HEADERS });
    const html = res.ok ? await res.text() : '';
    const text = stripSAFERHtml(html);
    const parsed = parseSAFERText(text);

    // Return 120 chars of context around each interesting label so we can
    // see what the extractor is scanning without dumping the whole page.
    const window = (label: RegExp): string | undefined => {
      const match = text.match(label);
      if (!match || match.index === undefined) return undefined;
      const start = Math.max(0, match.index - 40);
      const end = Math.min(text.length, match.index + 200);
      return text.slice(start, end);
    };

    return {
      url,
      status: res.status,
      ok: res.ok,
      htmlLength: html.length,
      textLength: text.length,
      context: {
        aroundPhone: window(/\bPhone:/i),
        aroundMcFfMx: window(/MC\/MX\/FF Number\(s\):/i),
        aroundInactive: window(/inactive in the safer database/i),
      },
      parsed,
    };
  } catch (err) {
    return {
      url,
      status: 0,
      ok: false,
      htmlLength: 0,
      textLength: 0,
      context: {},
      parsed: { inactive: false },
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Debug-only: probe FMCSA L&I (Licensing & Insurance).
 *
 * L&I uses an Oracle PL/SQL form-submit model:
 *   1. The carrier list page (prc_carrlist) is the search FORM. Submitting
 *      the search appears to require POST with form-encoded parameters and
 *      returns a results page with links containing pv_apcant_id.
 *   2. Detail pages (active insurance, authority history) are GET, keyed
 *      by that pv_apcant_id.
 *
 * Some clients also use a docket-keyed deep link via pkg_html_query.
 *
 * This debug probe tries multiple URL variants and HTTP methods so we can
 * see which paths actually return carrier data, then write a parser
 * against the right HTML in a follow-up PR.
 */
export async function fetchLIDebug(dot: string, mcNumber?: string): Promise<{
  steps: Array<{
    label: string;
    url: string;
    method: string;
    status: number;
    ok: boolean;
    htmlLength: number;
    textLength: number;
    textSnippet: string; // up to 5KB of stripped text
    extracted?: { apcantId?: string };
  }>;
  apcantId?: string;
  mcNumber?: string;
  error?: string;
}> {
  const steps: Array<{
    label: string;
    url: string;
    method: string;
    status: number;
    ok: boolean;
    htmlLength: number;
    textLength: number;
    textSnippet: string;
    extracted?: { apcantId?: string };
  }> = [];

  async function probe(
    label: string,
    url: string,
    init: RequestInit & { method?: string } = {},
  ): Promise<string> {
    const method = init.method ?? 'GET';
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        ...init,
        headers: { ...FMCSA_SCRAPE_HEADERS, ...(init.headers ?? {}) },
      });
      const html = res.ok ? await res.text() : '';
      const text = stripSAFERHtml(html);
      steps.push({
        label,
        url,
        method,
        status: res.status,
        ok: res.ok,
        htmlLength: html.length,
        textLength: text.length,
        textSnippet: text.slice(0, 5000),
      });
      return html;
    } catch (err) {
      steps.push({
        label,
        url,
        method,
        status: 0,
        ok: false,
        htmlLength: 0,
        textLength: 0,
        textSnippet: err instanceof Error ? err.message : String(err),
      });
      return '';
    }
  }

  // Strip "MC-" / "MX-" / "FF-" prefix to get just the docket number digits.
  const docketNum = mcNumber?.replace(/^[A-Z]{2,3}-?/i, '').trim();
  const docketPrefix = mcNumber?.match(/^[A-Z]{2,3}/i)?.[0]?.toUpperCase();

  try {
    // 1. POST the carrier search form. Oracle PL/SQL form submit.
    const postBody = new URLSearchParams({
      pv_vpath: 'LIVIEW',
      n_dotno: dot,
      s_prefix: '',
      n_docket: '',
      s_legalname: '',
      s_dbaname: '',
      s_state: 'NONE',
    });
    const carrlistPostHtml = await probe(
      'carrlist_post_by_dot',
      `${LI_BASE}/pkg_carrquery.prc_carrlist`,
      {
        method: 'POST',
        body: postBody.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );

    // 2. GET the same with USDOT in querystring (returned the blank form last
    //    time, but kept for comparison after any header changes).
    const carrlistGetHtml = await probe(
      'carrlist_get_by_dot',
      `${LI_BASE}/pkg_carrquery.prc_carrlist?n_dotno=${encodeURIComponent(dot)}`,
    );

    // 3. Docket-keyed deep link (works in some L&I scrapers without going
    //    through the search form). Only run when we have an MC/MX/FF.
    if (docketNum && docketPrefix) {
      await probe(
        'limain_by_docket',
        `${LI_BASE}/pkg_html_query.prc_limain?pn_docket_no=${encodeURIComponent(docketNum)}&s_prefix=${encodeURIComponent(docketPrefix)}`,
      );
      // Alt: prc_getdetail by docket prefix + number.
      await probe(
        'getdetail_by_docket',
        `${LI_BASE}/pkg_carrquery.prc_getdetail?pv_vpath=LIVIEW&pn_docket_no=${encodeURIComponent(docketNum)}&s_prefix=${encodeURIComponent(docketPrefix)}`,
      );
    }

    // Try to extract apcant_id from any of the responses we got back.
    const idFromAny = (
      carrlistPostHtml.match(/pv_apcant_id=(\d+)/i) ??
      carrlistGetHtml.match(/pv_apcant_id=(\d+)/i)
    )?.[1];
    if (steps[0]) steps[0].extracted = { apcantId: idFromAny };
    const apcantId = idFromAny;

    // 4. Detail pages keyed by apcant_id, if we found one.
    if (apcantId) {
      await probe(
        'activeinsurance_by_apcantid',
        `${LI_BASE}/pkg_carrquery.prc_activeinsurance?pv_apcant_id=${apcantId}`,
      );
      await probe(
        'authhistory_by_apcantid',
        `${LI_BASE}/pkg_carrquery.prc_authhistory?pv_apcant_id=${apcantId}`,
      );
    }

    return { steps, apcantId, mcNumber };
  } catch (err) {
    return { steps, error: err instanceof Error ? err.message : String(err) };
  }
}

// FMCSA L&I Socrata datasets on data.transportation.gov.
// qh9u-swkp  ActPendInsur-All-With-History   (active/pending — confirmed queryable schema)
// chgs-tx6x  ActPendInsur daily diff         (incremental)
// xkn3-5fci  Insur-All-With-History           (view of m7rw-edbr base)
// m7rw-edbr  Insur base dataset               (probe: view xkn3-5fci returned empty columns)
// xkmg-ff2t  InsHist view                    (probe: returned empty columns — need base id)
const SOCRATA_BASE = 'https://data.transportation.gov';
const SOCRATA_DATASETS = {
  actPendInsur: 'qh9u-swkp',
  actPendInsurDiff: 'chgs-tx6x',
  insurAll: 'xkn3-5fci',
  insurAllBase: 'm7rw-edbr',
  insHist: 'xkmg-ff2t',
} as const;

function socrataHeaders(): HeadersInit {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = process.env.SOCRATA_APP_TOKEN;
  if (token) headers['X-App-Token'] = token;
  return headers;
}

/** DOT numbers in qh9u-swkp are stored as text padded to 8 digits. */
function padDotForSocrata(dot: string): string {
  const digits = dot.replace(/\D/g, '');
  return digits.padStart(8, '0').slice(-8);
}

/**
 * Map FMCSA form codes to a human-readable insurance type. The dataset stores
 * the type in mod_col_1 too but we normalize it here to keep the UI consistent.
 */
function describeInsuranceType(formCode: string, modCol1?: string): string {
  if (modCol1 && modCol1.trim()) return modCol1.trim();
  switch (formCode) {
    case '91':
    case '91X':
      return 'BIPD / Public Liability';
    case '34':
      return 'Cargo';
    case '82':
      return 'Broker Trust Fund';
    case '84':
    case '85':
      return 'Surety Bond';
    default:
      return `Form ${formCode}`;
  }
}

/**
 * Fetch FMCSA L&I active/pending insurance policies for a given DOT from the
 * Socrata dataset qh9u-swkp. Dataset provides insurer name, policy number,
 * coverage amounts, and effective / cancellation dates per filed policy.
 *
 * Schema confirmed by phase 2a/2a.2 probe. DOT must be zero-padded to 8
 * chars because the column is stored as text. Query by exact dot_number and
 * order by effective_date DESC so the most recent filings come first.
 *
 * Returns undefined on any error — this is an enrichment signal, not a
 * blocking lookup, so SAFER/QCMobile should remain the authoritative path.
 */
async function fetchLIInsurance(dot: string): Promise<{
  policies: LIInsurancePolicy[];
  summary: LIInsuranceSummary;
} | undefined> {
  try {
    const padded = padDotForSocrata(dot);
    const where = `dot_number='${padded}'`;
    const url =
      `${SOCRATA_BASE}/resource/${SOCRATA_DATASETS.actPendInsur}.json` +
      `?$where=${encodeURIComponent(where)}` +
      `&$order=${encodeURIComponent('effective_date DESC')}` +
      `&$limit=50`;

    const res = await fetch(url, { cache: 'no-store', headers: socrataHeaders() });
    if (!res.ok) {
      console.warn(`[fmcsa] Socrata L&I returned ${res.status} for DOT ${dot}`);
      return undefined;
    }
    const rows = (await res.json()) as Array<{
      docket_number?: string;
      dot_number?: string;
      ins_form_code?: string;
      mod_col_1?: string;
      name_company?: string;
      policy_no?: string;
      trans_date?: string;
      underl_lim_amount?: string;
      max_cov_amount?: string;
      effective_date?: string;
      cancl_effective_date?: string;
    }>;

    const policies: LIInsurancePolicy[] = rows.map(r => ({
      docketNumber: String(r.docket_number ?? ''),
      formCode: String(r.ins_form_code ?? ''),
      insuranceType: describeInsuranceType(String(r.ins_form_code ?? ''), r.mod_col_1),
      insurer: String(r.name_company ?? '').trim(),
      policyNumber: String(r.policy_no ?? ''),
      effectiveDate: r.effective_date?.trim() || undefined,
      cancellationDate: r.cancl_effective_date?.trim() || undefined,
      maxCoverage: r.max_cov_amount?.trim() || undefined,
      underlyingLimit: r.underl_lim_amount?.trim() || undefined,
    }));

    const primary =
      policies.find(p => p.formCode === '91X' || p.formCode === '91') ?? policies[0];
    const summary: LIInsuranceSummary = {
      primaryInsurer: primary?.insurer,
      primaryPolicyNumber: primary?.policyNumber,
      primaryEffectiveDate: primary?.effectiveDate,
      primaryMaxCoverage: primary?.maxCoverage,
      hasBIPD: policies.some(p => p.formCode === '91' || p.formCode === '91X'),
      hasCargo: policies.some(p => p.formCode === '34'),
      hasSurety: policies.some(p => p.formCode === '84' || p.formCode === '85' || p.formCode === '82'),
      policyCount: policies.length,
    };

    return { policies, summary };
  } catch (err) {
    console.warn(`[fmcsa] Socrata L&I fetch failed for DOT ${dot}:`, err);
    return undefined;
  }
}

/**
 * Debug-only: probe the FMCSA L&I Socrata datasets on data.transportation.gov.
 *
 * Per dataset, returns:
 *   - column metadata (so we can see real field names)
 *   - a sample row count + first matching row(s) for the given DOT, trying a
 *     few likely column-name variants since Socrata field names are dataset-
 *     specific (dot_number / dotnumber / dot_no / usdot_number).
 *
 * No API key required for basic access. Set SOCRATA_APP_TOKEN env var to
 * raise the per-IP rate limit. Aim of this probe is to learn the schema
 * once so the typed lookup in Phase 2b can use the right column names.
 */
export async function fetchSocrataDebug(dot: string, mcNumber?: string): Promise<{
  steps: Array<{
    label: string;
    url: string;
    status: number;
    ok: boolean;
    columns?: Array<{ fieldName: string; dataTypeName?: string; name?: string }>;
    sampleCount?: number;
    sample?: unknown;
    error?: string;
  }>;
}> {
  const steps: Array<{
    label: string;
    url: string;
    status: number;
    ok: boolean;
    columns?: Array<{ fieldName: string; dataTypeName?: string; name?: string }>;
    sampleCount?: number;
    sample?: unknown;
    error?: string;
  }> = [];

  const docketDigits = mcNumber?.replace(/^[A-Z]{2,3}-?/i, '').trim();

  async function fetchJson(url: string): Promise<{ status: number; body: unknown; ok: boolean; error?: string }> {
    try {
      const res = await fetch(url, { cache: 'no-store', headers: socrataHeaders() });
      const status = res.status;
      const ok = res.ok;
      const text = await res.text();
      try {
        return { status, ok, body: text ? JSON.parse(text) : null };
      } catch {
        return { status, ok, body: text.slice(0, 500), error: 'non-JSON response' };
      }
    } catch (err) {
      return { status: 0, ok: false, body: null, error: err instanceof Error ? err.message : String(err) };
    }
  }

  for (const [label, id] of Object.entries(SOCRATA_DATASETS)) {
    // 1. Column metadata for this dataset.
    const colsUrl = `${SOCRATA_BASE}/api/views/${id}/columns.json`;
    const cols = await fetchJson(colsUrl);
    type SocrataColumn = { fieldName?: string; name?: string; dataTypeName?: string };
    const columns: Array<{ fieldName: string; dataTypeName?: string; name?: string }> = Array.isArray(cols.body)
      ? (cols.body as SocrataColumn[]).map(c => ({
          fieldName: String(c.fieldName ?? ''),
          dataTypeName: c.dataTypeName,
          name: c.name,
        }))
      : [];
    steps.push({
      label: `${label}_columns`,
      url: colsUrl,
      status: cols.status,
      ok: cols.ok,
      columns,
      error: cols.error,
    });

    // 2. Unfiltered sample — first 3 rows, to see the real field-value format
    //    (e.g. whether dot_number has leading zeros or "USDOT" prefix).
    const sampleUrl = `${SOCRATA_BASE}/resource/${id}.json?$limit=3`;
    const sampleRes = await fetchJson(sampleUrl);
    steps.push({
      label: `${label}_unfiltered_sample`,
      url: sampleUrl,
      status: sampleRes.status,
      ok: sampleRes.ok,
      sampleCount: Array.isArray(sampleRes.body) ? sampleRes.body.length : undefined,
      sample: sampleRes.body,
      error: sampleRes.error,
    });

    // 3. Try sample queries against likely DOT-keyed column names.
    //    Pick the field whose name looks DOT-ish from the columns list, plus
    //    candidate fallbacks. Querying a non-existent field returns 400.
    const dotCandidates = Array.from(new Set([
      ...columns.map(c => c.fieldName).filter(f =>
        /^(dot|usdot)/i.test(f) || /dot_?(no|number|num)$/i.test(f)
      ),
      'dot_number',
      'dotnumber',
      'dot_no',
      'usdot_number',
    ])).filter(Boolean);

    for (const field of dotCandidates) {
      const qUrl = `${SOCRATA_BASE}/resource/${id}.json?${encodeURIComponent(field)}=${encodeURIComponent(dot)}&$limit=3`;
      const q = await fetchJson(qUrl);
      const sampleCount = Array.isArray(q.body) ? q.body.length : undefined;
      steps.push({
        label: `${label}_query_by_${field}`,
        url: qUrl,
        status: q.status,
        ok: q.ok,
        sampleCount,
        sample: q.body,
        error: q.error,
      });
      if (q.ok && Array.isArray(q.body) && q.body.length > 0) break;
    }

    // 4. If exact-match by the discovered DOT columns returned zero rows,
    //    try $where variants that tolerate leading zeros / substring match.
    const dotColumnsFromSchema = columns
      .map(c => c.fieldName)
      .filter(f => /^(dot|usdot)/i.test(f) || /dot_?(no|number|num)$/i.test(f));
    for (const field of dotColumnsFromSchema) {
      const whereExact = `${field}='${dot}'`;
      const whereLike = `${field} LIKE '%${dot}'`;
      for (const [variant, whereClause] of [
        ['where_exact', whereExact],
        ['where_like', whereLike],
      ] as const) {
        const url = `${SOCRATA_BASE}/resource/${id}.json?$where=${encodeURIComponent(whereClause)}&$limit=3`;
        const q = await fetchJson(url);
        const sampleCount = Array.isArray(q.body) ? q.body.length : undefined;
        steps.push({
          label: `${label}_${variant}_${field}`,
          url,
          status: q.status,
          ok: q.ok,
          sampleCount,
          sample: q.body,
          error: q.error,
        });
        if (q.ok && Array.isArray(q.body) && q.body.length > 0) break;
      }
    }

    // 3. Optional: try a docket-keyed query if we have one.
    if (docketDigits) {
      const docketCandidates = Array.from(new Set([
        ...columns.map(c => c.fieldName).filter(f => /^docket/i.test(f)),
        'docket_number',
        'docketnumber',
      ])).filter(Boolean);

      for (const field of docketCandidates) {
        const qUrl = `${SOCRATA_BASE}/resource/${id}.json?${encodeURIComponent(field)}=${encodeURIComponent(docketDigits)}&$limit=3`;
        const q = await fetchJson(qUrl);
        const sample = Array.isArray(q.body) ? q.body : q.body;
        const sampleCount = Array.isArray(q.body) ? q.body.length : undefined;
        steps.push({
          label: `${label}_query_by_${field}`,
          url: qUrl,
          status: q.status,
          ok: q.ok,
          sampleCount,
          sample,
          error: q.error,
        });
        if (q.ok && Array.isArray(q.body) && q.body.length > 0) break;
      }
    }
  }

  return { steps };
}

export async function lookupByDOT(dotNumber: string): Promise<FMCSALookupResult> {
  const cleaned = cleanDOT(dotNumber);
  if (!cleaned || cleaned === 'NaN') {
    return { success: false, error: 'Invalid DOT number format' };
  }

  try {
    const webKey = getWebKey();

    // All four fetches in parallel. L&I is enrichment — if it fails we still
    // return a valid carrier result.
    const [carrierRes, mcNumber, safer, liInsurance] = await Promise.all([
      fetch(`${FMCSA_BASE}/carriers/${cleaned}?webKey=${webKey}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      }),
      fetchMCNumber(cleaned, webKey),
      checkSAFER(cleaned),
      fetchLIInsurance(cleaned),
    ]);

    if (!carrierRes.ok) {
      if (carrierRes.status === 404) return { success: false, error: 'DOT number not found in FMCSA records' };
      return { success: false, error: `FMCSA API error: ${carrierRes.status}` };
    }

    const json = await carrierRes.json();
    const content = json?.content;
    if (!content) return { success: false, error: 'No carrier data returned for this DOT number' };

    const carrier = normalizeCarrier(content);
    // Prefer QCMobile MC (authoritative for carriers), fall back to SAFER
    // (which also covers FF/MX prefixes that QCMobile often omits).
    if (mcNumber) carrier.mcNumber = mcNumber;
    else if (safer.mcNumber) carrier.mcNumber = safer.mcNumber;
    if (safer.phone) carrier.phone = safer.phone;
    if (carrier.allowedToOperate && safer.inactive) carrier.saferDiscrepancy = true;
    if (liInsurance) {
      carrier.liInsurance = liInsurance.policies;
      carrier.liInsuranceSummary = liInsurance.summary;
    }

    return { success: true, carrier, raw: content };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'FMCSA_WEB_KEY_MISSING') {
      return { success: false, error: 'FMCSA API key not configured' };
    }
    return { success: false, error: 'Failed to reach FMCSA API' };
  }
}

export async function lookupByMC(mcNumber: string): Promise<FMCSALookupResult> {
  const cleaned = mcNumber.replace(/\D/g, '');
  if (!cleaned) return { success: false, error: 'Invalid MC number format' };

  try {
    const webKey = getWebKey();
    const res = await fetch(`${FMCSA_BASE}/carriers/docket-number/${cleaned}?webKey=${webKey}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      if (res.status === 404) return { success: false, error: 'MC number not found in FMCSA records' };
      return { success: false, error: `FMCSA API error: ${res.status}` };
    }

    const json = await res.json();
    const content = Array.isArray(json?.content) ? json.content[0] : json?.content;
    if (!content) return { success: false, error: 'No carrier data returned for this MC number' };

    const carrier = normalizeCarrier(content);
    if (!carrier.mcNumber) carrier.mcNumber = `MC-${cleaned}`;
    return { success: true, carrier, raw: content };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'FMCSA_WEB_KEY_MISSING') {
      return { success: false, error: 'FMCSA API key not configured' };
    }
    return { success: false, error: 'Failed to reach FMCSA API' };
  }
}

function normalizeCarrier(content: Record<string, unknown>): FMCSACarrier {
  const raw = unwrapCarrier(content);
  const isActive = String(raw.allowedToOperate ?? '').toUpperCase().trim() === 'Y';

  const carrierOpRaw = raw.carrierOperation;
  const carrierOperation = carrierOpRaw && typeof carrierOpRaw === 'object'
    ? String((carrierOpRaw as Record<string, unknown>).carrierOperationDesc ?? '')
    : carrierOpRaw ? String(carrierOpRaw) : undefined;

  return {
    dotNumber: String(raw.dotNumber ?? ''),
    legalName: String(raw.legalName ?? ''),
    dbaName: raw.dbaName ? String(raw.dbaName) : undefined,
    mcNumber: undefined,
    carrierOperation,
    isBrokerOnly: detectBrokerOnly(raw),
    hqState: raw.phyState ? String(raw.phyState) : undefined,
    hqAddress: raw.phyStreet ? String(raw.phyStreet) : undefined,
    hqCity: raw.phyCity ? String(raw.phyCity) : undefined,
    hqZip: raw.phyZipcode ? String(raw.phyZipcode) : undefined,
    phone: undefined,
    safetyRating: raw.safetyRating ? String(raw.safetyRating) : 'Not Rated',
    authorityStatus: isActive ? 'Active' : 'Inactive',
    insuranceRequired: raw.bipdInsuranceRequired ? String(raw.bipdInsuranceRequired) : undefined,
    insuranceOnFile: raw.bipdInsuranceOnFile ? String(raw.bipdInsuranceOnFile) : undefined,
    bicInsurance: raw.bondInsuranceOnFile ? String(raw.bondInsuranceOnFile) : undefined,
    cargoInsuranceRequired: raw.cargoInsuranceRequired ? String(raw.cargoInsuranceRequired) : undefined,
    cargoInsuranceOnFile: raw.cargoInsuranceOnFile ? String(raw.cargoInsuranceOnFile) : undefined,
    allowedToOperate: isActive,
    saferDiscrepancy: false,
  };
}
