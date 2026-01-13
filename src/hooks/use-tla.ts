import { useState, useEffect } from "react";
import { useFirestore } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import type { TLA } from "@/lib/data";

export interface UseTLAResult {
  tla: TLA | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and manage TLA data
 */
export function useTLA(tlaId: string | undefined): UseTLAResult {
  const firestore = useFirestore();
  const [tla, setTla] = useState<TLA | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTLA = async () => {
    if (!firestore || !tlaId) {
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const tlaDoc = await getDoc(doc(firestore, `tlas/${tlaId}`));
      if (tlaDoc.exists()) {
        setTla({ id: tlaDoc.id, ...tlaDoc.data() } as TLA);
      } else {
        setError("TLA not found");
      }
    } catch (err) {
      console.error("Error fetching TLA:", err);
      setError("Failed to load TLA");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTLA();
  }, [firestore, tlaId]);

  return {
    tla,
    isLoading,
    error,
    refetch: fetchTLA,
  };
}
