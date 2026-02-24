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
  isBrokerOnly?: boolean;       // true if this entity has broker authority but no carrier authority
  hqState?: string;
  hqAddress?: string;
  hqCity?: string;
  hqZip?: string;
  phone?: string;
  safetyRating?: string;        // 'Satisfactory' | 'Conditional' | 'Unsatisfactory' | 'Not Rated'
  authorityStatus?: string;     // 'Active' | 'Inactive' | 'Revoked'
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
  isBroker?: boolean;           // true when rejected because entity is broker-only
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
 * Determine if this FMCSA record is a broker-only entity.
 *
 * FMCSA returns carrierOperation values like:
 *   "A" = Interstate Carrier
 *   "B" = Intrastate Carrier (HM)
 *   "C" = Intrastate Carrier (Non-HM)
 *   "BROKER" or "B" (in some contexts)
 *
 * A record is broker-only when:
 *   - carrierOperation is absent or "BROKER"
 *   - AND the entity has no active carrier authority (commonAuthority/contractAuthority)
 *   - AND brokerAuthority is "A" (active)
 *
 * This is a best-effort check based on the available fields.
 */
function detectBrokerOnly(raw: Record<string, unknown>): boolean {
  const brokerAuth = String(raw.brokerAuthorityStatus ?? raw.brokerAuthority ?? '').toUpperCase().trim();
  const commonAuth = String(raw.commonAuthorityStatus ?? raw.commonAuthority ?? '').toUpperCase().trim();
  const contractAuth = String(raw.contractAuthorityStatus ?? raw.contractAuthority ?? '').toUpperCase().trim();
  const carrierOp = String(raw.carrierOperation ?? '').toUpperCase().trim();

  // If the entity has active carrier authority, it's a carrier (possibly dual carrier+broker like Werner)
  const hasActiveCarrierAuthority = commonAuth === 'A' || contractAuth === 'A';

  // If broker authority is active and no active carrier authority → broker only
  const hasActiveBrokerAuthority = brokerAuth === 'A';

  // Also catch entities with no carrier operation type set but have broker designation
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

    // no-store: each DOT number must hit FMCSA directly — never serve a cached
    // response for a different carrier number
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

    // Debug: log the raw FMCSA response so we can inspect unknown field structures
    console.log(`[FMCSA] lookupByDOT — raw content for DOT ${cleaned}:`, JSON.stringify(content, null, 2));

    if (!content) {
      return { success: false, error: 'No carrier data returned for this DOT number' };
    }

    // Broker-only check — XtraFleet only serves motor carriers
    if (detectBrokerOnly(content)) {
      console.log(`[FMCSA] lookupByDOT — DOT ${cleaned} is a broker-only entity, rejecting`);
      return {
        success: false,
        isBroker: true,
        error: 'This DOT number belongs to a freight broker, not a motor carrier. XtraFleet is for owner-operators and motor carriers only.',
      };
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

    if (detectBrokerOnly(content)) {
      console.log(`[FMCSA] lookupByMC — MC ${cleaned} is a broker-only entity, rejecting`);
      return {
        success: false,
        isBroker: true,
        error: 'This MC number belongs to a freight broker, not a motor carrier. XtraFleet is for owner-operators and motor carriers only.',
      };
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

  // allowedToOperate is the authoritative field — "Y" means the carrier is
  // currently permitted to operate regardless of what authorityStatus shows.
  // authorityStatus can be misleading for dual carrier+broker entities (e.g.
  // Werner Enterprises) where it may reflect broker status rather than carrier.
  const isActive = allowedToOperateRaw === 'Y';

  const authorityLabel = isActive ? 'Active' : 'Inactive';

  return {
    dotNumber: String(raw.dotNumber ?? ''),
    legalName: String(raw.legalName ?? ''),
    dbaName: raw.dbaName ? String(raw.dbaName) : undefined,
    carrierOperation: raw.carrierOperation ? String(raw.carrierOperation) : undefined,
    isBrokerOnly: false, // never true here — brokers are rejected before normalizing
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
