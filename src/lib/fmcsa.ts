/**
 * FMCSA QCMobile API Service
 * Docs: https://mobile.fmcsa.dot.gov/QCDevsite/docs/getStarted
 *
 * Covers:
 *  - Carrier lookup by DOT number (name, authority status, safety rating)
 *  - Licensing & Insurance snapshot (active insurance carrier + policy)
 *
 * Response shape from FMCSA QCMobile API:
 *   GET /carriers/{dot}         → { content: { carrier: { ... } } }
 *   GET /carriers/docket/{mc}   → { content: [ { carrier: { ... } } ] }
 *
 * The actual carrier fields live inside the nested `carrier` object.
 * normalizeCarrier() always unwraps this before reading any fields.
 */

const FMCSA_BASE_URL = 'https://mobile.fmcsa.dot.gov/qc/services';

export interface FMCSACarrier {
  dotNumber: string;
  legalName: string;
  dbaName?: string;
  carrierOperation?: string;
  isBrokerOnly?: boolean;       // true if entity has broker authority but no carrier authority
  hqState?: string;
  hqAddress?: string;
  hqCity?: string;
  hqZip?: string;
  phone?: string;
  safetyRating?: string;        // 'Satisfactory' | 'Conditional' | 'Unsatisfactory' | 'Not Rated'
  authorityStatus?: string;     // 'Active' | 'Inactive'
  insuranceRequired?: string;
  insuranceOnFile?: string;
  bicInsurance?: string;
  cargoInsuranceRequired?: string;
  cargoInsuranceOnFile?: string;
  allowedToOperate?: boolean;
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

/**
 * Strip non-digits and leading zeros — FMCSA API treats DOT as a numeric ID.
 * e.g. "00118651" → "118651", "1886510" → "1886510"
 */
function cleanDOT(dotNumber: string): string {
  const digitsOnly = dotNumber.replace(/\D/g, '');
  return String(parseInt(digitsOnly, 10)); // removes leading zeros
}

/**
 * Unwrap the nested carrier object from the FMCSA API response.
 *
 * The QCMobile API wraps carrier data in a `carrier` key:
 *   content = { carrier: { allowedToOperate: "Y", legalName: "...", ... } }
 *
 * If the `carrier` key is present, return its value. Otherwise assume
 * the content IS the carrier object (defensive fallback).
 */
function unwrapCarrier(content: Record<string, unknown>): Record<string, unknown> {
  if (content.carrier && typeof content.carrier === 'object' && content.carrier !== null) {
    return content.carrier as Record<string, unknown>;
  }
  return content;
}

/**
 * Detect whether this entity is a broker-only (no active carrier authority).
 * Stored as metadata on the carrier but no longer used to reject the lookup.
 */
function detectBrokerOnly(raw: Record<string, unknown>): boolean {
  const brokerAuth = String(raw.brokerAuthorityStatus ?? raw.brokerAuthority ?? '').toUpperCase().trim();
  const commonAuth = String(raw.commonAuthorityStatus ?? raw.commonAuthority ?? '').toUpperCase().trim();
  const contractAuth = String(raw.contractAuthorityStatus ?? raw.contractAuthority ?? '').toUpperCase().trim();
  const carrierOp = String(raw.carrierOperation ?? '').toUpperCase().trim();

  const hasActiveCarrierAuthority = commonAuth === 'A' || contractAuth === 'A';
  const hasActiveBrokerAuthority = brokerAuth === 'A';
  const neitherCarrierNorBoth = !['A', 'B', 'C'].includes(carrierOp) || carrierOp === 'BROKER';

  return hasActiveBrokerAuthority && !hasActiveCarrierAuthority && neitherCarrierNorBoth;
}

/**
 * Look up a carrier by US DOT number.
 * Returns normalized carrier data or an error.
 */
export async function lookupByDOT(dotNumber: string): Promise<FMCSALookupResult> {
  const cleaned = cleanDOT(dotNumber);
  if (!cleaned || cleaned === 'NaN' || cleaned.length < 1) {
    return { success: false, error: 'Invalid DOT number format' };
  }

  try {
    const webKey = getWebKey();
    const url = `${FMCSA_BASE_URL}/carriers/${cleaned}?webKey=${webKey}`;

    console.log(`[FMCSA] lookupByDOT — requesting DOT ${cleaned}`);

    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'Accept': 'application/json' },
    });

    console.log(`[FMCSA] lookupByDOT — HTTP ${res.status} for DOT ${cleaned}`);

    if (!res.ok) {
      if (res.status === 404) return { success: false, error: 'DOT number not found in FMCSA records' };
      return { success: false, error: `FMCSA API error: ${res.status}` };
    }

    const json = await res.json();
    const content = json?.content;

    console.log(`[FMCSA] lookupByDOT — raw content for DOT ${cleaned}:`, JSON.stringify(content, null, 2));

    if (!content) {
      return { success: false, error: 'No carrier data returned for this DOT number' };
    }

    const carrier = normalizeCarrier(content);
    return { success: true, carrier, raw: content };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[FMCSA] lookupByDOT error:', message);
    if (message === 'FMCSA_WEB_KEY_MISSING') {
      return { success: false, error: 'FMCSA API key not configured — add FMCSA_WEB_KEY to environment variables' };
    }
    return { success: false, error: 'Failed to reach FMCSA API' };
  }
}

/**
 * Look up a carrier by MC number.
 */
export async function lookupByMC(mcNumber: string): Promise<FMCSALookupResult> {
  const cleaned = mcNumber.replace(/\D/g, '');
  if (!cleaned) return { success: false, error: 'Invalid MC number format' };

  try {
    const webKey = getWebKey();
    const url = `${FMCSA_BASE_URL}/carriers/docket-number/${cleaned}?webKey=${webKey}`;

    console.log(`[FMCSA] lookupByMC — requesting MC ${cleaned}`);

    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'Accept': 'application/json' },
    });

    console.log(`[FMCSA] lookupByMC — HTTP ${res.status} for MC ${cleaned}`);

    if (!res.ok) {
      if (res.status === 404) return { success: false, error: 'MC number not found in FMCSA records' };
      return { success: false, error: `FMCSA API error: ${res.status}` };
    }

    const json = await res.json();
    const content = Array.isArray(json?.content) ? json.content[0] : json?.content;

    console.log(`[FMCSA] lookupByMC — raw content for MC ${cleaned}:`, JSON.stringify(content, null, 2));

    if (!content) {
      return { success: false, error: 'No carrier data returned for this MC number' };
    }

    const carrier = normalizeCarrier(content);
    return { success: true, carrier, raw: content };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[FMCSA] lookupByMC error:', message);
    if (message === 'FMCSA_WEB_KEY_MISSING') {
      return { success: false, error: 'FMCSA API key not configured — add FMCSA_WEB_KEY to environment variables' };
    }
    return { success: false, error: 'Failed to reach FMCSA API' };
  }
}

function normalizeCarrier(content: Record<string, unknown>): FMCSACarrier {
  // The QCMobile API wraps the actual fields inside a `carrier` key.
  // Unwrap it before reading any fields — this is the root cause of
  // allowedToOperate always being undefined (and thus always "Inactive").
  const raw = unwrapCarrier(content);

  const allowedToOperateRaw = String(raw.allowedToOperate ?? '').toUpperCase().trim();

  // allowedToOperate is the authoritative field — "Y" means the entity is
  // currently permitted to operate regardless of what authorityStatus shows.
  const isActive = allowedToOperateRaw === 'Y';

  return {
    dotNumber: String(raw.dotNumber ?? ''),
    legalName: String(raw.legalName ?? ''),
    dbaName: raw.dbaName ? String(raw.dbaName) : undefined,
    carrierOperation: raw.carrierOperation ? String(raw.carrierOperation) : undefined,
    isBrokerOnly: detectBrokerOnly(raw),
    hqState: raw.phyState ? String(raw.phyState) : undefined,
    hqAddress: raw.phyStreet ? String(raw.phyStreet) : undefined,
    hqCity: raw.phyCity ? String(raw.phyCity) : undefined,
    hqZip: raw.phyZip ? String(raw.phyZip) : undefined,
    phone: raw.telephone ? String(raw.telephone) : undefined,
    safetyRating: raw.safetyRating ? String(raw.safetyRating) : 'Not Rated',
    authorityStatus: isActive ? 'Active' : 'Inactive',
    insuranceRequired: raw.bipdInsuranceRequired ? String(raw.bipdInsuranceRequired) : undefined,
    insuranceOnFile: raw.bipdInsuranceOnFile ? String(raw.bipdInsuranceOnFile) : undefined,
    bicInsurance: raw.bondInsuranceOnFile ? String(raw.bondInsuranceOnFile) : undefined,
    cargoInsuranceRequired: raw.cargoInsuranceRequired ? String(raw.cargoInsuranceRequired) : undefined,
    cargoInsuranceOnFile: raw.cargoInsuranceOnFile ? String(raw.cargoInsuranceOnFile) : undefined,
    allowedToOperate: isActive,
  };
}
