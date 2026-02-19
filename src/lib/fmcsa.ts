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
  safetyRating?: string;        // 'Satisfactory' | 'Conditional' | 'Unsatisfactory' | 'Not Rated'
  authorityStatus?: string;     // 'A' = Active, 'I' = Inactive, 'R' = Revoked
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
  if (!key) throw new Error('FMCSA_WEB_KEY environment variable is not set');
  return key;
}

/**
 * Look up a carrier by US DOT number.
 * Returns normalized carrier data or an error.
 */
export async function lookupByDOT(dotNumber: string): Promise<FMCSALookupResult> {
  const cleaned = dotNumber.replace(/\D/g, '');
  if (!cleaned || cleaned.length < 5 || cleaned.length > 8) {
    return { success: false, error: 'Invalid DOT number format' };
  }

  try {
    const webKey = getWebKey();
    const url = `${FMCSA_BASE_URL}/carriers/${cleaned}?webKey=${webKey}`;

    const res = await fetch(url, {
      next: { revalidate: 3600 }, // Cache for 1 hour — FMCSA updates nightly
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
      next: { revalidate: 3600 },
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      if (res.status === 404) return { success: false, error: 'MC number not found in FMCSA records' };
      return { success: false, error: `FMCSA API error: ${res.status}` };
    }

    const json = await res.json();
    // MC lookup returns an array; take the first match
    const content = Array.isArray(json?.content) ? json.content[0] : json?.content;

    if (!content) {
      return { success: false, error: 'No carrier data returned for this MC number' };
    }

    const carrier = normalizeCarrier(content);
    return { success: true, carrier, raw: content };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[FMCSA] lookupByMC error:', message);
    return { success: false, error: 'Failed to reach FMCSA API' };
  }
}

function normalizeCarrier(raw: Record<string, unknown>): FMCSACarrier {
  const authorityStatus = String(raw.allowedToOperate ?? raw.authorityStatus ?? '');

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
    authorityStatus: authorityStatus || undefined,
    insuranceRequired: raw.insuranceRequired ? String(raw.insuranceRequired) : undefined,
    insuranceOnFile: raw.insuranceOnFile ? String(raw.insuranceOnFile) : undefined,
    bicInsurance: raw.bicInsurance ? String(raw.bicInsurance) : undefined,
    cargoInsuranceRequired: raw.cargoInsuranceRequired ? String(raw.cargoInsuranceRequired) : undefined,
    cargoInsuranceOnFile: raw.cargoInsuranceOnFile ? String(raw.cargoInsuranceOnFile) : undefined,
    allowedToOperate: authorityStatus === 'A' || String(raw.allowedToOperate).toUpperCase() === 'Y',
  };
}
