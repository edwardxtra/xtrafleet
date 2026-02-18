import type { Driver, Load } from "@/lib/data";
import { differenceInDays, parseISO } from "date-fns";
import type { TrailerType } from "./trailer-types";

const LOG_PREFIX = "[matching]";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatchScoreBreakdown {
  vehicleMatch: number;        // 0-20 pts
  qualificationScore: number;  // 0-40 pts  (blended qual+compliance, DEV-123)
  locationScore: number;       // 0-35 pts
  ratingScore: number;         // 0-5  pts
  // Kept for backwards-compat display — derived from qualificationScore
  qualificationMatch: number;
  complianceScore: number;
  // Human-readable explanation when score is reduced by expiry decay
  qualificationWarning?: string;
  // Individual expiry details for the Learn More panel
  expiryDetails?: ExpiryDetail[];
}

export interface ExpiryDetail {
  label: string;
  expiryDate: string;  // ISO date string
  daysUntil: number;
  status: "green" | "yellow" | "expired";
}

export interface MatchScore {
  driver: Driver;
  score: number;
  breakdown: MatchScoreBreakdown;
  rank: number;
  isBestMatch: boolean;
}

export interface LoadMatchScore {
  load: Load;
  score: number;
  breakdown: MatchScoreBreakdown;
  rank: number;
  isBestMatch: boolean;
}

export interface MatchingOptions {
  onlyGreenCompliance?: boolean;
  onlyAvailable?: boolean;
  maxResults?: number;
}

const DEFAULT_OPTIONS: MatchingOptions = {
  onlyGreenCompliance: true,
  onlyAvailable: true,
  maxResults: 10,
};

// ---------------------------------------------------------------------------
// Scoring weights (DEV-123)
// Total: 100 pts
// ---------------------------------------------------------------------------
const WEIGHTS = {
  location: 35,
  vehicle: 20,
  qualification: 40,  // blended qual+compliance
  rating: 5,
} as const;

const EXPIRY_WARNING_DAYS = 30;

// ---------------------------------------------------------------------------
// Vehicle / cargo synonym helpers (unchanged)
// ---------------------------------------------------------------------------

const VEHICLE_CARGO_SYNONYMS: Record<string, string[]> = {
  reefer: ["refrigerated", "cold", "frozen", "temperature controlled", "temp controlled", "climate controlled"],
  refrigerated: ["reefer", "cold", "frozen", "temperature controlled", "temp controlled", "climate controlled"],
  flatbed: ["flat bed", "flat-bed", "open deck", "open trailer"],
  "dry van": ["dry-van", "dryvan", "enclosed", "box trailer", "box truck"],
  tanker: ["tank", "liquid", "bulk liquid"],
  hopper: ["grain", "bulk", "dry bulk"],
  lowboy: ["low boy", "low-boy", "heavy haul", "heavy equipment"],
  "step deck": ["step-deck", "stepdeck", "drop deck"],
  conestoga: ["curtain side", "curtainside"],
  hazmat: ["hazardous", "hazardous materials", "dangerous goods"],
};

function getSynonyms(term: string): string[] {
  const normalized = term.toLowerCase().trim();
  const synonyms = [normalized];
  if (VEHICLE_CARGO_SYNONYMS[normalized]) synonyms.push(...VEHICLE_CARGO_SYNONYMS[normalized]);
  for (const [key, values] of Object.entries(VEHICLE_CARGO_SYNONYMS)) {
    if (values.some((v) => normalized.includes(v) || v.includes(normalized))) {
      synonyms.push(key, ...values);
    }
  }
  return [...new Set(synonyms)];
}

function termsMatch(term1: string, term2: string): boolean {
  const t1 = term1.toLowerCase().trim();
  const t2 = term2.toLowerCase().trim();
  if (t1 === t2 || t1.includes(t2) || t2.includes(t1)) return true;
  const s1 = getSynonyms(t1);
  const s2 = getSynonyms(t2);
  return s1.some((a) => s2.some((b) => a === b || a.includes(b) || b.includes(a)));
}

export function canDriverHaulTrailerType(driver: Driver, requiredType: TrailerType | string): boolean {
  const required = requiredType.toLowerCase().trim();
  if (driver.trailerTypes && driver.trailerTypes.length > 0) {
    return driver.trailerTypes.some((t) => t.toLowerCase() === required || termsMatch(t, requiredType));
  }
  if (driver.vehicleType) {
    return driver.vehicleType.toLowerCase() === required || termsMatch(driver.vehicleType, requiredType);
  }
  return false;
}

export function isEquipmentCompatible(driver: Driver, load: Load): boolean {
  if (load.trailerType) return canDriverHaulTrailerType(driver, load.trailerType);
  if (load.requiredQualifications && load.requiredQualifications.length > 0) {
    const trailerReqs = load.requiredQualifications.filter((req) => {
      const lower = req.toLowerCase();
      return (
        lower.includes("van") || lower.includes("reefer") || lower.includes("flatbed") ||
        lower.includes("tanker") || lower.includes("hopper") || lower.includes("deck") ||
        lower.includes("refrigerated") || lower.includes("lowboy")
      );
    });
    if (trailerReqs.length > 0) return trailerReqs.some((req) => canDriverHaulTrailerType(driver, req));
  }
  return true;
}

export function getDriverTrailerTypes(driver: Driver): string[] {
  if (driver.trailerTypes && driver.trailerTypes.length > 0) return driver.trailerTypes;
  if (driver.vehicleType) return [driver.vehicleType];
  return [];
}

// ---------------------------------------------------------------------------
// Geocoding (unchanged)
// ---------------------------------------------------------------------------

const GEOCODING_STATES = ["ma", "ny", "il", "pa", "fl", "ga", "tx", "ca", "co", "wa", "oh"];
const GEOCODING_STATE_NAMES = [
  "massachusetts", "new york", "illinois", "pennsylvania", "florida",
  "georgia", "texas", "california", "colorado", "washington", "ohio",
];

const geocodeCache = new Map<string, { lat: number; lng: number } | null>();

const FALLBACK_COORDINATES: Record<string, { lat: number; lng: number }> = {
  miami: { lat: 25.7617, lng: -80.1918 }, tampa: { lat: 27.9506, lng: -82.4572 },
  orlando: { lat: 28.5383, lng: -81.3792 }, jacksonville: { lat: 30.3322, lng: -81.6557 },
  "fort lauderdale": { lat: 26.1224, lng: -80.1373 }, tallahassee: { lat: 30.4383, lng: -84.2807 },
  fl: { lat: 28.0, lng: -82.0 }, florida: { lat: 28.0, lng: -82.0 },
  houston: { lat: 29.7604, lng: -95.3698 }, dallas: { lat: 32.7767, lng: -96.797 },
  austin: { lat: 30.2672, lng: -97.7431 }, "san antonio": { lat: 29.4241, lng: -98.4936 },
  "fort worth": { lat: 32.7555, lng: -97.3308 }, "el paso": { lat: 31.7619, lng: -106.485 },
  tx: { lat: 31.0, lng: -100.0 }, texas: { lat: 31.0, lng: -100.0 },
  "los angeles": { lat: 34.0522, lng: -118.2437 }, "san francisco": { lat: 37.7749, lng: -122.4194 },
  "san diego": { lat: 32.7157, lng: -117.1611 }, sacramento: { lat: 38.5816, lng: -121.4944 },
  fresno: { lat: 36.7378, lng: -119.7871 }, sf: { lat: 37.7749, lng: -122.4194 },
  la: { lat: 34.0522, lng: -118.2437 }, ca: { lat: 36.7783, lng: -119.4179 },
  california: { lat: 36.7783, lng: -119.4179 },
  seattle: { lat: 47.6062, lng: -122.3321 }, spokane: { lat: 47.6588, lng: -117.426 },
  tacoma: { lat: 47.2529, lng: -122.4443 }, wa: { lat: 47.0, lng: -120.0 },
  washington: { lat: 47.0, lng: -120.0 },
  "new york": { lat: 40.7128, lng: -74.006 }, "new york city": { lat: 40.7128, lng: -74.006 },
  buffalo: { lat: 42.8864, lng: -78.8784 }, rochester: { lat: 43.1566, lng: -77.6088 },
  albany: { lat: 42.6526, lng: -73.7562 }, nyc: { lat: 40.7128, lng: -74.006 },
  ny: { lat: 42.0, lng: -75.0 },
  chicago: { lat: 41.8781, lng: -87.6298 }, "springfield il": { lat: 39.7817, lng: -89.6501 },
  peoria: { lat: 40.6936, lng: -89.589 }, il: { lat: 40.0, lng: -89.0 },
  illinois: { lat: 40.0, lng: -89.0 },
  atlanta: { lat: 33.749, lng: -84.388 }, savannah: { lat: 32.0809, lng: -81.0912 },
  augusta: { lat: 33.4735, lng: -82.0105 }, ga: { lat: 33.0, lng: -83.5 },
  georgia: { lat: 33.0, lng: -83.5 },
  denver: { lat: 39.7392, lng: -104.9903 }, "colorado springs": { lat: 38.8339, lng: -104.8214 },
  boulder: { lat: 40.015, lng: -105.2705 }, co: { lat: 39.0, lng: -105.5 },
  colorado: { lat: 39.0, lng: -105.5 },
  philadelphia: { lat: 39.9526, lng: -75.1652 }, pittsburgh: { lat: 40.4406, lng: -79.9959 },
  harrisburg: { lat: 40.2732, lng: -76.8867 }, pa: { lat: 41.0, lng: -77.5 },
  pennsylvania: { lat: 41.0, lng: -77.5 },
  columbus: { lat: 39.9612, lng: -82.9988 }, cleveland: { lat: 41.4993, lng: -81.6944 },
  cincinnati: { lat: 39.1031, lng: -84.512 }, toledo: { lat: 41.6528, lng: -83.5379 },
  oh: { lat: 40.5, lng: -82.5 }, ohio: { lat: 40.5, lng: -82.5 },
  boston: { lat: 42.3601, lng: -71.0589 }, worcester: { lat: 42.2626, lng: -71.8023 },
  "springfield ma": { lat: 42.1015, lng: -72.5898 }, ma: { lat: 42.0, lng: -71.5 },
  massachusetts: { lat: 42.0, lng: -71.5 },
  phoenix: { lat: 33.4484, lng: -112.074 }, az: { lat: 34.0, lng: -111.5 },
  arizona: { lat: 34.0, lng: -111.5 },
  "las vegas": { lat: 36.1699, lng: -115.1398 }, nv: { lat: 39.0, lng: -117.0 },
  nevada: { lat: 39.0, lng: -117.0 },
  portland: { lat: 45.5152, lng: -122.6784 }, or: { lat: 44.0, lng: -120.5 },
  oregon: { lat: 44.0, lng: -120.5 },
  charlotte: { lat: 35.2271, lng: -80.8431 }, raleigh: { lat: 35.7796, lng: -78.6382 },
  nc: { lat: 35.5, lng: -80.0 }, "north carolina": { lat: 35.5, lng: -80.0 },
  nashville: { lat: 36.1627, lng: -86.7816 }, memphis: { lat: 35.1495, lng: -90.049 },
  tn: { lat: 36.0, lng: -86.0 }, tennessee: { lat: 36.0, lng: -86.0 },
  "new orleans": { lat: 29.9511, lng: -90.0715 }, louisiana: { lat: 31.0, lng: -92.0 },
  detroit: { lat: 42.3314, lng: -83.0458 }, mi: { lat: 44.0, lng: -85.0 },
  michigan: { lat: 44.0, lng: -85.0 },
  minneapolis: { lat: 44.9778, lng: -93.265 }, mn: { lat: 46.0, lng: -94.0 },
  minnesota: { lat: 46.0, lng: -94.0 },
  indianapolis: { lat: 39.7684, lng: -86.1581 }, in: { lat: 40.0, lng: -86.0 },
  indiana: { lat: 40.0, lng: -86.0 },
  "kansas city": { lat: 39.0997, lng: -94.5786 }, "st louis": { lat: 38.627, lng: -90.1994 },
  mo: { lat: 38.5, lng: -92.5 }, missouri: { lat: 38.5, lng: -92.5 },
  baltimore: { lat: 39.2904, lng: -76.6122 }, md: { lat: 39.0, lng: -76.7 },
  maryland: { lat: 39.0, lng: -76.7 },
  milwaukee: { lat: 43.0389, lng: -87.9065 }, wi: { lat: 44.0, lng: -89.5 },
  wisconsin: { lat: 44.0, lng: -89.5 },
  "salt lake city": { lat: 40.7608, lng: -111.891 }, ut: { lat: 39.5, lng: -111.5 },
  utah: { lat: 39.5, lng: -111.5 },
  "oklahoma city": { lat: 35.4676, lng: -97.5164 }, ok: { lat: 35.5, lng: -97.5 },
  oklahoma: { lat: 35.5, lng: -97.5 },
  albuquerque: { lat: 35.0844, lng: -106.6504 }, nm: { lat: 34.5, lng: -106.0 },
  "new mexico": { lat: 34.5, lng: -106.0 },
  newark: { lat: 40.7357, lng: -74.1724 }, nj: { lat: 40.0583, lng: -74.4057 },
  "new jersey": { lat: 40.0583, lng: -74.4057 },
  "virginia beach": { lat: 36.8529, lng: -75.978 }, richmond: { lat: 37.5407, lng: -77.436 },
  va: { lat: 37.5, lng: -79.0 }, virginia: { lat: 37.5, lng: -79.0 },
};

function isGeocodingEnabled(location: string): boolean {
  const n = location.toLowerCase().trim();
  for (const st of GEOCODING_STATES) {
    if (n.endsWith(", " + st) || n.endsWith(" " + st) || n === st) return true;
  }
  for (const sn of GEOCODING_STATE_NAMES) {
    if (n.includes(sn)) return true;
  }
  return false;
}

async function geocodeLocation(location: string): Promise<{ lat: number; lng: number } | null> {
  const key = location.toLowerCase().trim();
  if (geocodeCache.has(key)) return geocodeCache.get(key) ?? null;
  if (!isGeocodingEnabled(location)) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location + ", USA")}&limit=1`,
      { headers: { "User-Agent": "XtraFleet/1.0 (https://xtrafleet.com)" } }
    );
    if (!res.ok) { geocodeCache.set(key, null); return null; }
    const data = await res.json();
    if (data?.length > 0) {
      const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      geocodeCache.set(key, coords);
      return coords;
    }
    geocodeCache.set(key, null);
    return null;
  } catch (err) {
    console.warn(`${LOG_PREFIX} geocodeLocation error for "${location}":`, err);
    geocodeCache.set(key, null);
    return null;
  }
}

function getCoordinatesSync(location: string): { lat: number; lng: number } | null {
  if (!location) return null;
  const n = location.toLowerCase().trim();
  if (FALLBACK_COORDINATES[n]) return FALLBACK_COORDINATES[n];
  for (const [key, coords] of Object.entries(FALLBACK_COORDINATES)) {
    if (n.includes(key) || key.includes(n)) return coords;
  }
  const city = n.split(",")[0].trim();
  if (FALLBACK_COORDINATES[city]) return FALLBACK_COORDINATES[city];
  const parts = n.split(",");
  if (parts.length > 1) {
    const st = parts[parts.length - 1].trim();
    if (FALLBACK_COORDINATES[st]) return FALLBACK_COORDINATES[st];
  }
  return null;
}

async function getCoordinatesAsync(location: string): Promise<{ lat: number; lng: number } | null> {
  const fallback = getCoordinatesSync(location);
  if (fallback) return fallback;
  if (isGeocodingEnabled(location)) return geocodeLocation(location);
  return null;
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateLocationScoreWeighted(d: { lat: number; lng: number } | null, l: { lat: number; lng: number } | null): number {
  if (!d || !l) return 10;
  const dist = calculateDistance(d.lat, d.lng, l.lat, l.lng);
  if (dist <= 25) return 35;
  if (dist <= 50) return 33;
  if (dist <= 100) return 30;
  if (dist <= 200) return 27;
  if (dist <= 350) return 23;
  if (dist <= 500) return 18;
  if (dist <= 750) return 14;
  if (dist <= 1000) return 10;
  if (dist <= 1500) return 6;
  if (dist <= 2500) return 3;
  return 1;
}

// ---------------------------------------------------------------------------
// DEV-123: Blended Qualification + Compliance scoring (40 pts)
//
// The 40-pt bucket covers two things:
//   1. Hard qualification match (certifications vs. load requirements)
//   2. Document health — score decays as expiry dates approach
//
// Decay schedule (applied to the full 40-pt bucket):
//   > 30 days until any expiry  → full pts
//   21-30 days                  → 85%  (lose ~6 pts)
//   11-20 days                  → 70%  (lose ~12 pts)
//   1-10 days                   → 50%  (lose ~20 pts)
//   Expired (< 0 days)          → 0 pts for the entire bucket (hard zero)
//
// The worst expiry found drives the decay.
// ---------------------------------------------------------------------------

function getExpiryDecayMultiplier(daysUntil: number): number {
  if (daysUntil < 0) return 0;      // expired — hard zero
  if (daysUntil <= 10) return 0.50;
  if (daysUntil <= 20) return 0.70;
  if (daysUntil <= 30) return 0.85;
  return 1.0;                        // > 30 days — no decay
}

function buildExpiryDetails(driver: Driver): ExpiryDetail[] {
  const now = new Date();
  const details: ExpiryDetail[] = [];

  const checks: { label: string; value?: string }[] = [
    { label: "CDL", value: driver.cdlExpiry },
    { label: "Medical Certificate", value: driver.medicalCardExpiry },
    { label: "Insurance (COI)", value: driver.insuranceExpiry },
  ];

  for (const { label, value } of checks) {
    if (!value) continue;
    try {
      const daysUntil = differenceInDays(parseISO(value), now);
      const status: ExpiryDetail["status"] =
        daysUntil < 0 ? "expired" : daysUntil <= EXPIRY_WARNING_DAYS ? "yellow" : "green";
      details.push({ label, expiryDate: value, daysUntil, status });
    } catch (err) {
      console.warn(`${LOG_PREFIX} Failed to parse expiry date for ${label}: ${value}`, err);
    }
  }

  return details;
}

function calculateQualificationScore(
  driver: Driver,
  load: Load
): { score: number; warning?: string; expiryDetails: ExpiryDetail[] } {
  // --- Part 1: Cert/qualification match (scales the raw bucket) ---
  const loadRequirements = (load.requiredQualifications || []).filter((req) => {
    const lower = req.toLowerCase();
    return (
      !lower.includes("van") && !lower.includes("reefer") && !lower.includes("flatbed") &&
      !lower.includes("tanker") && !lower.includes("refrigerated") && !lower.includes("lowboy") &&
      !lower.includes("deck") && !lower.includes("hopper")
    );
  });

  let qualRatio = 1.0; // assume fully qualified if no requirements
  if (loadRequirements.length > 0) {
    const driverCerts = driver.certifications || [];
    const matched = loadRequirements.filter((req) =>
      driverCerts.some((cert) => termsMatch(cert, req))
    ).length;
    qualRatio = matched / loadRequirements.length;
  }

  const rawScore = WEIGHTS.qualification * qualRatio; // 0–40

  // --- Part 2: Expiry decay ---
  const expiryDetails = buildExpiryDetails(driver);

  // Find the most critical (smallest daysUntil) expiry across all docs
  let worstDays = Infinity;
  for (const d of expiryDetails) {
    if (d.daysUntil < worstDays) worstDays = d.daysUntil;
  }

  // If no expiry dates are on file at all, apply a moderate penalty
  // (missing docs = we can't trust compliance)
  if (expiryDetails.length === 0) {
    console.warn(
      `${LOG_PREFIX} Driver ${driver.id ?? driver.name} has no expiry dates on file — applying 50% qual penalty`
    );
    return {
      score: Math.round(rawScore * 0.5),
      warning: "Qualification scores are lower than others due to missing document expiration dates.",
      expiryDetails,
    };
  }

  const multiplier = getExpiryDecayMultiplier(worstDays);
  const finalScore = Math.round(rawScore * multiplier);

  let warning: string | undefined;
  if (multiplier < 1.0) {
    const expiredDocs = expiryDetails.filter((d) => d.status === "expired").map((d) => d.label);
    const yellowDocs = expiryDetails.filter((d) => d.status === "yellow").map((d) => d.label);
    if (expiredDocs.length > 0) {
      warning = `Qualification score is 0 due to expired documents: ${expiredDocs.join(", ")}.`;
    } else if (yellowDocs.length > 0) {
      warning = `Qualification scores are lower than others due to upcoming document expiration dates (${yellowDocs.join(", ")}).`;
    }
    console.warn(
      `${LOG_PREFIX} Driver ${driver.id ?? driver.name} qual decay: worstDays=${worstDays} multiplier=${multiplier} score=${finalScore}/${WEIGHTS.qualification} — ${warning}`
    );
  }

  return { score: finalScore, warning, expiryDetails };
}

// ---------------------------------------------------------------------------
// Core breakdown calculator
// ---------------------------------------------------------------------------

function buildBreakdown(
  driver: Driver,
  load: Load,
  locationScore: number
): MatchScoreBreakdown {
  // Vehicle match (0-20)
  let vehicleMatch = 0;
  if (load.trailerType) {
    vehicleMatch = WEIGHTS.vehicle; // hard filter already verified compatibility
  } else if (load.requiredQualifications && load.requiredQualifications.length > 0) {
    const driverTypes = getDriverTrailerTypes(driver);
    const matches = load.requiredQualifications.some((req) =>
      driverTypes.some((t) => termsMatch(t, req))
    );
    vehicleMatch = matches ? WEIGHTS.vehicle : Math.round(WEIGHTS.vehicle * 0.6);
  } else {
    vehicleMatch = Math.round(WEIGHTS.vehicle * 0.75); // no requirement specified
  }

  // Rating (0-5)
  const ratingScore =
    driver.rating && driver.rating > 0
      ? Math.round((driver.rating / 5) * WEIGHTS.rating)
      : Math.round(WEIGHTS.rating * 0.5); // neutral score for unrated

  // Qualification + compliance blended (0-40)
  const { score: qualificationScore, warning, expiryDetails } = calculateQualificationScore(driver, load);

  console.log(
    `${LOG_PREFIX} Score for driver ${driver.id ?? driver.name}: ` +
    `location=${locationScore} vehicle=${vehicleMatch} qual=${qualificationScore} rating=${ratingScore} ` +
    `total=${locationScore + vehicleMatch + qualificationScore + ratingScore}`
  );

  return {
    vehicleMatch,
    qualificationScore,
    locationScore,
    ratingScore,
    // Backwards-compat aliases (used by some display components)
    qualificationMatch: qualificationScore,
    complianceScore: 0, // folded into qualificationScore — kept at 0 for compat
    qualificationWarning: warning,
    expiryDetails,
  };
}

// ---------------------------------------------------------------------------
// Public score calculators
// ---------------------------------------------------------------------------

export function calculateMatchScore(driver: Driver, load: Load): MatchScoreBreakdown {
  const dCoords = getCoordinatesSync(driver.location || "");
  const lCoords = getCoordinatesSync(load.origin || "");
  return buildBreakdown(driver, load, calculateLocationScoreWeighted(dCoords, lCoords));
}

export async function calculateMatchScoreAsync(driver: Driver, load: Load): Promise<MatchScoreBreakdown> {
  const dCoords = await getCoordinatesAsync(driver.location || "");
  const lCoords = await getCoordinatesAsync(load.origin || "");
  return buildBreakdown(driver, load, calculateLocationScoreWeighted(dCoords, lCoords));
}

export function getTotalScore(breakdown: MatchScoreBreakdown): number {
  return (
    breakdown.vehicleMatch +
    breakdown.qualificationScore +
    breakdown.locationScore +
    breakdown.ratingScore
    // complianceScore intentionally excluded — now folded into qualificationScore
  );
}

// ---------------------------------------------------------------------------
// Match finders
// ---------------------------------------------------------------------------

export function findMatchingDrivers(
  load: Load,
  drivers: Driver[],
  options: MatchingOptions = {}
): MatchScore[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const eligible = drivers.filter((driver) => {
    if (opts.onlyAvailable && driver.availability !== "Available") return false;
    if (opts.onlyGreenCompliance) {
      // Still use the lightweight status check as a hard gate
      const expiryDetails = buildExpiryDetails(driver);
      const hasExpired = expiryDetails.some((d) => d.status === "expired");
      if (hasExpired) return false;
    }
    if (!isEquipmentCompatible(driver, load)) return false;
    return true;
  });

  console.log(
    `${LOG_PREFIX} findMatchingDrivers: ${eligible.length}/${drivers.length} eligible for load ${load.id ?? load.origin}`
  );

  const scored: MatchScore[] = eligible.map((driver) => {
    const breakdown = calculateMatchScore(driver, load);
    const score = getTotalScore(breakdown);
    return { driver, score, breakdown, rank: 0, isBestMatch: false };
  });

  scored.sort((a, b) => b.score - a.score);
  scored.forEach((m, i) => { m.rank = i + 1; m.isBestMatch = i === 0; });

  return opts.maxResults ? scored.slice(0, opts.maxResults) : scored;
}

export async function findMatchingDriversAsync(
  load: Load,
  drivers: Driver[],
  options: MatchingOptions = {}
): Promise<MatchScore[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const eligible = drivers.filter((driver) => {
    if (opts.onlyAvailable && driver.availability !== "Available") return false;
    if (opts.onlyGreenCompliance) {
      const expiryDetails = buildExpiryDetails(driver);
      if (expiryDetails.some((d) => d.status === "expired")) return false;
    }
    return true;
  });

  const scored: MatchScore[] = await Promise.all(
    eligible.map(async (driver) => {
      const breakdown = await calculateMatchScoreAsync(driver, load);
      const score = getTotalScore(breakdown);
      return { driver, score, breakdown, rank: 0, isBestMatch: false };
    })
  );

  scored.sort((a, b) => b.score - a.score);
  scored.forEach((m, i) => { m.rank = i + 1; m.isBestMatch = i === 0; });

  return opts.maxResults ? scored.slice(0, opts.maxResults) : scored;
}

export function findMatchingLoads(
  driver: Driver,
  loads: Load[],
  options: { maxResults?: number } = {}
): LoadMatchScore[] {
  const { maxResults = 10 } = options;

  const compatible = loads.filter(
    (load) => load.status === "Pending" && isEquipmentCompatible(driver, load)
  );

  console.log(
    `${LOG_PREFIX} findMatchingLoads: ${compatible.length}/${loads.length} compatible for driver ${driver.id ?? driver.name}`
  );

  const scored = compatible.map((load) => {
    const breakdown = calculateMatchScore(driver, load);
    const score = getTotalScore(breakdown);
    return { load, score, breakdown, rank: 0, isBestMatch: false };
  });

  scored.sort((a, b) => b.score - a.score);
  scored.forEach((m, i) => { m.rank = i + 1; m.isBestMatch = i === 0; });

  return scored.slice(0, maxResults);
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function getMatchQualityLabel(score: number): string {
  if (score >= 80) return "Excellent Match";
  if (score >= 60) return "Good Match";
  if (score >= 40) return "Fair Match";
  return "Possible Match";
}

export function getMatchQualityColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-blue-600";
  if (score >= 40) return "text-yellow-600";
  return "text-gray-600";
}

export type MatchReason = {
  label: string;
  icon: "location" | "truck" | "star" | "certificate" | "shield";
  color: string;
};

export function getMatchReasons(breakdown: MatchScoreBreakdown): MatchReason[] {
  const reasons: MatchReason[] = [];
  if (breakdown.locationScore >= 27)
    reasons.push({ label: breakdown.locationScore >= 33 ? "Very Close" : "Nearby", icon: "location", color: "bg-blue-100 text-blue-700 border-blue-300" });
  if (breakdown.vehicleMatch === WEIGHTS.vehicle)
    reasons.push({ label: "Equipment Match", icon: "truck", color: "bg-green-100 text-green-700 border-green-300" });
  if (breakdown.ratingScore >= Math.round(WEIGHTS.rating * 0.9))
    reasons.push({ label: "Top Rated", icon: "star", color: "bg-yellow-100 text-yellow-700 border-yellow-300" });
  if (breakdown.qualificationScore >= Math.round(WEIGHTS.qualification * 0.95))
    reasons.push({ label: "Fully Verified", icon: "certificate", color: "bg-purple-100 text-purple-700 border-purple-300" });
  return reasons.slice(0, 2);
}

export function getDistanceToLoad(driverLocation: string, loadOrigin: string): string | null {
  const d = getCoordinatesSync(driverLocation);
  const l = getCoordinatesSync(loadOrigin);
  if (!d || !l) return null;
  return Math.round(calculateDistance(d.lat, d.lng, l.lat, l.lng)).toLocaleString() + " miles";
}

export async function getDistanceToLoadAsync(driverLocation: string, loadOrigin: string): Promise<string | null> {
  const d = await getCoordinatesAsync(driverLocation);
  const l = await getCoordinatesAsync(loadOrigin);
  if (!d || !l) return null;
  return Math.round(calculateDistance(d.lat, d.lng, l.lat, l.lng)).toLocaleString() + " miles";
}
