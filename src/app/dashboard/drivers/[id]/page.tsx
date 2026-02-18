'use client';

import { useUser, useDoc, useFirestore, useMemoFirebase } from "@/firebase";
import { doc } from 'firebase/firestore';
import { notFound } from 'next/navigation';
import type { Driver, Review } from '@/lib/data';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Star, Truck, User, FileText, MessageSquare } from 'lucide-react';
import Link from "next/link";
import { format, parseISO } from 'date-fns';
import { ComplianceScorecard } from '@/components/compliance-scorecard';

const LOG_PREFIX = '[drivers/[id]/page]';

const StatCard = ({ title, value, icon: Icon }: { title: string; value: string | number; icon: React.ElementType }) => (
  <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
    <Icon className="h-8 w-8 text-muted-foreground" />
    <div>
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  </div>
);

const ReviewCard = ({ review }: { review: Review }) => (
  <Card className="bg-muted/50 shadow-none">
    <CardHeader className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="text-base">{review.reviewer}</CardTitle>
          <p className="text-sm text-muted-foreground">{format(parseISO(review.date), 'MMMM d, yyyy')}</p>
        </div>
        <div className="flex items-center gap-1">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className={`h-5 w-5 ${i < review.rating ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/50'}`} />
          ))}
        </div>
      </div>
    </CardHeader>
    <CardContent className="p-4 pt-0">
      <p className="text-sm text-muted-foreground">{review.comment}</p>
    </CardContent>
  </Card>
);

export default function DriverProfilePage({ params }: { params: { id: string } }) {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const driverId = params.id;

  console.log(`${LOG_PREFIX} Rendering for driverId: ${driverId}`);

  const driverQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    const path = `owner_operators/${user.uid}/drivers/${driverId}`;
    console.log(`${LOG_PREFIX} Building query for path: ${path}`);
    return doc(firestore, path);
  }, [firestore, user?.uid, driverId]);

  const { data: driver, isLoading: isDriverLoading } = useDoc<Driver>(driverQuery);

  if (isUserLoading || isDriverLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-24 w-24 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-6 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!driver) {
    console.warn(`${LOG_PREFIX} Driver not found for id: ${driverId}, user: ${user?.uid}`);
    notFound();
  }

  console.log(`${LOG_PREFIX} Driver loaded: ${driver.name}, profileStatus: ${driver.profileStatus}, compliance fields:`, {
    cdlLicense: driver.cdlLicense,
    cdlExpiry: driver.cdlExpiry,
    medicalCardExpiry: driver.medicalCardExpiry,
    insuranceExpiry: driver.insuranceExpiry,
    motorVehicleRecordNumber: driver.motorVehicleRecordNumber,
  });

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('');

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-24 w-24">
            <AvatarFallback className="text-3xl">{getInitials(driver.name)}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-3xl font-bold font-headline">{driver.name}</h1>
            <p className="text-muted-foreground">{driver.location}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">Edit Profile</Button>
          <Link href="/dashboard/matches">
            <Button>Find Match</Button>
          </Link>
        </div>
      </div>

      <Separator />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Availability" value={driver.availability} icon={User} />
        <StatCard title="Vehicle Type" value={driver.vehicleType} icon={Truck} />
        <StatCard title="Avg. Rating" value={driver.rating ? `${driver.rating.toFixed(1)} / 5.0` : 'N/A'} icon={Star} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Compliance Scorecard</CardTitle>
            <CardDescription>Status of all required documents and screenings.</CardDescription>
          </CardHeader>
          <CardContent>
            <ComplianceScorecard driver={driver} role="owner_operator" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Ratings & Reviews</CardTitle>
            <CardDescription>Feedback from previous loads.</CardDescription>
          </CardHeader>
          <CardContent>
            {driver.reviews && driver.reviews.length > 0 ? (
              <div className="space-y-4">
                {driver.reviews.map(review => <ReviewCard key={review.id} review={review} />)}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8 border-2 border-dashed rounded-lg">
                <MessageSquare className="h-16 w-16 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold font-headline">No Reviews Yet</h3>
                <p className="mt-2 text-sm text-muted-foreground">This driver has not received any feedback.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
