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
 * L&I uses a two-step HTML lookup:
 *   1. Carrier list by USDOT returns links containing an internal pv_apcant_id.
 *   2. Detail pages (active insurance, authority history) are keyed by that id.
 *
 * We try the two-step path first (list → detail). We also attempt a direct
 * USDOT-keyed insurance URL that some FMCSA clients use undocumented as a
 * fallback. Both are returned so we can see what L&I actually serves and
 * write a parser against real HTML in a follow-up PR.
 */
export async function fetchLIDebug(dot: string): Promise<{
  steps: Array<{
    label: string;
    url: string;
    status: number;
    ok: boolean;
    htmlLength: number;
    textLength: number;
    textSnippet: string; // up to 5KB of stripped text
    extracted?: { apcantId?: string };
  }>;
  apcantId?: string;
  error?: string;
}> {
  const steps: Array<{
    label: string;
    url: string;
    status: number;
    ok: boolean;
    htmlLength: number;
    textLength: number;
    textSnippet: string;
    extracted?: { apcantId?: string };
  }> = [];

  async function probe(label: string, url: string): Promise<string> {
    try {
      const res = await fetch(url, { cache: 'no-store', headers: FMCSA_SCRAPE_HEADERS });
      const html = res.ok ? await res.text() : '';
      const text = stripSAFERHtml(html);
      steps.push({
        label,
        url,
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
        status: 0,
        ok: false,
        htmlLength: 0,
        textLength: 0,
        textSnippet: err instanceof Error ? err.message : String(err),
      });
      return '';
    }
  }

  try {
    // Step 1: carrier list by USDOT — response contains links with pv_apcant_id.
    const listHtml = await probe(
      'carrlist_by_dot',
      `${LI_BASE}/pkg_carrquery.prc_carrlist?n_dotno=${encodeURIComponent(dot)}`,
    );

    const idMatch = listHtml.match(/pv_apcant_id=(\d+)/i);
    const apcantId = idMatch?.[1];
    if (steps[0]) steps[0].extracted = { apcantId };

    // Step 2a: direct USDOT-keyed insurance (undocumented, may or may not work).
    await probe(
      'insurance_by_dot',
      `${LI_BASE}/pkg_carrquery.prc_insurance?pn_usdot_number=${encodeURIComponent(dot)}`,
    );

    // Step 2b: active insurance by apcant_id (canonical path, needs step 1).
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

    return { steps, apcantId };
  } catch (err) {
    return { steps, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function lookupByDOT(dotNumber: string): Promise<FMCSALookupResult> {
  const cleaned = cleanDOT(dotNumber);
  if (!cleaned || cleaned === 'NaN') {
    return { success: false, error: 'Invalid DOT number format' };
  }

  try {
    const webKey = getWebKey();

    // All three fetches in parallel
    const [carrierRes, mcNumber, safer] = await Promise.all([
      fetch(`${FMCSA_BASE}/carriers/${cleaned}?webKey=${webKey}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      }),
      fetchMCNumber(cleaned, webKey),
      checkSAFER(cleaned),
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
