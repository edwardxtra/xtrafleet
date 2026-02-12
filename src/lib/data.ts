import type { TrailerType } from './trailer-types';
import type { LoadType, CDLClass, LoadEndorsement, LoadStatus } from './load-types';

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
  trailerTypes?: TrailerType[]; // New - array of types driver can haul
  profileSummary?: string;
  ownerId?: string;
  isActive?: boolean;
  cdlLicense?: string;
  cdlExpiry?: string;
  cdlLicenseUrl?: string;
  cdlDocumentUrl?: string;
  medicalCardExpiry?: string;
  medicalCardUrl?: string;
  insuranceExpiry?: string;
  insuranceUrl?: string;
  motorVehicleRecordNumber?: string;
  mvrUrl?: string;
  backgroundCheckDate?: string;
  backgroundCheckUrl?: string;
  preEmploymentScreeningDate?: string;
  preEmploymentScreeningUrl?: string;
  drugAndAlcoholScreeningDate?: string;
  drugAndAlcoholScreeningUrl?: string;
  rating?: number;
  reviews?: Review[];
  driverType?: 'existing' | 'newHire';
  dqfStatus?: 'not_required' | 'pending' | 'submitted' | 'approved' | 'rejected';
  dqfSubmittedAt?: string | null;
  dqfApprovedAt?: string | null;
  dqfApprovedBy?: string | null;
};

export type RouteInfo = {
  distanceMiles: number;
  distanceText: string;
  durationSeconds: number;
  durationText: string;
  calculatedAt: string;
};

export type Load = {
  id: string;
  origin: string;
  destination: string;
  loadType: string; // Standardized load type from LOAD_TYPES dropdown
  cargo?: string; // Legacy free-text cargo field (kept for backward compatibility)
  status: LoadStatus;
  driverCompensation: number; // Replaces 'price'
  price?: number; // Legacy field (kept for backward compatibility)
  pickupDate: string;
  estimatedDeliveryDate?: string;
  trailerType?: TrailerType;
  cdlClassRequired: string[]; // Required CDL classes (A, B, C)
  endorsementsRequired?: string[]; // Optional endorsement requirements (H, N, T)
  additionalDetails?: string;
  requiredQualifications?: string[]; // Legacy field
  description?: string;
  ownerOperatorId?: string;
  ownerId?: string; // Legacy alias
  route?: RouteInfo;
  // Consent tracking
  verificationConsent?: {
    accepted: boolean;
    timestamp: string;
    version: string;
    text: string;
  };
  createdAt?: string;
  updatedAt?: string;
  cancelledAt?: string;
  cancelledReason?: string;
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
  initiatedBy: 'load_owner' | 'driver_owner';
  recipientOwnerId: string;
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
  isAdmin?: boolean;
  createdAt?: string;
  insurance?: {
    liabilityCarrier?: string;
    liabilityPolicyNumber?: string;
    liabilityExpiry?: string;
    liabilityCoverageAmount?: number;
    cargoCarrier?: string;
    cargoPolicyNumber?: string;
    cargoExpiry?: string;
    cargoCoverageAmount?: number;
    autoCarrier?: string;
    autoPolicyNumber?: string;
    autoExpiry?: string;
    workersCompCarrier?: string;
    workersCompPolicyNumber?: string;
    workersCompExpiry?: string;
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
};

export type InsuranceOption = 'existing_policy' | 'trip_coverage';

export type TLA = {
  id: string;
  matchId: string;
  lessor: {
    ownerOperatorId: string;
    legalName: string;
    address?: string;
    dotNumber?: string;
    mcNumber?: string;
    contactEmail: string;
    phone?: string;
  };
  lessee: {
    ownerOperatorId: string;
    legalName: string;
    address?: string;
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
  };
  trip: {
    origin: string;
    destination: string;
    cargo: string;
    weight: number;
    startDate: string;
    endDate?: string;
  };
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
