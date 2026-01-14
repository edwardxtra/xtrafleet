# 🔴 CRITICAL: Firebase Client-Side Error Fix

## **The Problem**
Error: "The default Firebase app does not exist. Make sure you call initializeApp() before using any of the Firebase services."

This occurs on TLA pages when trying to process payments. The error happens on the **client-side**, not server-side.

## **Root Cause**
The TLA page or payment component is trying to use Firebase directly without properly importing from the Firebase context provider.

## **The Fix**

### **Step 1: Always Use Firebase Hooks**
Instead of importing Firebase directly, ALWAYS use the hooks:

```tsx
// ❌ WRONG - Don't do this
import { getFirestore } from 'firebase/firestore';
const db = getFirestore();

// ✅ CORRECT - Use hooks
import { useFirestore } from '@/firebase';
const db = useFirestore();
```

### **Step 2: Check TLA Pages**
Look for these files and ensure they use hooks:
- `src/app/dashboard/tla/[id]/page.tsx`
- Any payment components
- Any TLA-related components

### **Step 3: Required Pattern**
```tsx
'use client';

import { useFirestore, useUser } from '@/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

export default function TLAPage() {
  const db = useFirestore();  // ✅ Use hook
  const { user } = useUser(); // ✅ Use hook
  
  const handlePayment = async () => {
    if (!db || !user) return; // ✅ Check they exist
    
    // Now use db safely
    await updateDoc(doc(db, 'matches', matchId), {
      status: 'paid'
    });
  };
  
  return (
    // Component JSX
  );
}
```

## **Auto-Redirect After TLA Signing**

When the load owner signs the TLA (they're the second to sign), auto-redirect to payment:

```tsx
const handleSign = async () => {
  // Sign the TLA
  await signTLA();
  
  // Check if user is load owner (second signer)
  if (user.uid === tla.loadOwnerId) {
    // Redirect to payment immediately
    router.push(`/dashboard/tla/${tlaId}/payment`);
  }
};
```

## **Files That Need Checking**

1. **TLA Detail Page**: `src/app/dashboard/tla/[id]/page.tsx`
   - Ensure uses `useFirestore()` hook
   - Add auto-redirect after owner signs

2. **Payment Page**: `src/app/dashboard/tla/[id]/payment/page.tsx` (if exists)
   - Ensure uses `useFirestore()` hook
   - Ensure uses `useUser()` hook

3. **Any TLA Components**: Check for direct Firebase imports

## **Testing After Fix**

1. Create a match
2. Both parties sign TLA
3. Load owner signs (second signature)
4. Should auto-redirect to payment
5. Payment should process without Firebase error
6. Driver owner gets green light to start trip

## **Prevention**

Always remember:
- ✅ Use `useFirestore()` instead of `getFirestore()`
- ✅ Use `useUser()` instead of `getAuth().currentUser`
- ✅ Check hooks return values before using
- ✅ Keep all Firebase client code in 'use client' components
