/**
 * FMCSA QCMobile API Service
 * Docs: https://mobile.fmcsa.dot.gov/QCDevsite/docs/getStarted
 *
 * Verified field names from official Carrier struct:
 *   phyStreet, phyCity, phyState, phyZipcode (NOT phyZip)
 *   NOTE: phone/telephone is NOT returned by the carrier endpoint.
 *
 * Response shape:
 *   GET /carriers/{dot}       → { content: { carrier: { ... } } }
 *   GET /carriers/docket/{mc} → { content: [ { carrier: { ... } } ] }
 */

const FMCSA_BASE_URL = 'https://mobile.fmcsa.dot.gov/qc/services';

export interface FMCSACarrier {
  dotNumber: string;
  legalName: string;
  dbaName?: string;
  carrierOperation?: string;
  isBrokerOnly?: boolean;
  hqState?: string;
  hqAddress?: string;   // phyStreet
  hqCity?: string;      // phyCity
  hqZip?: string;       // phyZipcode
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

function cleanDOT(dotNumber: string): string {
  const digitsOnly = dotNumber.replace(/\D/g, '');
  return String(parseInt(digitsOnly, 10));
}

/**
 * Unwrap the nested carrier object from the FMCSA API response.
 * content = { carrier: { allowedToOperate: "Y", ... } }
 */
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
  const carrierOp = String(raw.carrierOperation ?? '').toUpperCase().trim();

  const hasActiveCarrierAuthority = commonAuth === 'A' || contractAuth === 'A';
  const hasActiveBrokerAuthority = brokerAuth === 'A';
  const neitherCarrierNorBoth = !['A', 'B', 'C'].includes(carrierOp) || carrierOp === 'BROKER';

  return hasActiveBrokerAuthority && !hasActiveCarrierAuthority && neitherCarrierNorBoth;
}

export async function lookupByDOT(dotNumber: string): Promise<FMCSALookupResult> {
  const cleaned = cleanDOT(dotNumber);
  if (!cleaned || cleaned === 'NaN') {
    return { success: false, error: 'Invalid DOT number format' };
  }

  try {
    const webKey = getWebKey();
    const url = `${FMCSA_BASE_URL}/carriers/${cleaned}?webKey=${webKey}`;
    console.log(`[FMCSA] lookupByDOT — requesting DOT ${cleaned}`);

    const res = await fetch(url, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
    console.log(`[FMCSA] lookupByDOT — HTTP ${res.status} for DOT ${cleaned}`);

    if (!res.ok) {
      if (res.status === 404) return { success: false, error: 'DOT number not found in FMCSA records' };
      return { success: false, error: `FMCSA API error: ${res.status}` };
    }

    const json = await res.json();
    const content = json?.content;
    console.log(`[FMCSA] lookupByDOT — raw content for DOT ${cleaned}:`, JSON.stringify(content, null, 2));

    if (!content) return { success: false, error: 'No carrier data returned for this DOT number' };

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

export async function lookupByMC(mcNumber: string): Promise<FMCSALookupResult> {
  const cleaned = mcNumber.replace(/\D/g, '');
  if (!cleaned) return { success: false, error: 'Invalid MC number format' };

  try {
    const webKey = getWebKey();
    const url = `${FMCSA_BASE_URL}/carriers/docket-number/${cleaned}?webKey=${webKey}`;
    console.log(`[FMCSA] lookupByMC — requesting MC ${cleaned}`);

    const res = await fetch(url, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
    console.log(`[FMCSA] lookupByMC — HTTP ${res.status} for MC ${cleaned}`);

    if (!res.ok) {
      if (res.status === 404) return { success: false, error: 'MC number not found in FMCSA records' };
      return { success: false, error: `FMCSA API error: ${res.status}` };
    }

    const json = await res.json();
    const content = Array.isArray(json?.content) ? json.content[0] : json?.content;
    console.log(`[FMCSA] lookupByMC — raw content for MC ${cleaned}:`, JSON.stringify(content, null, 2));

    if (!content) return { success: false, error: 'No carrier data returned for this MC number' };

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
  const raw = unwrapCarrier(content);
  const allowedToOperateRaw = String(raw.allowedToOperate ?? '').toUpperCase().trim();
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
    hqZip: raw.phyZipcode ? String(raw.phyZipcode) : undefined,   // correct field name
    // phone is NOT available in the FMCSA QCMobile carrier endpoint
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
