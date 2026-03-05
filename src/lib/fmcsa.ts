/**
 * FMCSA QCMobile API Service
 * Confirmed field names from live API response (DOT 3576923):
 *
 *   phyStreet, phyCity, phyState, phyZipcode   <- ZIP is phyZipcode NOT phyZip
 *   telephone                                   <- NOT in carrier endpoint, comes from SAFER only
 *   mcNumber                                    <- NOT in carrier endpoint, must fetch /docket-numbers
 *   carrierOperation                            <- nested object { carrierOperationCode, carrierOperationDesc }
 *
 * SAFER vs QCMobile:
 *   QCMobile allowedToOperate is authoritative for operational status.
 *   SAFER can lag after reinstatements. When they disagree we set saferDiscrepancy=true.
 *
 * Response shape:
 *   GET /carriers/{dot}               -> { carrier: { ... } }
 *   GET /carriers/{dot}/docket-numbers -> { content: [ { docketNumber, prefix, docketNumberId } ] }
 */

const FMCSA_BASE = 'https://mobile.fmcsa.dot.gov/qc/services';

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
  const hasActiveCarrier = commonAuth === 'A' || contractAuth === 'A';
  const hasActiveBroker = brokerAuth === 'A';
  return hasActiveBroker && !hasActiveCarrier;
}

/**
 * Fetch MC number from the docket-numbers sub-resource.
 * Returns "MC-XXXXXXX" or undefined if not found.
 */
async function fetchMCNumber(dot: string, webKey: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${FMCSA_BASE}/carriers/${dot}/docket-numbers?webKey=${webKey}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return undefined;
    const json = await res.json();
    const list = Array.isArray(json?.content) ? json.content : [];
    // Find MC (prefix = 'MC') or FF number
    const mc = list.find((d: Record<string, unknown>) =>
      String(d.prefix ?? '').toUpperCase() === 'MC'
    );
    if (mc?.docketNumber) {
      return `MC-${mc.docketNumber}`;
    }
    // Fallback: return first docket number regardless of prefix
    if (list.length > 0 && list[0].docketNumber) {
      const prefix = list[0].prefix ? `${list[0].prefix}-` : 'MC-';
      return `${prefix}${list[0].docketNumber}`;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function checkSAFERInactive(dot: string): Promise<boolean> {
  try {
    const url = `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${dot}`;
    const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'text/html' } });
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

    // Fetch carrier + docket numbers in parallel
    const [carrierRes, mcNumber] = await Promise.all([
      fetch(`${FMCSA_BASE}/carriers/${cleaned}?webKey=${webKey}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      }),
      fetchMCNumber(cleaned, webKey),
    ]);

    if (!carrierRes.ok) {
      if (carrierRes.status === 404) return { success: false, error: 'DOT number not found in FMCSA records' };
      return { success: false, error: `FMCSA API error: ${carrierRes.status}` };
    }

    const json = await carrierRes.json();
    const content = json?.content;
    if (!content) return { success: false, error: 'No carrier data returned for this DOT number' };

    const carrier = normalizeCarrier(content);
    if (mcNumber) carrier.mcNumber = mcNumber;

    // Cross-check SAFER if QCMobile says active
    if (carrier.allowedToOperate) {
      const saferInactive = await checkSAFERInactive(cleaned);
      if (saferInactive) carrier.saferDiscrepancy = true;
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

  // carrierOperation is a nested object in the real API response
  const carrierOpRaw = raw.carrierOperation;
  const carrierOperation = carrierOpRaw && typeof carrierOpRaw === 'object'
    ? String((carrierOpRaw as Record<string, unknown>).carrierOperationDesc ?? '')
    : carrierOpRaw ? String(carrierOpRaw) : undefined;

  return {
    dotNumber: String(raw.dotNumber ?? ''),
    legalName: String(raw.legalName ?? ''),
    dbaName: raw.dbaName ? String(raw.dbaName) : undefined,
    mcNumber: undefined, // populated after fetchMCNumber()
    carrierOperation,
    isBrokerOnly: detectBrokerOnly(raw),
    hqState: raw.phyState ? String(raw.phyState) : undefined,
    hqAddress: raw.phyStreet ? String(raw.phyStreet) : undefined,
    hqCity: raw.phyCity ? String(raw.phyCity) : undefined,
    hqZip: raw.phyZipcode ? String(raw.phyZipcode) : undefined,  // confirmed: phyZipcode
    phone: undefined,                                              // not in carrier endpoint
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
