
'use client';

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Check, Edit, PlusCircle, Upload, Users, Truck, AlertCircle, CreditCard } from "lucide-react";
import Link from "next/link";
import { UploadDriversCSV } from "@/components/upload-drivers-csv";
import { UploadLoadsCSV } from "@/components/upload-loads-csv";
import { useUser, useDoc, useFirestore, useMemoFirebase } from "@/firebase";
import { doc } from 'firebase/firestore';
import { Skeleton } from "@/components/ui/skeleton";

interface OwnerOperatorProfile {
  legalName?: string;
  subscriptionStatus?: 'active' | 'inactive';
  // other fields are not needed for this check
}

export default function GettingStartedPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const profileQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return doc(firestore, `owner_operators/${user.uid}`);
  }, [firestore, user?.uid]);
  
  const { data: profile, isLoading: isProfileLoading } = useDoc<OwnerOperatorProfile>(profileQuery);

  const isProfileComplete = !!profile?.legalName;
  const isPaymentSetup = profile?.subscriptionStatus === 'active';
  const isFullySetup = isProfileComplete && isPaymentSetup;

  const getCardState = () => {
    if (isProfileLoading || isUserLoading) {
      return 'loading';
    }
    if (!isProfileComplete) {
      return 'incomplete-profile';
    }
    if (!isPaymentSetup) {
      return 'incomplete-payment';
    }
    return 'complete';
  }

  const cardState = getCardState();

  return (
    <div className="flex flex-col gap-8">
       <div>
        <h1 className="font-headline text-3xl font-bold">Welcome to FleetConnect!</h1>
        <p className="text-muted-foreground">Let's get your fleet up and running. Here’s your setup guide.</p>
       </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={cardState !== 'complete' && cardState !== 'loading' ? "bg-amber-50 border-amber-500" : "bg-primary/10 border-primary"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline">
              {cardState === 'loading' ? <Skeleton className="h-6 w-6 rounded-full" /> : 
                cardState === 'complete' ? <Check className="text-primary"/> : <AlertCircle className="text-amber-600" />
              }
              Account & Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cardState === 'loading' && <Skeleton className="h-10 w-full" />}
            {cardState === 'complete' && <p className="text-sm text-muted-foreground">Your company profile and payment methods are successfully set up.</p>}
            {cardState === 'incomplete-profile' && (
              <>
                <p className="text-sm text-amber-800 font-medium">Your profile is incomplete.</p>
                <p className="text-sm text-muted-foreground mt-1">Finish setting up your company details to get the most out of FleetConnect.</p>
                <Button asChild className="mt-4 w-full" variant="accent">
                  <Link href="/create-profile">
                    <Edit className="mr-2 h-4 w-4"/>
                    Complete Your Profile
                  </Link>
                </Button>
              </>
            )}
             {cardState === 'incomplete-payment' && (
              <>
                <p className="text-sm text-amber-800 font-medium">Your payment method is missing.</p>
                <p className="text-sm text-muted-foreground mt-1">Add your credit card to pay for match fees and activate your account.</p>
                <Button asChild className="mt-4 w-full" variant="accent">
                  <Link href="/payment">
                    <CreditCard className="mr-2 h-4 w-4"/>
                    Add Payment Method
                  </Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
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
            <Link href="/dashboard">Skip and go to Dashboard &rarr;</Link>
        </Button>
      </div>
    </div>
  );
}
