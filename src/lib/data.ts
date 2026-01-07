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
  
  // CDL
  cdlLicense?: string;
  cdlExpiry?: string;
  cdlLicenseUrl?: string;
  cdlDocumentUrl?: string;
  
  // Medical Card
  medicalCardExpiry?: string;
  medicalCardUrl?: string;
  
  // Insurance
  insuranceExpiry?: string;
  insuranceUrl?: string;
  
  // MVR
  motorVehicleRecordNumber?: string;
  mvrUrl?: string;
  
  // Background Check
  backgroundCheckDate?: string;
  backgroundCheckUrl?: string;
  
  // Pre-Employment Screening
  preEmploymentScreeningDate?: string;
  preEmploymentScreeningUrl?: string;
  
  // Drug & Alcohol Screening
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

// Match Types
export type MatchStatus = 
  | 'pending'      // Waiting for driver owner response
  | 'accepted'     // Driver owner accepted
  | 'countered'    // Driver owner proposed changes
  | 'declined'     // Driver owner declined
  | 'expired'      // No response within time limit
  | 'cancelled'    // Load owner cancelled
  | 'tla_pending'  // Accepted, waiting for TLA signatures
  | 'tla_signed'   // TLA signed by both parties
  | 'in_progress'  // Trip in progress
  | 'completed';   // Trip completed

export type Match = {
  id: string;
  
  // Load info
  loadId: string;
  loadOwnerId: string;
  loadOwnerName?: string;
  
  // Driver info
  driverId: string;
  driverOwnerId: string;
  driverName?: string;
  driverOwnerName?: string;
  
  // Match details
  status: MatchStatus;
  matchScore: number;
  
  // Terms
  originalTerms: {
    rate: number;
    pickupDate?: string;
    deliveryDate?: string;
    notes?: string;
  };
  
  // Counter terms (if driver owner proposes changes)
  counterTerms?: {
    rate: number;
    pickupDate?: string;
    deliveryDate?: string;
    notes?: string;
  };
  
  // Response
  declineReason?: string;
  
  // Timestamps
  createdAt: string;
  respondedAt?: string;
  expiresAt: string;
  
  // Load snapshot (for reference)
  loadSnapshot: {
    origin: string;
    destination: string;
    cargo: string;
    weight: number;
    price?: number;
  };
  
  // Driver snapshot (for reference)
  driverSnapshot: {
    name: string;
    location: string;
    vehicleType: string;
    rating?: number;
  };
  
  // TLA reference (added when TLA is generated)
  tlaId?: string;
};

// Owner Operator type (for TLA party info)
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
};

// TLA (Trip Lease Agreement) Types
export type TLASignature = {
  signedBy: string;        // User ID
  signedByName: string;    // Name at time of signing
  signedByRole: 'lessor' | 'lessee';
  signedAt: string;        // ISO timestamp
  ipAddress?: string;
};

export type InsuranceOption = 
  | 'existing_policy'      // Lessee confirms existing policy covers leased drivers
  | 'trip_coverage';       // Lessee elects third-party trip coverage

  export type TLA = {
    id: string;
    matchId: string;
    
    // Lessor (Fleet A - Provider of Driver)
    lessor: {
      ownerOperatorId: string;
      legalName: string;
      address: string;
      dotNumber?: string;
      mcNumber?: string;
      contactEmail: string;
      phone?: string;
    };
    
    // Lessee (Fleet B - Hiring Carrier)
    lessee: {
      ownerOperatorId: string;
      legalName: string;
      address: string;
      dotNumber?: string;
      mcNumber?: string;
      contactEmail: string;
      phone?: string;
    };
    
    // Driver Info
    driver: {
      id: string;
      name: string;
      cdlNumber?: string;
      cdlState?: string;
      medicalCardExpiry?: string;
    };
    
    // Trip Details
    trip: {
      origin: string;
      destination: string;
      cargo: string;
      weight: number;
      startDate: string;
      endDate?: string;
    };
    
    // Payment Terms
    payment: {
      amount: number;
      dueDate?: string;
    };
    
    // Insurance Selection (by Lessee)
    insurance: {
      option?: InsuranceOption;
      confirmedAt?: string;
      confirmedBy?: string;
    };
    
    // Signatures
    lessorSignature?: TLASignature;
    lesseeSignature?: TLASignature;
    
    // Status - Added 'in_progress' and 'completed'
    status: 'draft' | 'pending_lessor' | 'pending_lessee' | 'signed' | 'in_progress' | 'completed' | 'voided';
    
    // Trip Tracking - NEW
    tripTracking?: {
      startedAt?: string;
      startedBy?: string;
      startedByName?: string;
      endedAt?: string;
      endedBy?: string;
      endedByName?: string;
      durationMinutes?: number;
    };
    
    // Timestamps
    createdAt: string;
    updatedAt?: string;
    signedAt?: string;
    voidedAt?: string;
    voidedReason?: string;
    
    // Document version for audit trail
    version: number;
  };