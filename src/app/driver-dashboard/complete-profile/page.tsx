'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2, ClipboardCheck, Shield, Truck } from 'lucide-react';
import { DriverProfileCompletion } from '@/components/driver-profile-completion';
import { Logo } from '@/components/logo';

export default function CompleteProfilePage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [driverName, setDriverName] = useState('');

  useEffect(() => {
    async function checkProfileStatus() {
      if (!user || !db) return;

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) return;

        const userData = userDoc.data();
        if (userData.role !== 'driver') {
          router.push('/dashboard');
          return;
        }

        const driverDoc = await getDoc(doc(db, 'owner_operators', userData.ownerId, 'drivers', user.uid));
        if (driverDoc.exists()) {
          const driverData = driverDoc.data();
          setDriverName(driverData.firstName || driverData.name?.split(' ')[0] || '');

          // If profile is already submitted or complete, redirect to dashboard
          if (driverData.profileStatus === 'pending_confirmation' || 
              driverData.profileStatus === 'confirmed' ||
              driverData.profileComplete === true) {
            router.push('/driver-dashboard');
            return;
          }
        }
      } catch (error) {
        console.error('Error checking profile status:', error);
      } finally {
        setLoading(false);
      }
    }

    if (user && db) {
      checkProfileStatus();
    }
  }, [user, db, router]);

  const handleComplete = () => {
    router.push('/driver-dashboard');
  };

  if (isUserLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">
          Welcome{driverName ? `, ${driverName}` : ''}! Let's get you set up.
        </h1>
        <p className="text-muted-foreground">
          Complete your CDL information below to start receiving load opportunities.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col items-center text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
          <Truck className="h-5 w-5 text-green-600 mb-1" />
          <span className="text-xs font-medium text-green-700 dark:text-green-400">Account Created</span>
        </div>
        <div className="flex flex-col items-center text-center p-3 rounded-lg bg-primary/10 border-2 border-primary">
          <ClipboardCheck className="h-5 w-5 text-primary mb-1" />
          <span className="text-xs font-medium text-primary">CDL & Authorization</span>
        </div>
        <div className="flex flex-col items-center text-center p-3 rounded-lg bg-muted border border-border">
          <Shield className="h-5 w-5 text-muted-foreground mb-1" />
          <span className="text-xs font-medium text-muted-foreground">Ready to Match</span>
        </div>
      </div>

      {user && (
        <DriverProfileCompletion driverId={user.uid} onComplete={handleComplete} />
      )}
    </div>
  );
}
