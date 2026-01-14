# XtraFleet Schema Migration Documentation

**Version:** 1.0  
**Last Updated:** January 14, 2026  
**Status:** Current schema documented, future migrations planned

---

## Table of Contents

1. [Current Firestore Schema](#current-firestore-schema)
2. [Future Compliance-Focused Schema](#future-compliance-focused-schema)
3. [Migration Mapping](#migration-mapping)
4. [Breaking Changes](#breaking-changes)
5. [Migration Timeline](#migration-timeline)
6. [Rollback Procedures](#rollback-procedures)

---

## Current Firestore Schema

### Overview
XtraFleet currently uses a document-based NoSQL structure in Firebase Firestore with the following top-level collections:

```
/users
/owner_operators
  /{ownerId}/drivers
  /{ownerId}/loads
  /{ownerId}/subscriptions
/matches
/tlas
/conversations
  /{conversationId}/messages
/notifications
/audit_logs
/driver_invitations
```

---

### Collection: `users`

**Purpose:** User authentication and role management

**Schema:**
```typescript
interface User {
  uid: string;                    // Firebase Auth UID
  email: string;                  // User email
  role: 'owner_operator' | 'driver' | 'admin';
  ownerId?: string;               // For drivers - which owner they belong to
  createdAt: string;              // ISO timestamp
  updatedAt: string;              // ISO timestamp
}
```

**Indexes:**
- Single field: `email`
- Single field: `role`

**Security Rules:**
```javascript
allow get: if isSignedIn() && isOwner(userId);
allow create: if isSignedIn() && isOwner(userId);
allow update: if isSignedIn() && isOwner(userId);
```

---

### Collection: `owner_operators`

**Purpose:** Owner-operator company profiles

**Schema:**
```typescript
interface OwnerOperator {
  id: string;
  companyName: string;
  legalName?: string;
  dotNumber?: string;
  mcNumber?: string;
  address?: string;
  phone?: string;
  email: string;
  taxId?: string;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  insuranceExpiry?: string;
  createdAt: string;
  updatedAt: string;
}
```

**Subcollections:**
- `drivers/` - Nested driver documents
- `loads/` - Nested load documents
- `subscriptions/` - Stripe subscription data

**Indexes:**
- Single field: `email`
- Single field: `dotNumber`

---

### Subcollection: `owner_operators/{ownerId}/drivers`

**Purpose:** Driver profiles and compliance documents

**Schema:**
```typescript
interface Driver {
  id: string;                           // Matches Firebase Auth UID
  name: string;
  email: string;
  phone?: string;
  location: string;                     // City, State
  vehicleType: string;                  // Dry Van, Flatbed, Reefer, etc.
  availability: 'Available' | 'On Assignment' | 'Unavailable';
  
  // Compliance fields
  cdlLicense?: string;                  // CDL number
  cdlState?: string;                    // Issuing state
  cdlExpiry?: string;                   // ISO date
  cdlLicenseUrl?: string;               // Firebase Storage URL
  cdlDocumentUrl?: string;              // Firebase Storage URL
  
  medicalCardExpiry?: string;           // ISO date
  medicalCardUrl?: string;              // Firebase Storage URL
  
  insuranceExpiry?: string;             // ISO date
  insuranceUrl?: string;                // Firebase Storage URL
  
  motorVehicleRecordNumber?: string;    // MVR number
  mvrUrl?: string;                      // Firebase Storage URL
  
  backgroundCheckDate?: string;         // ISO date (completed date)
  backgroundCheckUrl?: string;          // Firebase Storage URL
  
  preEmploymentScreeningDate?: string;  // ISO date
  preEmploymentScreeningUrl?: string;   // Firebase Storage URL
  
  drugAndAlcoholScreeningDate?: string; // ISO date
  drugAndAlcoholScreeningUrl?: string;  // Firebase Storage URL
  
  createdAt: string;
  updatedAt: string;
}
```

**Indexes:**
- Composite: `availability` + `createdAt` (DESC)

**Security Rules:**
```javascript
allow read: if isSignedIn();
allow update: if isSignedIn() && (isOwner(ownerOperatorId) || request.auth.uid == driverId);
```

---

### Subcollection: `owner_operators/{ownerId}/loads`

**Purpose:** Load/freight job postings

**Schema:**
```typescript
interface Load {
  id: string;
  origin: string;                  // City, State or ZIP
  destination: string;             // City, State or ZIP
  pickupDate: string;              // ISO date
  deliveryDate?: string;           // ISO date
  distance: number;                // Miles
  rate: number;                    // USD
  cargo: string;                   // Description
  weight: number;                  // Pounds
  status: 'Pending' | 'Matched' | 'In Transit' | 'Delivered' | 'Cancelled';
  requirements?: string;           // Special requirements
  createdAt: string;
  updatedAt: string;
}
```

**Indexes:**
- Composite: `status` + `createdAt` (DESC)
- Single field: `pickupDate`

**Security Rules:**
```javascript
allow read: if isSignedIn();
allow write: if isSignedIn(); // Permissive for match acceptance
```

---

### Collection: `matches`

**Purpose:** Driver-Load matching and negotiation

**Schema:**
```typescript
interface Match {
  id: string;
  
  // References
  loadId: string;
  loadOwnerId: string;              // Owner who posted the load
  driverId: string;
  driverOwnerId: string;            // Owner who owns the driver
  
  // Snapshots (denormalized for performance)
  loadSnapshot: {
    origin: string;
    destination: string;
    pickupDate: string;
    cargo: string;
    weight: number;
  };
  driverSnapshot: {
    name: string;
    email: string;
    vehicleType: string;
  };
  
  // Match details
  status: 'pending' | 'accepted' | 'declined' | 'countered' | 
          'tla_pending' | 'tla_signed' | 'in_progress' | 'completed';
  originalTerms: {
    rate: number;
    pickupDate: string;
    deliveryDate?: string;
  };
  counterTerms?: {
    rate: number;
    pickupDate: string;
    deliveryDate?: string;
    message?: string;
  };
  
  // TLA reference
  tlaId?: string;                   // Links to /tlas collection
  
  // Metadata
  matchScore?: number;              // Algorithmic match score (0-100)
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  declinedAt?: string;
}
```

**Indexes:**
- Composite: `loadOwnerId` + `createdAt` (DESC)
- Composite: `driverOwnerId` + `createdAt` (DESC)
- Composite: `driverId` + `createdAt` (DESC)
- Single field: `status`

**Security Rules:**
```javascript
// ⚠️ CURRENT - TOO PERMISSIVE (needs fixing in Phase 3)
allow update: if isSignedIn();
allow delete: if isSignedIn();
```

---

### Collection: `tlas`

**Purpose:** Trip Lease Agreements (FMCSA-compliant contracts)

**Schema:**
```typescript
interface TLA {
  id: string;
  
  // Match reference
  matchId: string;
  
  // Parties
  lessor: {                         // Driver owner (provides driver)
    legalName: string;
    address?: string;
    dotNumber?: string;
    mcNumber?: string;
    email: string;
  };
  lessee: {                         // Load owner (hiring)
    legalName: string;
    address?: string;
    dotNumber?: string;
    mcNumber?: string;
    email: string;
  };
  driver: {
    name: string;
    cdlNumber?: string;
    cdlState?: string;
    medicalCardExpiry?: string;
  };
  
  // Trip details
  trip: {
    origin: string;
    destination: string;
    startDate: string;              // ISO timestamp
    cargo?: string;
    weight?: number;
  };
  
  // Payment
  payment: {
    amount: number;                 // USD
    terms: string;
  };
  
  // Insurance
  insurance?: {
    option: 'existing_policy' | 'trip_coverage';
    details?: string;
  };
  
  // Signatures
  lessorSignature?: {
    signedByName: string;
    signedById: string;
    signedAt: string;
    ipAddress?: string;
  };
  lesseeSignature?: {
    signedByName: string;
    signedById: string;
    signedAt: string;
    ipAddress?: string;
  };
  
  // Trip tracking
  tripTracking?: {
    startedAt?: string;
    startedById?: string;
    startedByName?: string;
    endedAt?: string;
    endedById?: string;
    endedByName?: string;
    durationMinutes?: number;
  };
  
  // Status
  status: 'pending' | 'signed' | 'in_progress' | 'completed' | 'cancelled';
  
  // PDF
  pdfUrl?: string;                  // Firebase Storage URL
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
```

**Indexes:**
- Single field: `matchId`
- Single field: `status`
- Single field: `createdAt`

---

### Collection: `conversations`

**Purpose:** Messaging between users

**Schema:**
```typescript
interface Conversation {
  id: string;
  participants: string[];           // Array of user IDs
  participantNames: {               // Map for display
    [userId: string]: string;
  };
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: {                    // Per-user unread count
    [userId: string]: number;
  };
  createdAt: string;
  updatedAt: string;
}
```

**Subcollection Schema:**
```typescript
// /conversations/{conversationId}/messages
interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  read: boolean;
  createdAt: string;
}
```

**Indexes:**
- Array contains: `participants`
- Single field: `lastMessageAt` (DESC)

---

### Collection: `notifications`

**Purpose:** In-app notifications for users

**Schema:**
```typescript
interface Notification {
  id: string;
  userId: string;                   // Recipient
  type: 'match_accepted' | 'tla_ready' | 'message_received';
  title: string;
  message: string;
  link?: string;                    // Navigation link
  linkText?: string;                // CTA text
  read: boolean;
  readAt?: string;
  createdAt: string;
}
```

**Indexes:**
- Composite: `userId` + `read`
- Single field: `createdAt` (DESC)

---

### Collection: `audit_logs`

**Purpose:** Compliance and security audit trail

**Schema:**
```typescript
interface AuditLog {
  id: string;
  userId: string;
  action: string;                   // e.g., 'driver_created', 'tla_signed'
  entityType: string;               // e.g., 'driver', 'load', 'tla'
  entityId: string;
  changes?: any;                    // Before/after snapshot
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}
```

**Indexes:**
- Composite: `userId` + `timestamp` (DESC)
- Composite: `entityType` + `entityId`

---

## Future Compliance-Focused Schema

### Vision
Migrate to a hybrid architecture:
- **Firestore:** Real-time features (messaging, notifications, live updates)
- **PostgreSQL/MySQL:** Compliance data (drivers, documents, audit logs)
- **Reason:** FMCSA requires 3+ years of record retention with queryability

### Future PostgreSQL Tables

```sql
-- Core entities
CREATE TABLE owner_operators (
  id UUID PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255),
  dot_number VARCHAR(50) UNIQUE,
  mc_number VARCHAR(50),
  -- ... additional fields
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE TABLE drivers (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES owner_operators(id),
  firebase_uid VARCHAR(128) UNIQUE, -- Links to Firebase Auth
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  -- ... additional fields
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE TABLE driver_documents (
  id UUID PRIMARY KEY,
  driver_id UUID REFERENCES drivers(id),
  document_type VARCHAR(50) NOT NULL, -- 'cdl', 'medical_card', etc.
  document_number VARCHAR(100),
  issue_date DATE,
  expiry_date DATE,
  file_url TEXT,
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'expired', 'revoked'
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE TABLE compliance_alerts (
  id UUID PRIMARY KEY,
  driver_id UUID REFERENCES drivers(id),
  document_type VARCHAR(50),
  alert_type VARCHAR(50), -- 'expiring_soon', 'expired', 'missing'
  alert_date DATE NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL
);

-- Audit trail (immutable)
CREATE TABLE audit_trail (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  changes JSONB, -- Before/after state
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_user_date ON audit_trail(user_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_trail(entity_type, entity_id);
```

---

## Migration Mapping

### Phase 1: Add Fields (Non-Breaking) ✅ SAFE

**Can be added to existing Firestore documents without breaking anything:**

| Current Location | New Field | Type | Purpose |
|-----------------|-----------|------|---------|
| `drivers` | `driverLicenseState` | string | State that issued CDL |
| `drivers` | `endorsements` | string[] | CDL endorsements (H, N, T, etc.) |
| `drivers` | `restrictions` | string[] | CDL restrictions |
| `drivers` | `complianceScore` | number | Calculated compliance score (0-100) |
| `drivers` | `lastComplianceCheck` | string | ISO timestamp |
| `owner_operators` | `fmcsaRating` | string | DOT safety rating |
| `owner_operators` | `lastAuditDate` | string | ISO date |
| `tlas` | `fmcsaCompliant` | boolean | Meets FMCSA requirements |
| `tlas` | `complianceVersion` | string | Version of compliance rules used |

**Migration Script:**
```javascript
// migrations/001_add_compliance_fields.js
async function addComplianceFields() {
  const drivers = await db.collectionGroup('drivers').get();
  
  const batch = db.batch();
  drivers.docs.forEach(doc => {
    batch.update(doc.ref, {
      complianceScore: 0,
      lastComplianceCheck: new Date().toISOString(),
      // Existing data preserved
    });
  });
  
  await batch.commit();
  console.log(`Updated ${drivers.size} drivers`);
}
```

---

### Phase 2: Restructure Documents (Breaking) ⚠️ CAREFUL

**Changes that require data migration:**

#### 2.1: Split Document URLs into Separate Subcollection

**Current:**
```typescript
// In driver document
{
  cdlLicenseUrl: "https://...",
  medicalCardUrl: "https://...",
  insuranceUrl: "https://..."
}
```

**Future:**
```typescript
// Main driver document (lighter)
{
  id: "driver123",
  name: "John Doe",
  // ... basic fields only
}

// Subcollection: drivers/{id}/documents
{
  id: "doc1",
  type: "cdl_license",
  fileUrl: "https://...",
  expiryDate: "2025-12-31",
  status: "active"
}
```

**Migration Path:**
1. Create new subcollection structure
2. Copy URLs to new documents
3. Keep old fields for 30 days (backwards compatibility)
4. Deploy code that reads from both locations
5. After 30 days, remove old fields

**Breaking Change Risk:** HIGH  
**Rollback:** Keep old structure for 30 days

---

#### 2.2: Normalize Owner Operator Data

**Current:**
```typescript
// Duplicated in multiple places
match.driverSnapshot = {
  name: "John Doe",
  email: "john@example.com"
}
```

**Future:**
```typescript
// Just store IDs, fetch on demand or cache
match.driverId = "driver123"
// Fetch driver details when needed
```

**Migration Path:**
1. Add driverId field to all matches
2. Keep snapshot for 60 days
3. Update UI to fetch from drivers collection
4. Remove snapshots after verification

**Breaking Change Risk:** MEDIUM  
**Benefit:** Data consistency, easier updates

---

### Phase 3: Move to Hybrid Architecture ⚠️ MAJOR MIGRATION

**Timeline:** 6-12 months from now

**Strategy:**
1. Set up PostgreSQL database
2. Create sync service (Firestore → PostgreSQL)
3. Dual-write period (write to both)
4. Gradually migrate reads to PostgreSQL
5. Keep Firestore for real-time features only

**Collections to Migrate to PostgreSQL:**
- ✅ `drivers` → Better querying, compliance reports
- ✅ `owner_operators` → Relational integrity
- ✅ `audit_logs` → Long-term retention, queryability
- ❌ `messages` → Keep in Firestore (real-time)
- ❌ `notifications` → Keep in Firestore (real-time)

---

## Breaking Changes

### High Risk Changes (Require Careful Migration)

1. **Changing Match Status Values**
   - **Current:** `'pending' | 'accepted' | 'declined'...`
   - **Future:** Add new statuses like `'archived'`, `'expired'`
   - **Risk:** Old code won't recognize new statuses
   - **Migration:** Add new statuses, update all switch statements

2. **Removing Denormalized Snapshots**
   - **Current:** `match.loadSnapshot`, `match.driverSnapshot`
   - **Future:** Fetch real-time from source
   - **Risk:** Queries become slower
   - **Migration:** Gradual rollout with caching

3. **Changing Collection Structure**
   - **Current:** Nested `owner_operators/{id}/drivers`
   - **Future:** Top-level `drivers` with `ownerId` field
   - **Risk:** Queries break, security rules change
   - **Migration:** Complex - requires full rewrite

---

### Low Risk Changes (Safe Additions)

1. **Adding Optional Fields**
   - Just add to TypeScript interface
   - Firestore allows missing fields
   - No migration needed

2. **Adding Indexes**
   - Firebase Console → Create index
   - No data migration required
   - Zero downtime

3. **Adding Security Rules**
   - Can be tightened incrementally
   - Test in emulator first

---

## Migration Timeline

### Q1 2026 (Current) ✅
- ✅ Phase 1 optimizations deployed
- ✅ Query pagination implemented
- [ ] Add compliance score fields
- [ ] Add document expiry alerts

### Q2 2026
- [ ] Phase 2 optimizations (caching)
- [ ] Restructure document URLs → subcollection
- [ ] Security rules hardening
- [ ] Set up PostgreSQL for testing

### Q3 2026
- [ ] Dual-write implementation (Firestore + PostgreSQL)
- [ ] Migrate audit_logs to PostgreSQL
- [ ] Migrate drivers to PostgreSQL
- [ ] Keep Firestore for real-time features

### Q4 2026
- [ ] Full hybrid architecture live
- [ ] Deprecate old Firestore paths
- [ ] Complete compliance documentation
- [ ] FMCSA audit-ready

---

## Rollback Procedures

### For Field Additions
```javascript
// Easy rollback - just stop using the field
// No data loss, old code still works
```

### For Structure Changes
```javascript
// Keep both old and new structures for 30 days
async function rollbackDocumentRestructure() {
  // 1. Stop writing to new structure
  // 2. Continue reading from old structure
  // 3. Delete new subcollection after verification
  // 4. No data loss - old structure intact
}
```

### For PostgreSQL Migration
```javascript
// Dual-write ensures data in both places
async function rollbackToFirestore() {
  // 1. Stop reading from PostgreSQL
  // 2. Continue reading from Firestore
  // 3. Firestore has all data (dual-write)
  // 4. Zero data loss
}
```

---

## Best Practices

### Before Any Schema Change:

1. ✅ **Document the change** in this file
2. ✅ **Test in local emulator** first
3. ✅ **Deploy to staging** environment
4. ✅ **Run for 24-48 hours** in staging
5. ✅ **Create rollback script** before deploying
6. ✅ **Deploy during low-traffic** hours
7. ✅ **Monitor error logs** for 24 hours

### Migration Checklist:

- [ ] Schema change documented
- [ ] Breaking changes identified
- [ ] Migration script written
- [ ] Rollback procedure documented
- [ ] Tested in emulator
- [ ] Tested in staging
- [ ] Team reviewed
- [ ] Deployed to production
- [ ] Monitored for 48 hours
- [ ] Old structure deprecated (if applicable)

---

## Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-01-14 | 1.0 | Initial documentation of current schema | Jose |

---

## References

- [Firebase Firestore Documentation](https://firebase.google.com/docs/firestore)
- [FMCSA Compliance Requirements](https://www.fmcsa.dot.gov/)
- [XtraFleet Compliance Blueprint](./blueprint.md)

---

**IMPORTANT:** This document should be updated with every schema change. Review before major releases.
