## TLA Signing Order Fix

### Problem
The TLA page currently allows either party to sign first, causing confusion when lessee signs before lessor.

### Solution
Enforce that lessor (driver owner) MUST sign first, then lessee (load owner) can sign.

### Changes Made

1. **Updated `signingRole()` function** to enforce order:
   - `pending_lessor` status → Only lessor can sign
   - `pending_lessee` status → Only lessee can sign
   - Blocks lessee from signing when status is `pending_lessor`

2. **Added `getCannotSignReason()` helper** to show clear messages:
   - "The driver owner (lessor) must sign this agreement first." (for lessee)
   - "You have already signed. Waiting for the load owner (lessee) to sign." (for lessor)

3. **Display blocked sign message** in UI when user can't sign

### Implementation

Replace the `signingRole()` function (around line 137) with:

```typescript
// Signing role logic - ENFORCE ORDER: Lessor must sign first
const signingRole = (): 'lessor' | 'lessee' | null => {
  if (!tla || !user) return null;
  
  // Can't sign if already fully signed or voided
  if (tla.status === 'signed' || tla.status === 'voided' || tla.status === 'in_progress' || tla.status === 'completed') {
    return null;
  }
  
  // STEP 1: Lessor must sign first
  if (tla.status === 'pending_lessor' || tla.status === 'draft') {
    // Only lessor can sign at this stage
    if (isLessor && !tla.lessorSignature) {
      return 'lessor';
    }
    // Lessee cannot sign yet
    return null;
  }
  
  // STEP 2: After lessor signs, lessee can sign
  if (tla.status === 'pending_lessee') {
    // Only lessee can sign at this stage
    if (isLessee && !tla.lesseeSignature) {
      return 'lessee';
    }
    // Lessor already signed
    return null;
  }
  
  return null;
};

// Helper to show why user can't sign
const getCannotSignReason = (): string | null => {
  if (!tla || !user) return null;
  
  // Lessee trying to sign before lessor
  if ((tla.status === 'pending_lessor' || tla.status === 'draft') && isLessee && !tla.lessorSignature) {
    return 'The driver owner (lessor) must sign this agreement first.';
  }
  
  // Lessor trying to sign after already signing
  if (tla.status === 'pending_lessee' && isLessor && tla.lessorSignature) {
    return 'You have already signed. Waiting for the load owner (lessee) to sign.';
  }
  
  return null;
};
```

Add this alert BEFORE the "Sign Form" card (around line 1088):

```tsx
{/* Cannot Sign Message */}
{!canSign() && getCannotSignReason() && isInvolved && (\n  <Alert>\n    <AlertCircle className="h-4 w-4" />\n    <AlertDescription>\n      {getCannotSignReason()}\n    </AlertDescription>\n  </Alert>\n)}
```

### Testing
1. Create new TLA
2. Try to sign as lessee first → Should see "driver owner must sign first" message
3. Sign as lessor → Should work
4. Sign as lessee → Should work
5. Status should progress: pending_lessor → pending_lessee → signed
