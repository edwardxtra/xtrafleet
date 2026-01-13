import { useState, useEffect, useMemo } from "react";
import { useUser, useFirestore } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import type { TLA } from "@/lib/data";
import { 
  getTLASigningRole, 
  getCannotSignReason,
  getWaitingMessage 
} from "@/lib/tla-utils";

export interface UseTLARolesResult {
  isLessor: boolean;
  isLessee: boolean;
  isDriver: boolean;
  isInvolved: boolean;
  canControlTrip: boolean;
  signingRole: 'lessor' | 'lessee' | null;
  canSign: boolean;
  cannotSignReason: string | null;
  waitingMessage: string | null;
  userName: string;
}

/**
 * Hook to calculate user roles and permissions for a TLA
 */
export function useTLARoles(tla: TLA | null): UseTLARolesResult {
  const { user } = useUser();
  const firestore = useFirestore();
  const [isDriver, setIsDriver] = useState(false);

  // Calculate roles
  const isLessor = tla && user ? user.uid === tla.lessor.ownerOperatorId : false;
  const isLessee = tla && user ? user.uid === tla.lessee.ownerOperatorId : false;
  const isInvolved = isLessor || isLessee;

  // Check if user is the driver
  useEffect(() => {
    async function checkIfDriver() {
      if (!firestore || !user || !tla) return;
      
      try {
        const userDoc = await getDoc(doc(firestore, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.role === 'driver' && userData.driverId === tla.driver.id) {
            setIsDriver(true);
          }
        }
      } catch (err) {
        console.error("Error checking driver status:", err);
      }
    }
    
    checkIfDriver();
  }, [firestore, user, tla]);

  // Calculate signing permissions
  const signingRole = useMemo(() => 
    getTLASigningRole(tla, user?.uid, isLessor, isLessee),
    [tla, user?.uid, isLessor, isLessee]
  );

  const canSign = signingRole !== null;

  const cannotSignReason = useMemo(() =>
    getCannotSignReason(tla, user?.uid, isLessor, isLessee),
    [tla, user?.uid, isLessor, isLessee]
  );

  const waitingMessage = useMemo(() =>
    getWaitingMessage(tla, user?.uid, isLessor, isLessee),
    [tla, user?.uid, isLessor, isLessee]
  );

  // Determine user name
  const userName = useMemo(() => {
    if (!tla || !user) return user?.email || 'Unknown';
    if (isLessor) return tla.lessor.legalName;
    if (isDriver) return tla.driver.name;
    return user.email || 'Unknown';
  }, [tla, user, isLessor, isDriver]);

  // Can control trip: Lessor (Driver Owner) or the actual Driver
  const canControlTrip = isLessor || isDriver;

  return {
    isLessor,
    isLessee,
    isDriver,
    isInvolved,
    canControlTrip,
    signingRole,
    canSign,
    cannotSignReason,
    waitingMessage,
    userName,
  };
}
