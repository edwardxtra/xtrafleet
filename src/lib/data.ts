import type { TrailerType } from './trailer-types';

export type Review = {
  id: string;
  reviewer: string;
  date: string;
  rating: number;
  comment: string;
};

export type Driver = {
  id: string;
  name: string;
  email?: string;
  location: string;
  certifications: string[];
  availability: "Available" | "On-trip" | "Off-duty";
  vehicleType: "Dry Van" | "Reefer" | "Flatbed"; // Legacy - single type
  vehicleTypes?: string[]; // New - array of types driver can haul
  trailerTypes?: TrailerType[]; // New - array of types driver can haul
  profileSummary?: string;
  ownerId?: string;
  isActive?: boolean;
  isSelfDriver?: boolean; // OO added themselves as a driver — no separate Auth account
  // CDL
  cdlLicense?: string;
  cdlState?: string;
  cdlClass?: string;
  cdlExpiry?: string;
  cdlLicenseUrl?: string;
  cdlDocumentUrl?: string;
  endorsements?: string | string[];
  // Medical
  medicalCardExpiry?: string;
  medicalCardUrl?: string;
  // Insurance / COI — saved from driver-profile-completion.tsx
  insuranceExpiry?: string;
  insuranceUrl?: string;
  insurerName?: string;
  insurancePolicyNumber?: string;
  // MVR
  motorVehicleRecordNumber?: string;
  mvrUrl?: string;
  // Background & screenings
  backgroundCheckDate?: string;
  backgroundCheckUrl?: string;
  preEmploymentScreeningDate?: string;
  preEmploymentScreeningUrl?: string;
  drugAndAlcoholScreeningDate?: string;
  drugAndAlcoholScreeningUrl?: string;
  // Compliance / profile status
  clearinghouseStatus?: string;
  authorizationConsent?: boolean;
  verificationConsent?: boolean;
  dqfStatus?: string;
  profileStatus?: string;
  profileComplete?: boolean;
  // Ratings
  rating?: number;
  reviews?: Review[];
  // Contact
  phoneNumber?: string;
  phone?: string;
};

export type Load = {
  id: string;
  origin: string;
  destination: string;
  cargo: string;
  weight: number;
  status: "Pending" | "Matched" | "In-transit" | "Delivered";
  requiredQualifications: string[];
  trailerType?: TrailerType; // New - standardized trailer type
  description?: string;
  ownerId?: string;
  price?: number;
  pickupDate?: string;
  route?: {
    distanceText?: string;
    durationText?: string;
  };
};

export type BillingHistoryItem = {
  id: string;
  date: string;
  description: string;
  amount: number;
};

export type MatchStatus = 
  | 'pending'
  | 'accepted'
  | 'countered'
  | 'declined'
  | 'expired'
  | 'cancelled'
  | 'tla_pending'
  | 'tla_signed'
  | 'in_progress'
  | 'completed';

export type Match = {
  id: string;
  loadId: string;
  loadOwnerId: string;
  loadOwnerName?: string;
  driverId: string;
  driverOwnerId: string;
  driverName?: string;
  driverOwnerName?: string;
  // Bidirectional matching fields
  initiatedBy: 'load_owner' | 'driver_owner';
  recipientOwnerId: string; // The owner who needs to respond
  status: MatchStatus;
  matchScore: number;
  originalTerms: {
    rate: number;
    pickupDate?: string;
    deliveryDate?: string;
    notes?: string;
  };
  counterTerms?: {
    rate: number;
    pickupDate?: string;
    deliveryDate?: string;
    notes?: string;
  };
  declineReason?: string;
  createdAt: string;
  respondedAt?: string;
  expiresAt: string;
  loadSnapshot: {
    origin: string;
    destination: string;
    cargo: string;
    weight: number;
    price?: number;
  };
  driverSnapshot: {
    name: string;
    location: string;
    vehicleType: string;
    rating?: number;
  };
  tlaId?: string;
};

export type OwnerOperator = {
  id: string;
  companyName?: string;
  legalName?: string;
  contactEmail: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  dotNumber?: string;
  mcNumber?: string;
  ein?: string;
  dba?: string;
  hqAddress?: string;
  loadLocation?: string;
  serviceRegions?: string;
  isAdmin?: boolean;
  createdAt?: string;
  profileCompletedAt?: string;
  clearinghouseCompletedAt?: string;
  // Certificate of Insurance (COI) - simplified to just document upload
  insurance?: {
    // Document URL for uploaded COI
    coiDocumentUrl?: string;
    coiDocumentUploadedAt?: string;
  };
};

export type TLASignature = {
  signedBy: string;
  signedByName: string;
  signedByRole: 'lessor' | 'lessee';
  signedAt: string;
  ipAddress?: string;
  userAgent?: string;
  consentToEsign?: boolean;
};

export type InsuranceOption = 'existing_policy' | 'trip_coverage';

export type TLA = {
  id: string;
  matchId: string;
  lessor: {
    ownerOperatorId: string;
    legalName: string;
    address: string;
    dotNumber?: string;
    mcNumber?: string;
    contactEmail: string;
    phone?: string;
  };
  lessee: {
    ownerOperatorId: string;
    legalName: string;
    address: string;
    dotNumber?: string;
    mcNumber?: string;
    contactEmail: string;
    phone?: string;
  };
  driver: {
    id: string;
    name: string;
    cdlNumber?: string;
    cdlState?: string;
    medicalCardExpiry?: string;
    endorsements?: string;
    clearinghouseStatus?: string;
  };
  trip: {
    origin: string;
    destination: string;
    cargo: string;
    weight: number;
    startDate: string;
    endDate?: string;
  };
  // Detailed location information (captured during lessee signing)
  locations?: {
    pickup?: {
      address: string;
      city: string;
      state: string;
      zip: string;
      instructions?: string;
      contactName?: string;
      contactPhone?: string;
    };
    delivery?: {
      address: string;
      city: string;
      state: string;
      zip: string;
      instructions?: string;
      contactName?: string;
      contactPhone?: string;
    };
    truckReturn?: {
      differentFromDelivery: boolean;
      address?: string;
      city?: string;
      state?: string;
      zip?: string;
      instructions?: string;
    };
  };
  payment: {
    amount: number;
    dueDate?: string;
  };
  insurance: {
    option?: InsuranceOption;
    confirmedAt?: string;
    confirmedBy?: string;
  };
  lessorSignature?: TLASignature;
  lesseeSignature?: TLASignature;
  status: 'draft' | 'pending_lessor' | 'pending_lessee' | 'signed' | 'in_progress' | 'completed' | 'voided';
  tripTracking?: {
    startedAt?: string;
    startedBy?: string;
    startedByName?: string;
    endedAt?: string;
    endedBy?: string;
    endedByName?: string;
    durationMinutes?: number;
  };
  createdAt: string;
  updatedAt?: string;
  signedAt?: string;
  voidedAt?: string;
  voidedReason?: string;
  version: number;
};
