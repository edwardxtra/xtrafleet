import type { Driver } from "@/lib/data";
import { isAfter, parseISO, differenceInDays } from "date-fns";

export type ComplianceStatus = "Green" | "Yellow" | "Red";

const EXPIRY_WARNING_DAYS = 30; // Days before expiry to show yellow warning
const SCREENING_VALIDITY_YEARS = 1; // How long screenings are valid

export const getComplianceStatus = (driver: Driver): ComplianceStatus => {
  const { 
    cdlLicense,
    cdlExpiry, 
    medicalCardExpiry, 
    insuranceExpiry,
    motorVehicleRecordNumber,
    backgroundCheckDate,
    preEmploymentScreeningDate,
    drugAndAlcoholScreeningDate
  } = driver;

  const now = new Date();
  
  // Required fields that must exist
  const requiredFields = [
    cdlLicense,
    cdlExpiry,
    medicalCardExpiry,
    insuranceExpiry,
    motorVehicleRecordNumber,
    backgroundCheckDate,
    preEmploymentScreeningDate,
    drugAndAlcoholScreeningDate
  ];

  // If any required field is missing = RED
  if (requiredFields.some(field => !field)) {
    return "Red";
  }

  // Check expiring documents (CDL, Medical, Insurance)
  const expiryDates = [
    { date: cdlExpiry, name: 'CDL' },
    { date: medicalCardExpiry, name: 'Medical Card' },
    { date: insuranceExpiry, name: 'Insurance' }
  ];

  for (const doc of expiryDates) {
    if (!doc.date) continue;
    
    const expiryDate = parseISO(doc.date);
    const daysUntilExpiry = differenceInDays(expiryDate, now);

    // Already expired = RED
    if (daysUntilExpiry < 0) {
      return "Red";
    }

    // Expiring within warning period = YELLOW
    if (daysUntilExpiry <= EXPIRY_WARNING_DAYS) {
      return "Yellow";
    }
  }

  // Check time-sensitive screenings (Background, Drug test)
  const screeningDates = [
    { date: backgroundCheckDate, name: 'Background Check' },
    { date: drugAndAlcoholScreeningDate, name: 'Drug Screen' }
  ];

  for (const screening of screeningDates) {
    if (!screening.date) continue;
    
    const screeningDate = parseISO(screening.date);
    const oneYearFromScreening = new Date(screeningDate);
    oneYearFromScreening.setFullYear(oneYearFromScreening.getFullYear() + SCREENING_VALIDITY_YEARS);
    
    const daysUntilExpiry = differenceInDays(oneYearFromScreening, now);

    // Screening expired = RED
    if (daysUntilExpiry < 0) {
      return "Red";
    }

    // Screening expiring soon = YELLOW
    if (daysUntilExpiry <= EXPIRY_WARNING_DAYS) {
      return "Yellow";
    }
  }

  // Pre-employment screening is one-time, doesn't expire
  // (already checked for existence above)

  // All checks passed = GREEN
  return "Green";
};

// NEW FUNCTION for driver dashboard
export interface ComplianceItem {
  label: string;
  value?: string;
  type: 'expiry' | 'field' | 'screening';
}

export const getComplianceStatusFromItems = (items: ComplianceItem[]): ComplianceStatus => {
  const now = new Date();
  let hasYellow = false;

  for (const item of items) {
    // Missing required field = RED
    if (!item.value) {
      return "Red";
    }

    // Check expiry dates
    if (item.type === 'expiry') {
      try {
        const expiryDate = parseISO(item.value);
        const daysUntilExpiry = differenceInDays(expiryDate, now);

        if (daysUntilExpiry < 0) {
          return "Red"; // Already expired
        }
        if (daysUntilExpiry <= EXPIRY_WARNING_DAYS) {
          hasYellow = true; // Expiring soon
        }
      } catch {
        return "Red"; // Invalid date
      }
    }

    // Check screenings (valid for 1 year)
    if (item.type === 'screening') {
      try {
        const screeningDate = parseISO(item.value);
        const oneYearFromScreening = new Date(screeningDate);
        oneYearFromScreening.setFullYear(oneYearFromScreening.getFullYear() + SCREENING_VALIDITY_YEARS);
        
        const daysUntilExpiry = differenceInDays(oneYearFromScreening, now);

        if (daysUntilExpiry < 0) {
          return "Red"; // Screening expired
        }
        if (daysUntilExpiry <= EXPIRY_WARNING_DAYS) {
          hasYellow = true; // Screening expiring soon
        }
      } catch {
        return "Red"; // Invalid date
      }
    }

    // 'field' type items just need to exist (already checked above)
  }

  return hasYellow ? "Yellow" : "Green";
};