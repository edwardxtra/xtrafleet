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
  vehicleType: "Dry Van" | "Reefer" | "Flatbed";
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
};

export type Load = {
  id: string;
  origin: string;
  destination: string;
  cargo: string;
  weight: number;
  status: "Pending" | "Matched" | "In-transit" | "Delivered";
  requiredQualifications: string[];
  description?: string;
  ownerId?: string;
  price?: number;
  pickupDate?: string;
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
  };
  trip: {
    origin: string;
    destination: string;
    cargo: string;
    weight: number;
    startDate: string;
    endDate?: string;
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
