'use client';

import { useSearchParams } from 'next/navigation';
import { useUser, useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection } from 'firebase/firestore';
import type { Driver } from "@/lib/data";
import { getComplianceStatus } from "@/lib/compliance";
import DriverProfilePage from './[id]/page';

export function DriversContent({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const selectedDriverId = searchParams.get('id');
  
  console.log('�� DriversContent - Selected Driver ID:', selectedDriverId);
  
  if (selectedDriverId) {
    return <DriverProfilePage params={{ id: selectedDriverId }} />;
  }
  
  return <>{children}</>;
}
