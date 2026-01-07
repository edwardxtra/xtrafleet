import type { Driver, Load } from "@/lib/data";
import { getComplianceStatus, ComplianceStatus } from "@/lib/compliance";

export interface MatchScore {
  driver: Driver;
  score: number;
  breakdown: {
    vehicleMatch: number;
    qualificationMatch: number;
    locationScore: number;
    ratingScore: number;
    complianceScore: number;
  };
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

/**
 * Calculate match score between a driver and a load
 * Higher score = better match
 * Max score = 100
 */
export function calculateMatchScore(driver: Driver, load: Load): MatchScore['breakdown'] {
  let vehicleMatch = 0;
  let qualificationMatch = 0;
  let locationScore = 0;
  let ratingScore = 0;
  let complianceScore = 0;

  // Vehicle Type Match (0-30 points)
  // Check if driver's vehicle type matches load requirements
  if (load.requiredQualifications?.includes(driver.vehicleType)) {
    vehicleMatch = 30;
  } else if (!load.requiredQualifications || load.requiredQualifications.length === 0) {
    // No specific requirements = partial match
    vehicleMatch = 20;
  }

  // Qualification Match (0-25 points)
  if (load.requiredQualifications && load.requiredQualifications.length > 0) {
    const driverQualifications = [
      driver.vehicleType,
      ...(driver.certifications || [])
    ];
    
    const matchedQualifications = load.requiredQualifications.filter(q => 
      driverQualifications.includes(q)
    );
    
    const matchPercentage = matchedQualifications.length / load.requiredQualifications.length;
    qualificationMatch = Math.round(matchPercentage * 25);
  } else {
    // No requirements = full points
    qualificationMatch = 25;
  }

  // Location Score (0-20 points)
  // Simple heuristic: check if driver location contains origin city/state
  // In production, you'd use actual distance calculation
  const driverLocation = driver.location?.toLowerCase() || '';
  const loadOrigin = load.origin?.toLowerCase() || '';
  
  if (driverLocation && loadOrigin) {
    // Check for city/state match
    const driverParts = driverLocation.split(',').map(s => s.trim());
    const originParts = loadOrigin.split(',').map(s => s.trim());
    
    const hasStateMatch = driverParts.some(dp => 
      originParts.some(op => op.includes(dp) || dp.includes(op))
    );
    
    if (hasStateMatch) {
      locationScore = 20;
    } else {
      // Partial score for having location data
      locationScore = 5;
    }
  }

  // Rating Score (0-15 points)
  if (driver.rating) {
    // Scale 0-5 rating to 0-15 points
    ratingScore = Math.round((driver.rating / 5) * 15);
  } else {
    // No rating = neutral score
    ratingScore = 7;
  }

  // Compliance Score (0-10 points)
  // Green compliance drivers already filtered, but score based on document completeness
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
 * Find and rank matching drivers for a load
 */
export function findMatchingDrivers(
  load: Load,
  drivers: Driver[],
  options: MatchingOptions = {}
): MatchScore[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Step 1: Filter drivers
  let eligibleDrivers = drivers.filter(driver => {
    // Filter by availability
    if (opts.onlyAvailable && driver.availability !== 'Available') {
      return false;
    }

    // Filter by compliance status (GREEN only by default)
    if (opts.onlyGreenCompliance) {
      const status = getComplianceStatus(driver);
      if (status !== 'Green') {
        return false;
      }
    }

    return true;
  });

  // Step 2: Calculate scores for each driver
  const scoredDrivers: MatchScore[] = eligibleDrivers.map(driver => {
    const breakdown = calculateMatchScore(driver, load);
    const score = getTotalScore(breakdown);

    return {
      driver,
      score,
      breakdown,
      rank: 0, // Will be set after sorting
      isBestMatch: false, // Will be set after sorting
    };
  });

  // Step 3: Sort by score (highest first)
  scoredDrivers.sort((a, b) => b.score - a.score);

  // Step 4: Assign ranks and mark best match
  scoredDrivers.forEach((match, index) => {
    match.rank = index + 1;
    match.isBestMatch = index === 0;
  });

  // Step 5: Limit results
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
): { load: Load; score: number; rank: number; isBestMatch: boolean }[] {
  const { maxResults = 10 } = options;

  // Only consider pending loads
  const pendingLoads = loads.filter(load => load.status === 'Pending');

  // Calculate scores
  const scoredLoads = pendingLoads.map(load => {
    const breakdown = calculateMatchScore(driver, load);
    const score = getTotalScore(breakdown);

    return {
      load,
      score,
      rank: 0,
      isBestMatch: false,
    };
  });

  // Sort by score
  scoredLoads.sort((a, b) => b.score - a.score);

  // Assign ranks
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
