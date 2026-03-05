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
}

/**
 * Scrape SAFER HTML for inactive status and phone number.
 * SAFER is the only source that exposes phone (from MCS-150 filings).
 *
 * The SAFER snapshot page renders a table row like:
 *   <th scope="row">Phone:</th><td>(304) 785-0420</td>
 */
async function checkSAFER(dot: string): Promise<SAFERResult> {
  try {
    const res = await fetch(`${SAFER_QUERY}${dot}`, {
      cache: 'no-store',
      headers: { Accept: 'text/html' },
    });
    if (!res.ok) return { inactive: false };
    const html = await res.text();

    const inactive = html.toUpperCase().includes('IS INACTIVE IN THE SAFER DATABASE');

    // Extract phone: look for the text "Phone:" followed by a table cell
    // SAFER HTML: Phone:</th>\s*<td...>(XXX) XXX-XXXX</td>
    let phone: string | undefined;
    const phoneMatch = html.match(/Phone:\s*<\/th>\s*<td[^>]*>\s*([\d\s().+-]{7,20})\s*<\/td>/i);
    if (phoneMatch) {
      phone = phoneMatch[1].trim();
    }

    return { inactive, phone };
  } catch {
    return { inactive: false };
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
    if (mcNumber) carrier.mcNumber = mcNumber;
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
