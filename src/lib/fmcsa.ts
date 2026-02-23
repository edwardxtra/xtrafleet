/**
 * FMCSA QCMobile API Service
 * Docs: https://mobile.fmcsa.dot.gov/QCDevsite/docs/getStarted
 *
 * Covers:
 *  - Carrier lookup by DOT number (name, authority status, safety rating)
 *  - Licensing & Insurance snapshot (active insurance carrier + policy)
 */

const FMCSA_BASE_URL = 'https://mobile.fmcsa.dot.gov/qc/services';

export interface FMCSACarrier {
  dotNumber: string;
  legalName: string;
  dbaName?: string;
  carrierOperation?: string;
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

    // no-store: each DOT number must hit FMCSA directly — never serve a cached
    // response for a different carrier number
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      if (res.status === 404) return { success: false, error: 'DOT number not found in FMCSA records' };
      return { success: false, error: `FMCSA API error: ${res.status}` };
    }

    const json = await res.json();
    const content = json?.content;

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

    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      if (res.status === 404) return { success: false, error: 'MC number not found in FMCSA records' };
      return { success: false, error: `FMCSA API error: ${res.status}` };
    }

    const json = await res.json();
    const content = Array.isArray(json?.content) ? json.content[0] : json?.content;

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

function normalizeCarrier(raw: Record<string, unknown>): FMCSACarrier {
  const allowedToOperateRaw = String(raw.allowedToOperate ?? '').toUpperCase().trim();
  const authorityStatusRaw = String(raw.authorityStatus ?? '').toUpperCase().trim();

  const isActive = allowedToOperateRaw === 'Y' || authorityStatusRaw === 'A';

  const authorityLabel =
    authorityStatusRaw === 'A' ? 'Active' :
    authorityStatusRaw === 'I' ? 'Inactive' :
    authorityStatusRaw === 'R' ? 'Revoked' :
    allowedToOperateRaw === 'Y' ? 'Active' :
    allowedToOperateRaw === 'N' ? 'Inactive' :
    undefined;

  return {
    dotNumber: String(raw.dotNumber ?? ''),
    legalName: String(raw.legalName ?? ''),
    dbaName: raw.dbaName ? String(raw.dbaName) : undefined,
    carrierOperation: raw.carrierOperation ? String(raw.carrierOperation) : undefined,
    hqState: raw.phyState ? String(raw.phyState) : undefined,
    hqAddress: raw.phyStreet ? String(raw.phyStreet) : undefined,
    hqCity: raw.phyCity ? String(raw.phyCity) : undefined,
    hqZip: raw.phyZip ? String(raw.phyZip) : undefined,
    phone: raw.telephone ? String(raw.telephone) : undefined,
    safetyRating: raw.safetyRating ? String(raw.safetyRating) : 'Not Rated',
    authorityStatus: authorityLabel,
    insuranceRequired: raw.insuranceRequired ? String(raw.insuranceRequired) : undefined,
    insuranceOnFile: raw.insuranceOnFile ? String(raw.insuranceOnFile) : undefined,
    bicInsurance: raw.bicInsurance ? String(raw.bicInsurance) : undefined,
    cargoInsuranceRequired: raw.cargoInsuranceRequired ? String(raw.cargoInsuranceRequired) : undefined,
    cargoInsuranceOnFile: raw.cargoInsuranceOnFile ? String(raw.cargoInsuranceOnFile) : undefined,
    allowedToOperate: isActive,
  };
}
