import { useEffect, useState } from "react";
import { useUser, useFirestore } from "@/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import type { Match } from "@/lib/data";

// Match request expiry (48h) — mirror the Requests page's isExpired logic so
// the badge counts exactly what that page surfaces as actionable.
function notExpired(m: Match): boolean {
  if (!m.expiresAt) return true;
  const t = Date.parse(m.expiresAt);
  return Number.isNaN(t) || t > Date.now();
}

/**
 * Count of match-request activity needing the current owner's attention, for the
 * "Requests" nav badge:
 *   - incoming pending requests (someone wants to match — awaiting your response)
 *   - counter offers on requests you initiated (awaiting your accept/decline)
 *
 * Uses single-field equality queries (auto-indexed) + client-side filtering, so
 * no new composite Firestore index is required.
 */
export function usePendingRequestsCount(): number {
  const { user } = useUser();
  const firestore = useFirestore();
  const [incoming, setIncoming] = useState(0);
  const [countered, setCountered] = useState(0);

  // Incoming requests where I'm the recipient and still pending.
  useEffect(() => {
    if (!firestore || !user?.uid) {
      setIncoming(0);
      return;
    }
    const q = query(
      collection(firestore, "matches"),
      where("recipientOwnerId", "==", user.uid),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        let n = 0;
        snap.forEach((d) => {
          const m = d.data() as Match;
          if (m.status === "pending" && notExpired(m)) n++;
        });
        setIncoming(n);
      },
      (error) => {
        console.error("Error loading incoming requests count:", error);
        setIncoming(0);
      },
    );
    return () => unsubscribe();
  }, [firestore, user?.uid]);

  // Counter offers on requests I initiated as a load owner, awaiting my response.
  useEffect(() => {
    if (!firestore || !user?.uid) {
      setCountered(0);
      return;
    }
    const q = query(
      collection(firestore, "matches"),
      where("loadOwnerId", "==", user.uid),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        let n = 0;
        snap.forEach((d) => {
          const m = d.data() as Match;
          if (m.initiatedBy === "load_owner" && m.status === "countered" && notExpired(m)) n++;
        });
        setCountered(n);
      },
      (error) => {
        console.error("Error loading countered requests count:", error);
        setCountered(0);
      },
    );
    return () => unsubscribe();
  }, [firestore, user?.uid]);

  return incoming + countered;
}
