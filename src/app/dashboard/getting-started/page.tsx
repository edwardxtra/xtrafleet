'use client';

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Check, Edit, PlusCircle, Upload, Users, Truck, AlertCircle, Database, Clock } from "lucide-react";
import Link from "next/link";
import { UploadDriversCSV } from "@/components/upload-drivers-csv";
import { UploadLoadsCSV } from "@/components/upload-loads-csv";
import { useUser, useDoc, useFirestore, useMemoFirebase } from "@/firebase";
import { doc } from 'firebase/firestore';
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from 'date-fns';

interface OwnerOperatorProfile {
  legalName?: string;
  subscriptionStatus?: 'active' | 'inactive';
  profileCompletedAt?: string;
  clearinghouseCompletedAt?: string;
  onboardingStatus?: {
    profileComplete?: boolean;
    profileCompletedAt?: string;
    fmcsaDesignated?: boolean | string;
    fmcsaDesignatedAt?: string;
    completedAt?: string | null;
  };
}

const formatTimestamp = (dateString?: string | null) => {
  if (!dateString) return null;
  try {
    return format(parseISO(dateString), "MMM d, yyyy 'at' h:mm a");
  } catch {
    return null;
  }
};

export default function GettingStartedPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const profileQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return doc(firestore, `owner_operators/${user.uid}`);
  }, [firestore, user?.uid]);
  
  const { data: profile, isLoading: isProfileLoading } = useDoc<OwnerOperatorProfile>(profileQuery);

  const isProfileComplete = !!profile?.onboardingStatus?.profileComplete;
  const isFmcsaDesignated = profile?.onboardingStatus?.fmcsaDesignated === true;
  const isFullyOnboarded = isProfileComplete && isFmcsaDesignated;

  const profileCompletedAt = formatTimestamp(profile?.onboardingStatus?.profileCompletedAt || profile?.profileCompletedAt);
  const clearinghouseCompletedAt = formatTimestamp(profile?.clearinghouseCompletedAt || profile?.onboardingStatus?.fmcsaDesignatedAt);

  const isLoading = isProfileLoading || isUserLoading;

  return (
    <div className="flex flex-col gap-8">
       <div>
        <h1 className="font-headline text-3xl font-bold">Welcome to XtraFleet!</h1>
        <p className="text-muted-foreground">Let&apos;s get your fleet up and running. Here&apos;s your setup guide.</p>
       </div>

      {/* Onboarding Steps */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Step 1: Profile */}
        <Card className={isProfileComplete ? "bg-primary/10 border-primary" : "bg-amber-50 border-amber-500 dark:bg-amber-950/30 dark:border-amber-800"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline">
              {isLoading ? <Skeleton className="h-6 w-6 rounded-full" /> : 
                isProfileComplete ? <Check className="text-primary"/> : <AlertCircle className="text-amber-600" />
              }
              Company Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && <Skeleton className="h-10 w-full" />}
            {!isLoading && isProfileComplete && (
              <>
                <p className="text-sm text-muted-foreground">Your company profile is set up.</p>
                {profileCompletedAt && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Completed: {profileCompletedAt}
                  </p>
                )}
              </>
            )}
            {!isLoading && !isProfileComplete && (
              <>
                <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">Your profile is incomplete.</p>
                <p className="text-sm text-muted-foreground mt-1">Complete your DOT#, MC#, address, and operating states.</p>
                <Button asChild className="mt-4 w-full" variant="default">
                  <Link href="/create-profile">
                    <Edit className="mr-2 h-4 w-4"/>
                    Complete Your Profile
                  </Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Step 2: FMCSA Clearinghouse — compliance attestations are now
            captured contextually at marketplace / driver-add / match-confirm
            (DEV-154) and no longer get a setup card here. */}
        <Card className={isFmcsaDesignated ? "bg-primary/10 border-primary" : "bg-amber-50 border-amber-500 dark:bg-amber-950/30 dark:border-amber-800"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline">
              {isLoading ? <Skeleton className="h-6 w-6 rounded-full" /> : 
                isFmcsaDesignated ? <Check className="text-primary"/> : <AlertCircle className="text-amber-600" />
              }
              FMCSA Clearinghouse
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && <Skeleton className="h-10 w-full" />}
            {!isLoading && isFmcsaDesignated && (
              <>
                <p className="text-sm text-muted-foreground">Clearinghouse designation confirmed.</p>
                {clearinghouseCompletedAt && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Completed: {clearinghouseCompletedAt}
                  </p>
                )}
              </>
            )}
            {!isLoading && !isFmcsaDesignated && (
              <>
                <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                  {profile?.onboardingStatus?.fmcsaDesignated === 'pending' ? 'Pending confirmation.' : 
                   profile?.onboardingStatus?.fmcsaDesignated === 'skipped' ? 'Skipped \u2014 complete when ready.' : 'Not yet started.'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Designate XtraFleet for Drug & Alcohol eligibility checks.</p>
                <Button asChild className="mt-4 w-full" variant="default">
                  <Link href="/onboarding/fmcsa-clearinghouse">
                    <Database className="mr-2 h-4 w-4"/>
                    Complete Designation
                  </Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline"><Users />Add Your Drivers</CardTitle>
            <CardDescription>
                Onboard your drivers to start matching them with available loads.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Link href="/dashboard/drivers">
                <Button className="w-full">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Driver Manually
                </Button>
            </Link>
             <UploadDriversCSV>
                <Button variant="outline" className="w-full">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload CSV
                </Button>
            </UploadDriversCSV>
          </CardContent>
        </Card>
         <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline"><Truck />Post Your Loads</CardTitle>
            <CardDescription>
                Add your available loads to find drivers quickly.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
             <Link href="/dashboard/loads">
                <Button className="w-full">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Load Manually
                </Button>
            </Link>
            <UploadLoadsCSV>
                 <Button variant="outline" className="w-full">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload CSV
                </Button>
            </UploadLoadsCSV>
          </CardContent>
        </Card>
      </div>
      <div className="text-center">
        <Button asChild variant="ghost">
            <Link href="/dashboard">Go to Dashboard &rarr;</Link>
        </Button>
      </div>
    </div>
  );
}
