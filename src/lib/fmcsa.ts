/**
 * FMCSA QCMobile API Service
 * Docs: https://mobile.fmcsa.dot.gov/QCDevsite/docs/getStarted
 * Official field reference: https://mobile.fmcsa.dot.gov/QCDevsite/docs/apiElements
 *
 * Field name paranoia: the official docs, the Go client library, and the actual
 * API response have been observed to use different casings/names. We try all
 * known variants for each field so a rename in the upstream API doesn't silently
 * break population.
 *
 * SAFER vs QCMobile:
 *   These are two separate FMCSA databases. QCMobile (allowedToOperate) is more
 *   current. SAFER can lag after reinstatements. When they disagree we set
 *   saferDiscrepancy=true so the UI can warn the user.
 *
 * Response shape:
 *   GET /carriers/{dot}       -> { content: { carrier: { ... } } }
 *   GET /carriers/docket/{mc} -> { content: [ { carrier: { ... } } ] }
 */

const FMCSA_BASE_URL = 'https://mobile.fmcsa.dot.gov/qc/services';

export interface FMCSACarrier {
  dotNumber: string;
  legalName: string;
  dbaName?: string;
  mcNumber?: string;
  carrierOperation?: string;
  isBrokerOnly?: boolean;
  hqState?: string;
  hqAddress?: string;   // phyStreet
  hqCity?: string;      // phyCity
  hqZip?: string;       // phyZip / phyZipcode
  phone?: string;       // telephone / phone
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
  const digitsOnly = dotNumber.replace(/\D/g, '');
  return String(parseInt(digitsOnly, 10));
}

function unwrapCarrier(content: Record<string, unknown>): Record<string, unknown> {
  if (content.carrier && typeof content.carrier === 'object' && content.carrier !== null) {
    return content.carrier as Record<string, unknown>;
  }
  return content;
}

/**
 * Try multiple field name variants and return the first one that has a value.
 * This guards against discrepancies between the FMCSA API docs, the Go client
 * library, and the actual live response payload.
 */
function pick(raw: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = raw[key];
    if (val !== undefined && val !== null && String(val).trim() !== '' && String(val).trim() !== '0') {
      return String(val).trim();
    }
  }
  return undefined;
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

/**
 * Check SAFER to see if the carrier is listed as inactive there.
 * Returns true if SAFER says INACTIVE, false otherwise (fail open on error).
 */
async function checkSAFERInactive(dotNumber: string): Promise<boolean> {
  try {
    const url = `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${dotNumber}`;
    const res = await fetch(url, { cache: 'no-store', headers: { 'Accept': 'text/html' } });
    if (!res.ok) return false;
    const html = await res.text();
    return html.toUpperCase().includes('IS INACTIVE IN THE SAFER DATABASE');
  } catch {
    return false;
  }
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
    // Log ALL keys so we can see exactly what FMCSA returns
    const raw = unwrapCarrier(content ?? {});
    console.log(`[FMCSA] DOT ${cleaned} raw keys:`, Object.keys(raw));
    console.log(`[FMCSA] DOT ${cleaned} raw values:`, JSON.stringify(raw, null, 2));

    if (!content) return { success: false, error: 'No carrier data returned for this DOT number' };

    const carrier = normalizeCarrier(content);

    // Cross-check SAFER if QCMobile says active
    if (carrier.allowedToOperate) {
      const saferInactive = await checkSAFERInactive(cleaned);
      if (saferInactive) {
        carrier.saferDiscrepancy = true;
        console.log(`[FMCSA] DOT ${cleaned}: QCMobile=active but SAFER=inactive — flagging discrepancy`);
      }
    }

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

  // MC number — try all known field name variants
  const rawMc = pick(raw, 'mcNumber', 'mcNum', 'mcmisNumber', 'docketNumber') ?? '';
  const mcNumber = rawMc ? (rawMc.startsWith('MC-') ? rawMc : `MC-${rawMc}`) : undefined;

  // ZIP — official docs say phyZip, Go library uses phyZipcode, try both
  const hqZip = pick(raw, 'phyZip', 'phyZipcode', 'physicalZip', 'zipCode', 'zip');

  // Phone — official docs say telephone, try variants
  const phone = pick(raw, 'telephone', 'phone', 'phoneNumber', 'telNumber');

  return {
    dotNumber: String(raw.dotNumber ?? ''),
    legalName: String(raw.legalName ?? ''),
    dbaName: pick(raw, 'dbaName', 'dba'),
    mcNumber,
    carrierOperation: pick(raw, 'carrierOperation', 'carrierOperationCode'),
    isBrokerOnly: detectBrokerOnly(raw),
    hqState: pick(raw, 'phyState', 'physicalState', 'state'),
    hqAddress: pick(raw, 'phyStreet', 'physicalStreet', 'street'),
    hqCity: pick(raw, 'phyCity', 'physicalCity', 'city'),
    hqZip,
    phone,
    safetyRating: pick(raw, 'safetyRating', 'safetyRatingDesc') ?? 'Not Rated',
    authorityStatus: isActive ? 'Active' : 'Inactive',
    insuranceRequired: pick(raw, 'bipdInsuranceRequired'),
    insuranceOnFile: pick(raw, 'bipdInsuranceOnFile'),
    bicInsurance: pick(raw, 'bondInsuranceOnFile'),
    cargoInsuranceRequired: pick(raw, 'cargoInsuranceRequired'),
    cargoInsuranceOnFile: pick(raw, 'cargoInsuranceOnFile'),
    allowedToOperate: isActive,
    saferDiscrepancy: false,
  };
}
