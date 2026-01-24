import type { Driver, Load } from "@/lib/data";
import { getComplianceStatus, ComplianceStatus } from "@/lib/compliance";
import type { TrailerType } from "./trailer-types";

export interface MatchScoreBreakdown {
  vehicleMatch: number;
  qualificationMatch: number;
  locationScore: number;
  ratingScore: number;
  complianceScore: number;
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

// States that use geocoding API
const GEOCODING_STATES = ['ma', 'ny', 'il', 'pa', 'fl', 'ga', 'tx', 'ca', 'co', 'wa', 'oh'];
const GEOCODING_STATE_NAMES = [
  'massachusetts', 'new york', 'illinois', 'pennsylvania', 'florida',
  'georgia', 'texas', 'california', 'colorado', 'washington', 'ohio'
];

// Cache for geocoded locations
const geocodeCache: Map<string, { lat: number; lng: number } | null> = new Map();

// Fallback coordinates for all states and major cities
// Synonyms for vehicle/cargo type matching
const VEHICLE_CARGO_SYNONYMS: Record<string, string[]> = {
  'reefer': ['refrigerated', 'cold', 'frozen', 'temperature controlled', 'temp controlled', 'climate controlled'],
  'refrigerated': ['reefer', 'cold', 'frozen', 'temperature controlled', 'temp controlled', 'climate controlled'],
  'flatbed': ['flat bed', 'flat-bed', 'open deck', 'open trailer'],
  'dry van': ['dry-van', 'dryvan', 'enclosed', 'box trailer', 'box truck'],
  'tanker': ['tank', 'liquid', 'bulk liquid'],
  'hopper': ['grain', 'bulk', 'dry bulk'],
  'lowboy': ['low boy', 'low-boy', 'heavy haul', 'heavy equipment'],
  'step deck': ['step-deck', 'stepdeck', 'drop deck'],
  'conestoga': ['curtain side', 'curtainside'],
  'hazmat': ['hazardous', 'hazardous materials', 'dangerous goods'],
};

// Get all synonyms for a term
function getSynonyms(term: string): string[] {
  const normalized = term.toLowerCase().trim();
  const synonyms = [normalized];

  // Direct lookup
  if (VEHICLE_CARGO_SYNONYMS[normalized]) {
    synonyms.push(...VEHICLE_CARGO_SYNONYMS[normalized]);
  }

  // Reverse lookup - if term is a synonym of something
  for (const [key, values] of Object.entries(VEHICLE_CARGO_SYNONYMS)) {
    if (values.some(v => normalized.includes(v) || v.includes(normalized))) {
      synonyms.push(key);
      synonyms.push(...values);
    }
  }

  return [...new Set(synonyms)];
}

// Check if two terms match (including synonyms)
function termsMatch(term1: string, term2: string): boolean {
  const t1 = term1.toLowerCase().trim();
  const t2 = term2.toLowerCase().trim();

  // Direct match
  if (t1 === t2 || t1.includes(t2) || t2.includes(t1)) {
    return true;
  }

  // Synonym match
  const synonyms1 = getSynonyms(t1);
  const synonyms2 = getSynonyms(t2);

  return synonyms1.some(s1 =>
    synonyms2.some(s2 => s1 === s2 || s1.includes(s2) || s2.includes(s1))
  );
}

/**
 * Check if a driver can haul a specific trailer type
 * Uses both new trailerTypes array and legacy vehicleType field
 */
export function canDriverHaulTrailerType(driver: Driver, requiredType: TrailerType | string): boolean {
  const required = requiredType.toLowerCase().trim();

  // Check new trailerTypes array first
  if (driver.trailerTypes && driver.trailerTypes.length > 0) {
    return driver.trailerTypes.some(t => t.toLowerCase() === required || termsMatch(t, requiredType));
  }

  // Fall back to legacy vehicleType field
  if (driver.vehicleType) {
    return driver.vehicleType.toLowerCase() === required || termsMatch(driver.vehicleType, requiredType);
  }

  return false;
}

/**
 * Check if driver is compatible with load equipment requirements
 * This is a HARD FILTER - incompatible drivers should not appear in results
 */
export function isEquipmentCompatible(driver: Driver, load: Load): boolean {
  // If load specifies a trailer type, driver must support it
  if (load.trailerType) {
    return canDriverHaulTrailerType(driver, load.trailerType);
  }

  // Legacy: check requiredQualifications for trailer types
  if (load.requiredQualifications && load.requiredQualifications.length > 0) {
    // Check if any requirement is a trailer type that driver must match
    const trailerReqs = load.requiredQualifications.filter(req => {
      const lower = req.toLowerCase();
      return lower.includes('van') || lower.includes('reefer') || lower.includes('flatbed') ||
             lower.includes('tanker') || lower.includes('hopper') || lower.includes('deck') ||
             lower.includes('refrigerated') || lower.includes('lowboy');
    });

    if (trailerReqs.length > 0) {
      // Driver must match at least one trailer requirement
      return trailerReqs.some(req => canDriverHaulTrailerType(driver, req));
    }
  }

  // No specific trailer requirement - any driver is compatible
  return true;
}

/**
 * Get all trailer types a driver can haul
 */
export function getDriverTrailerTypes(driver: Driver): string[] {
  if (driver.trailerTypes && driver.trailerTypes.length > 0) {
    return driver.trailerTypes;
  }
  if (driver.vehicleType) {
    return [driver.vehicleType];
  }
  return [];
}

const FALLBACK_COORDINATES: Record<string, { lat: number; lng: number }> = {
  // Florida (FL) - Geocoding enabled
  'miami': { lat: 25.7617, lng: -80.1918 },
  'tampa': { lat: 27.9506, lng: -82.4572 },
  'orlando': { lat: 28.5383, lng: -81.3792 },
  'jacksonville': { lat: 30.3322, lng: -81.6557 },
  'fort lauderdale': { lat: 26.1224, lng: -80.1373 },
  'tallahassee': { lat: 30.4383, lng: -84.2807 },
  'fl': { lat: 28.0000, lng: -82.0000 },
  'florida': { lat: 28.0000, lng: -82.0000 },
  
  // Texas (TX) - Geocoding enabled
  'houston': { lat: 29.7604, lng: -95.3698 },
  'dallas': { lat: 32.7767, lng: -96.7970 },
  'austin': { lat: 30.2672, lng: -97.7431 },
  'san antonio': { lat: 29.4241, lng: -98.4936 },
  'fort worth': { lat: 32.7555, lng: -97.3308 },
  'el paso': { lat: 31.7619, lng: -106.4850 },
  'tx': { lat: 31.0000, lng: -100.0000 },
  'texas': { lat: 31.0000, lng: -100.0000 },
  
  // California (CA) - Geocoding enabled
  'los angeles': { lat: 34.0522, lng: -118.2437 },
  'san francisco': { lat: 37.7749, lng: -122.4194 },
  'san diego': { lat: 32.7157, lng: -117.1611 },
  'sacramento': { lat: 38.5816, lng: -121.4944 },
  'fresno': { lat: 36.7378, lng: -119.7871 },
  'sf': { lat: 37.7749, lng: -122.4194 },
  'la': { lat: 34.0522, lng: -118.2437 },
  'ca': { lat: 36.7783, lng: -119.4179 },
  'california': { lat: 36.7783, lng: -119.4179 },
  
  // Washington (WA) - Geocoding enabled
  'seattle': { lat: 47.6062, lng: -122.3321 },
  'spokane': { lat: 47.6588, lng: -117.4260 },
  'tacoma': { lat: 47.2529, lng: -122.4443 },
  'wa': { lat: 47.0000, lng: -120.0000 },
  'washington': { lat: 47.0000, lng: -120.0000 },
  
  // New York (NY) - Geocoding enabled
  'new york': { lat: 40.7128, lng: -74.0060 },
  'new york city': { lat: 40.7128, lng: -74.0060 },
  'buffalo': { lat: 42.8864, lng: -78.8784 },
  'rochester': { lat: 43.1566, lng: -77.6088 },
  'albany': { lat: 42.6526, lng: -73.7562 },
  'nyc': { lat: 40.7128, lng: -74.0060 },
  'ny': { lat: 42.0000, lng: -75.0000 },
  
  // Illinois (IL) - Geocoding enabled
  'chicago': { lat: 41.8781, lng: -87.6298 },
  'springfield il': { lat: 39.7817, lng: -89.6501 },
  'peoria': { lat: 40.6936, lng: -89.5890 },
  'il': { lat: 40.0000, lng: -89.0000 },
  'illinois': { lat: 40.0000, lng: -89.0000 },
  
  // Georgia (GA) - Geocoding enabled
  'atlanta': { lat: 33.7490, lng: -84.3880 },
  'savannah': { lat: 32.0809, lng: -81.0912 },
  'augusta': { lat: 33.4735, lng: -82.0105 },
  'ga': { lat: 33.0000, lng: -83.5000 },
  'georgia': { lat: 33.0000, lng: -83.5000 },
  
  // Colorado (CO) - Geocoding enabled
  'denver': { lat: 39.7392, lng: -104.9903 },
  'colorado springs': { lat: 38.8339, lng: -104.8214 },
  'boulder': { lat: 40.0150, lng: -105.2705 },
  'co': { lat: 39.0000, lng: -105.5000 },
  'colorado': { lat: 39.0000, lng: -105.5000 },
  
  // Pennsylvania (PA) - Geocoding enabled
  'philadelphia': { lat: 39.9526, lng: -75.1652 },
  'pittsburgh': { lat: 40.4406, lng: -79.9959 },
  'harrisburg': { lat: 40.2732, lng: -76.8867 },
  'pa': { lat: 41.0000, lng: -77.5000 },
  'pennsylvania': { lat: 41.0000, lng: -77.5000 },
  
  // Ohio (OH) - Geocoding enabled
  'columbus': { lat: 39.9612, lng: -82.9988 },
  'cleveland': { lat: 41.4993, lng: -81.6944 },
  'cincinnati': { lat: 39.1031, lng: -84.5120 },
  'toledo': { lat: 41.6528, lng: -83.5379 },
  'oh': { lat: 40.5000, lng: -82.5000 },
  'ohio': { lat: 40.5000, lng: -82.5000 },
  
  // Massachusetts (MA) - Geocoding enabled
  'boston': { lat: 42.3601, lng: -71.0589 },
  'worcester': { lat: 42.2626, lng: -71.8023 },
  'springfield ma': { lat: 42.1015, lng: -72.5898 },
  'ma': { lat: 42.0000, lng: -71.5000 },
  'massachusetts': { lat: 42.0000, lng: -71.5000 },
  
  // Other states (fallback only - no geocoding)
  'phoenix': { lat: 33.4484, lng: -112.0740 },
  'az': { lat: 34.0000, lng: -111.5000 },
  'arizona': { lat: 34.0000, lng: -111.5000 },
  
  'las vegas': { lat: 36.1699, lng: -115.1398 },
  'nv': { lat: 39.0000, lng: -117.0000 },
  'nevada': { lat: 39.0000, lng: -117.0000 },
  
  'portland': { lat: 45.5152, lng: -122.6784 },
  'or': { lat: 44.0000, lng: -120.5000 },
  'oregon': { lat: 44.0000, lng: -120.5000 },
  
  'charlotte': { lat: 35.2271, lng: -80.8431 },
  'raleigh': { lat: 35.7796, lng: -78.6382 },
  'nc': { lat: 35.5000, lng: -80.0000 },
  'north carolina': { lat: 35.5000, lng: -80.0000 },
  
  'nashville': { lat: 36.1627, lng: -86.7816 },
  'memphis': { lat: 35.1495, lng: -90.0490 },
  'tn': { lat: 36.0000, lng: -86.0000 },
  'tennessee': { lat: 36.0000, lng: -86.0000 },
  
  'new orleans': { lat: 29.9511, lng: -90.0715 },
  'la state': { lat: 31.0000, lng: -92.0000 },
  'louisiana': { lat: 31.0000, lng: -92.0000 },
  
  'detroit': { lat: 42.3314, lng: -83.0458 },
  'mi': { lat: 44.0000, lng: -85.0000 },
  'michigan': { lat: 44.0000, lng: -85.0000 },
  
  'minneapolis': { lat: 44.9778, lng: -93.2650 },
  'mn': { lat: 46.0000, lng: -94.0000 },
  'minnesota': { lat: 46.0000, lng: -94.0000 },
  
  'indianapolis': { lat: 39.7684, lng: -86.1581 },
  'in': { lat: 40.0000, lng: -86.0000 },
  'indiana': { lat: 40.0000, lng: -86.0000 },
  
  'kansas city': { lat: 39.0997, lng: -94.5786 },
  'st louis': { lat: 38.6270, lng: -90.1994 },
  'mo': { lat: 38.5000, lng: -92.5000 },
  'missouri': { lat: 38.5000, lng: -92.5000 },
  
  'baltimore': { lat: 39.2904, lng: -76.6122 },
  'md': { lat: 39.0000, lng: -76.7000 },
  'maryland': { lat: 39.0000, lng: -76.7000 },
  
  'milwaukee': { lat: 43.0389, lng: -87.9065 },
  'wi': { lat: 44.0000, lng: -89.5000 },
  'wisconsin': { lat: 44.0000, lng: -89.5000 },
  
  'salt lake city': { lat: 40.7608, lng: -111.8910 },
  'ut': { lat: 39.5000, lng: -111.5000 },
  'utah': { lat: 39.5000, lng: -111.5000 },
  
  'oklahoma city': { lat: 35.4676, lng: -97.5164 },
  'ok': { lat: 35.5000, lng: -97.5000 },
  'oklahoma': { lat: 35.5000, lng: -97.5000 },
  
  'albuquerque': { lat: 35.0844, lng: -106.6504 },
  'nm': { lat: 34.5000, lng: -106.0000 },
  'new mexico': { lat: 34.5000, lng: -106.0000 },
  
  'newark': { lat: 40.7357, lng: -74.1724 },
  'nj': { lat: 40.0583, lng: -74.4057 },
  'new jersey': { lat: 40.0583, lng: -74.4057 },
  
  'virginia beach': { lat: 36.8529, lng: -75.9780 },
  'richmond': { lat: 37.5407, lng: -77.4360 },
  'va': { lat: 37.5000, lng: -79.0000 },
  'virginia': { lat: 37.5000, lng: -79.0000 },
};

/**
 * Check if location is in a geocoding-enabled state
 */
function isGeocodingEnabled(location: string): boolean {
  const normalized = location.toLowerCase().trim();
  
  // Check for state abbreviation
  for (const state of GEOCODING_STATES) {
    if (normalized.endsWith(', ' + state) || normalized.endsWith(' ' + state) || normalized === state) {
      return true;
    }
  }
  
  // Check for state name
  for (const stateName of GEOCODING_STATE_NAMES) {
    if (normalized.includes(stateName)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Geocode a location using free Nominatim API (OpenStreetMap)
 * Only used for geocoding-enabled states
 */
async function geocodeLocation(location: string): Promise<{ lat: number; lng: number } | null> {
  // Check cache first
  const cacheKey = location.toLowerCase().trim();
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) || null;
  }
  
  // Check if geocoding is enabled for this location
  if (!isGeocodingEnabled(location)) {
    return null;
  }
  
  try {
    const encodedLocation = encodeURIComponent(location + ', USA');
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodedLocation}&limit=1`,
      {
        headers: {
          'User-Agent': 'XtraFleet/1.0 (https://xtrafleet.com)'
        }
      }
    );
    
    if (!response.ok) {
      console.warn('Geocoding API error:', response.status);
      geocodeCache.set(cacheKey, null);
      return null;
    }
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      const coords = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
      geocodeCache.set(cacheKey, coords);
      return coords;
    }
    
    geocodeCache.set(cacheKey, null);
    return null;
  } catch (error) {
    console.warn('Geocoding error:', error);
    geocodeCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Get coordinates for a location string (sync version using fallback)
 */
function getCoordinatesSync(location: string): { lat: number; lng: number } | null {
  if (!location) return null;
  
  const normalized = location.toLowerCase().trim();
  
  // Direct match
  if (FALLBACK_COORDINATES[normalized]) {
    return FALLBACK_COORDINATES[normalized];
  }
  
  // Try to find partial match
  for (const [key, coords] of Object.entries(FALLBACK_COORDINATES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return coords;
    }
  }
  
  // Try matching just the city part (before comma)
  const cityPart = normalized.split(',')[0].trim();
  if (FALLBACK_COORDINATES[cityPart]) {
    return FALLBACK_COORDINATES[cityPart];
  }
  
  // Try matching state abbreviation after comma
  const parts = normalized.split(',');
  if (parts.length > 1) {
    const statePart = parts[parts.length - 1].trim();
    if (FALLBACK_COORDINATES[statePart]) {
      return FALLBACK_COORDINATES[statePart];
    }
  }
  
  return null;
}

/**
 * Get coordinates for a location (async version with geocoding)
 */
async function getCoordinatesAsync(location: string): Promise<{ lat: number; lng: number } | null> {
  // First try fallback
  const fallback = getCoordinatesSync(location);
  if (fallback) {
    return fallback;
  }
  
  // If not found and geocoding enabled, try API
  if (isGeocodingEnabled(location)) {
    return await geocodeLocation(location);
  }
  
  return null;
}

/**
 * Calculate distance between two points using Haversine formula
 * Returns distance in miles
 */
function calculateDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate location score based on distance
 * Returns 0-20 points (legacy)
 */
function calculateLocationScore(driverCoords: { lat: number; lng: number } | null, loadCoords: { lat: number; lng: number } | null): number {
  if (!driverCoords || !loadCoords) {
    return 5; // Unknown location, partial score
  }

  const distance = calculateDistance(
    driverCoords.lat, driverCoords.lng,
    loadCoords.lat, loadCoords.lng
  );

  // Score based on distance
  if (distance <= 50) return 20;
  if (distance <= 150) return 18;
  if (distance <= 300) return 15;
  if (distance <= 500) return 12;
  if (distance <= 1000) return 8;
  if (distance <= 1500) return 5;
  if (distance <= 2500) return 3;
  return 1;
}

/**
 * Calculate location score based on distance (weighted version)
 * Returns 0-35 points - Location is the most important factor
 */
function calculateLocationScoreWeighted(driverCoords: { lat: number; lng: number } | null, loadCoords: { lat: number; lng: number } | null): number {
  if (!driverCoords || !loadCoords) {
    return 10; // Unknown location, partial score
  }

  const distance = calculateDistance(
    driverCoords.lat, driverCoords.lng,
    loadCoords.lat, loadCoords.lng
  );

  // Score based on distance - heavily favor nearby drivers
  if (distance <= 25) return 35;   // Same city/immediate area
  if (distance <= 50) return 33;   // Very close
  if (distance <= 100) return 30;  // Close
  if (distance <= 200) return 27;  // Regional
  if (distance <= 350) return 23;  // Extended regional
  if (distance <= 500) return 18;  // State-wide
  if (distance <= 750) return 14;  // Multi-state
  if (distance <= 1000) return 10; // Regional cross-country
  if (distance <= 1500) return 6;  // Cross-country
  if (distance <= 2500) return 3;  // Coast to coast
  return 1;
}

/**
 * Calculate match score between a driver and a load (sync version)
 *
 * Weight distribution (total 100 points):
 * - Location: 35 points (highest - proximity is most important)
 * - Vehicle Match: 25 points
 * - Qualification Match: 20 points
 * - Rating: 10 points
 * - Compliance: 10 points
 */
export function calculateMatchScore(driver: Driver, load: Load): MatchScore['breakdown'] {
  let vehicleMatch = 0;
  let qualificationMatch = 0;
  let locationScore = 0;
  let ratingScore = 0;
  let complianceScore = 0;

  // Vehicle Type Match (0-25 points)
  // Since equipment compatibility is now a hard filter, drivers reaching this point are compatible
  // Give full points if load specifies a type and driver matches, partial if unspecified
  if (load.trailerType) {
    // Load has specific requirement - driver must match (verified by hard filter)
    vehicleMatch = 25;
  } else if (load.requiredQualifications && load.requiredQualifications.length > 0) {
    // Legacy: check if driver matches any requirements
    const driverTypes = getDriverTrailerTypes(driver);
    const matches = load.requiredQualifications.some(req =>
      driverTypes.some(t => termsMatch(t, req))
    );
    vehicleMatch = matches ? 25 : 15;
  } else {
    // No specific trailer requirement - partial points
    vehicleMatch = 15;
  }

  // Qualification Match (0-20 points) - certifications and special requirements
  const loadRequirements = (load.requiredQualifications || []).filter(req => {
    // Filter out trailer type requirements (handled above)
    const lower = req.toLowerCase();
    return !lower.includes('van') && !lower.includes('reefer') && !lower.includes('flatbed') &&
           !lower.includes('tanker') && !lower.includes('refrigerated') && !lower.includes('lowboy') &&
           !lower.includes('deck') && !lower.includes('hopper');
  });

  if (loadRequirements.length > 0) {
    const driverCerts = driver.certifications || [];
    let matchedCount = 0;
    for (const req of loadRequirements) {
      if (driverCerts.some(cert => termsMatch(cert, req))) {
        matchedCount++;
      }
    }
    const matchPercentage = matchedCount / loadRequirements.length;
    qualificationMatch = Math.round(matchPercentage * 20);
  } else {
    qualificationMatch = 20; // No special certifications required
  }

  // Location Score (0-35 points) - HIGHEST WEIGHT
  const driverCoords = getCoordinatesSync(driver.location || '');
  const loadCoords = getCoordinatesSync(load.origin || '');
  locationScore = calculateLocationScoreWeighted(driverCoords, loadCoords);

  // Rating Score (0-10 points)
  if (driver.rating && driver.rating > 0) {
    ratingScore = Math.round((driver.rating / 5) * 10);
  } else {
    ratingScore = 5;
  }

  // Compliance Score (0-10 points)
  const complianceStatus = getComplianceStatus(driver);
  if (complianceStatus === 'Green') {
    complianceScore = 10;
  } else if (complianceStatus === 'Yellow') {
    complianceScore = 5;
  } else {
    complianceScore = 0;
  }

  return {
    vehicleMatch,
    qualificationMatch,
    locationScore,
    ratingScore,
    complianceScore,
  };
}

/**
 * Calculate match score with async geocoding for unknown locations
 *
 * Weight distribution (total 100 points):
 * - Location: 35 points (highest - proximity is most important)
 * - Vehicle Match: 25 points
 * - Qualification Match: 20 points
 * - Rating: 10 points
 * - Compliance: 10 points
 */
export async function calculateMatchScoreAsync(driver: Driver, load: Load): Promise<MatchScore['breakdown']> {
  let vehicleMatch = 0;
  let qualificationMatch = 0;
  let locationScore = 0;
  let ratingScore = 0;
  let complianceScore = 0;

  // Vehicle Type Match (0-25 points)
  // Since equipment compatibility is now a hard filter, drivers reaching this point are compatible
  if (load.trailerType) {
    vehicleMatch = 25;
  } else if (load.requiredQualifications && load.requiredQualifications.length > 0) {
    const driverTypes = getDriverTrailerTypes(driver);
    const matches = load.requiredQualifications.some(req =>
      driverTypes.some(t => termsMatch(t, req))
    );
    vehicleMatch = matches ? 25 : 15;
  } else {
    vehicleMatch = 15;
  }

  // Qualification Match (0-20 points) - certifications and special requirements
  const loadRequirements = (load.requiredQualifications || []).filter(req => {
    const lower = req.toLowerCase();
    return !lower.includes('van') && !lower.includes('reefer') && !lower.includes('flatbed') &&
           !lower.includes('tanker') && !lower.includes('refrigerated') && !lower.includes('lowboy') &&
           !lower.includes('deck') && !lower.includes('hopper');
  });

  if (loadRequirements.length > 0) {
    const driverCerts = driver.certifications || [];
    let matchedCount = 0;
    for (const req of loadRequirements) {
      if (driverCerts.some(cert => termsMatch(cert, req))) {
        matchedCount++;
      }
    }
    const matchPercentage = matchedCount / loadRequirements.length;
    qualificationMatch = Math.round(matchPercentage * 20);
  } else {
    qualificationMatch = 20;
  }

  // Location Score (0-35 points) - HIGHEST WEIGHT - with async geocoding
  const driverCoords = await getCoordinatesAsync(driver.location || '');
  const loadCoords = await getCoordinatesAsync(load.origin || '');
  locationScore = calculateLocationScoreWeighted(driverCoords, loadCoords);

  // Rating Score (0-10 points)
  if (driver.rating && driver.rating > 0) {
    ratingScore = Math.round((driver.rating / 5) * 10);
  } else {
    ratingScore = 5;
  }

  // Compliance Score (0-10 points)
  const complianceStatus = getComplianceStatus(driver);
  if (complianceStatus === 'Green') {
    complianceScore = 10;
  } else if (complianceStatus === 'Yellow') {
    complianceScore = 5;
  } else {
    complianceScore = 0;
  }

  return {
    vehicleMatch,
    qualificationMatch,
    locationScore,
    ratingScore,
    complianceScore,
  };
}

/**
 * Get total score from breakdown
 */
export function getTotalScore(breakdown: MatchScore['breakdown']): number {
  return (
    breakdown.vehicleMatch +
    breakdown.qualificationMatch +
    breakdown.locationScore +
    breakdown.ratingScore +
    breakdown.complianceScore
  );
}

/**
 * Find and rank matching drivers for a load (sync version)
 */
export function findMatchingDrivers(
  load: Load,
  drivers: Driver[],
  options: MatchingOptions = {}
): MatchScore[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let eligibleDrivers = drivers.filter(driver => {
    if (opts.onlyAvailable && driver.availability !== 'Available') {
      return false;
    }

    if (opts.onlyGreenCompliance) {
      const status = getComplianceStatus(driver);
      if (status !== 'Green') {
        return false;
      }
    }

    // HARD FILTER: Equipment must be compatible
    if (!isEquipmentCompatible(driver, load)) {
      return false;
    }

    return true;
  });

  const scoredDrivers: MatchScore[] = eligibleDrivers.map(driver => {
    const breakdown = calculateMatchScore(driver, load);
    const score = getTotalScore(breakdown);

    return {
      driver,
      score,
      breakdown,
      rank: 0,
      isBestMatch: false,
    };
  });

  scoredDrivers.sort((a, b) => b.score - a.score);

  scoredDrivers.forEach((match, index) => {
    match.rank = index + 1;
    match.isBestMatch = index === 0;
  });

  if (opts.maxResults) {
    return scoredDrivers.slice(0, opts.maxResults);
  }

  return scoredDrivers;
}

/**
 * Find and rank matching drivers with async geocoding
 */
export async function findMatchingDriversAsync(
  load: Load,
  drivers: Driver[],
  options: MatchingOptions = {}
): Promise<MatchScore[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let eligibleDrivers = drivers.filter(driver => {
    if (opts.onlyAvailable && driver.availability !== 'Available') {
      return false;
    }

    if (opts.onlyGreenCompliance) {
      const status = getComplianceStatus(driver);
      if (status !== 'Green') {
        return false;
      }
    }

    return true;
  });

  const scoredDrivers: MatchScore[] = await Promise.all(
    eligibleDrivers.map(async driver => {
      const breakdown = await calculateMatchScoreAsync(driver, load);
      const score = getTotalScore(breakdown);

      return {
        driver,
        score,
        breakdown,
        rank: 0,
        isBestMatch: false,
      };
    })
  );

  scoredDrivers.sort((a, b) => b.score - a.score);

  scoredDrivers.forEach((match, index) => {
    match.rank = index + 1;
    match.isBestMatch = index === 0;
  });

  if (opts.maxResults) {
    return scoredDrivers.slice(0, opts.maxResults);
  }

  return scoredDrivers;
}

/**
 * Find and rank matching loads for a driver
 */
export function findMatchingLoads(
  driver: Driver,
  loads: Load[],
  options: { maxResults?: number } = {}
): LoadMatchScore[] {
  const { maxResults = 10 } = options;

  // Filter to pending loads where driver has compatible equipment
  const compatibleLoads = loads.filter(load => {
    if (load.status !== 'Pending') return false;
    // HARD FILTER: Driver must be able to haul this load
    return isEquipmentCompatible(driver, load);
  });

  const scoredLoads = compatibleLoads.map(load => {
    const breakdown = calculateMatchScore(driver, load);
    const score = getTotalScore(breakdown);

    return {
      load,
      score,
      breakdown,
      rank: 0,
      isBestMatch: false,
    };
  });

  scoredLoads.sort((a, b) => b.score - a.score);

  scoredLoads.forEach((match, index) => {
    match.rank = index + 1;
    match.isBestMatch = index === 0;
  });

  return scoredLoads.slice(0, maxResults);
}

/**
 * Get a human-readable match quality label
 */
export function getMatchQualityLabel(score: number): string {
  if (score >= 80) return 'Excellent Match';
  if (score >= 60) return 'Good Match';
  if (score >= 40) return 'Fair Match';
  return 'Possible Match';
}

/**
 * Get match quality color
 */
export function getMatchQualityColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-blue-600';
  if (score >= 40) return 'text-yellow-600';
  return 'text-gray-600';
}

/**
 * Match reason types
 */
export type MatchReason = {
  label: string;
  icon: 'location' | 'truck' | 'star' | 'certificate' | 'shield';
  color: string;
};

/**
 * Get the primary reasons why a driver is a good match
 * Returns up to 2 reasons based on highest scoring categories
 */
export function getMatchReasons(breakdown: MatchScoreBreakdown): MatchReason[] {
  const reasons: MatchReason[] = [];

  // Check each category and determine if it's a strong match
  // Location: 35 max, >= 27 is great (within 350 miles)
  if (breakdown.locationScore >= 27) {
    reasons.push({
      label: breakdown.locationScore >= 33 ? 'Very Close' : 'Nearby',
      icon: 'location',
      color: 'bg-blue-100 text-blue-700 border-blue-300',
    });
  }

  // Vehicle Match: 25 max, 25 means perfect equipment match
  if (breakdown.vehicleMatch === 25) {
    reasons.push({
      label: 'Equipment Match',
      icon: 'truck',
      color: 'bg-green-100 text-green-700 border-green-300',
    });
  }

  // Rating: 10 max, >= 9 means highly rated driver
  if (breakdown.ratingScore >= 9) {
    reasons.push({
      label: 'Top Rated',
      icon: 'star',
      color: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    });
  }

  // Qualifications: 20 max, 20 means all qualifications met
  if (breakdown.qualificationMatch === 20) {
    reasons.push({
      label: 'Fully Qualified',
      icon: 'certificate',
      color: 'bg-purple-100 text-purple-700 border-purple-300',
    });
  }

  // Compliance: 10 max, 10 means green compliance
  if (breakdown.complianceScore === 10) {
    reasons.push({
      label: 'Compliant',
      icon: 'shield',
      color: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    });
  }

  // Return top 2 reasons (prioritize location and equipment)
  return reasons.slice(0, 2);
}

/**
 * Get distance between driver and load origin (for display)
 */
export function getDistanceToLoad(driverLocation: string, loadOrigin: string): string | null {
  const driverCoords = getCoordinatesSync(driverLocation);
  const loadCoords = getCoordinatesSync(loadOrigin);
  
  if (!driverCoords || !loadCoords) {
    return null;
  }
  
  const distance = calculateDistance(
    driverCoords.lat, driverCoords.lng,
    loadCoords.lat, loadCoords.lng
  );
  
  return Math.round(distance).toLocaleString() + ' miles';
}

/**
 * Get distance with async geocoding
 */
export async function getDistanceToLoadAsync(driverLocation: string, loadOrigin: string): Promise<string | null> {
  const driverCoords = await getCoordinatesAsync(driverLocation);
  const loadCoords = await getCoordinatesAsync(loadOrigin);
  
  if (!driverCoords || !loadCoords) {
    return null;
  }
  
  const distance = calculateDistance(
    driverCoords.lat, driverCoords.lng,
    loadCoords.lat, loadCoords.lng
  );
  
  return Math.round(distance).toLocaleString() + ' miles';
}