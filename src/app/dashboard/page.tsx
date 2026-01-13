'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';

// Import both dashboards
import OwnerOperatorDashboard from './owner-operator-dashboard';
import DriverDashboard from './driver-dashboard';

export default function DashboardRouter() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  // Check user role
  const userRoleQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return doc(firestore, `users/${user.uid}`);
  }, [firestore, user?.uid]);

  const { data: userRole, isLoading: roleLoading } = useDoc<{ role: string; ownerId: string }>(userRoleQuery);

  if (isUserLoading || roleLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // Route based on role
  if (userRole?.role === 'driver') {
    return <DriverDashboard />;
  }

  // Default to owner-operator dashboard
  return <OwnerOperatorDashboard />;
}
