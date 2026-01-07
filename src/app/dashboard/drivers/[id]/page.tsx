
'use client';

import { useUser, useDoc, useFirestore, useMemoFirebase } from "@/firebase";
import { doc } from 'firebase/firestore';
import { notFound } from 'next/navigation';
import type { Driver, Review } from '@/lib/data';
import { getComplianceStatus, ComplianceStatus } from "@/lib/compliance";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Star, Truck, User, FileText, CheckCircle, XCircle, AlertTriangle, MessageSquare } from 'lucide-react';
import Link from "next/link";
import { format, isAfter, parseISO, differenceInDays } from 'date-fns';

const StatCard = ({ title, value, icon: Icon }: { title: string; value: string | number; icon: React.ElementType }) => (
    <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
        <Icon className="h-8 w-8 text-muted-foreground" />
        <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-lg font-semibold">{value}</p>
        </div>
    </div>
)

const ComplianceItem = ({ 
    label, 
    value, 
    type = 'expiry' 
}: { 
    label: string; 
    value?: string; 
    type?: 'expiry' | 'field' | 'screening' 
}) => {
    let StatusIcon = AlertTriangle;
    let statusColor = "text-amber-500";
    let statusText = "Missing";

    if (value) {
        if (type === 'field') {
            // Non-date fields like CDL number, MVR number
            StatusIcon = CheckCircle;
            statusColor = "text-green-500";
            statusText = `Provided`;
        } else if (type === 'expiry') {
            // Date-based expiry (CDL, Medical, Insurance)
            const expiryDate = parseISO(value);
            const now = new Date();
            const daysUntilExpiry = differenceInDays(expiryDate, now);
            
            if (daysUntilExpiry < 0) {
                StatusIcon = XCircle;
                statusColor = "text-destructive";
                statusText = `Expired on ${format(expiryDate, 'MM/dd/yyyy')}`;
            } else if (daysUntilExpiry <= 30) {
                StatusIcon = AlertTriangle;
                statusColor = "text-amber-500";
                statusText = `Expires soon: ${format(expiryDate, 'MM/dd/yyyy')}`;
            } else {
                StatusIcon = CheckCircle;
                statusColor = "text-green-500";
                statusText = `Expires ${format(expiryDate, 'MM/dd/yyyy')}`;
            }
        } else if (type === 'screening') {
            // Screenings valid for 1 year from date
            const screeningDate = parseISO(value);
            const expiryDate = new Date(screeningDate);
            expiryDate.setFullYear(expiryDate.getFullYear() + 1);
            
            const now = new Date();
            const daysUntilExpiry = differenceInDays(expiryDate, now);
            
            if (daysUntilExpiry < 0) {
                StatusIcon = XCircle;
                statusColor = "text-destructive";
                statusText = `Expired ${format(expiryDate, 'MM/dd/yyyy')}`;
            } else if (daysUntilExpiry <= 30) {
                StatusIcon = AlertTriangle;
                statusColor = "text-amber-500";
                statusText = `Expires soon: ${format(expiryDate, 'MM/dd/yyyy')}`;
            } else {
                StatusIcon = CheckCircle;
                statusColor = "text-green-500";
                statusText = `Valid until ${format(expiryDate, 'MM/dd/yyyy')}`;
            }
        }
    }

    return (
        <div className="flex items-center justify-between py-3">
            <p className="font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground"/> {label}
            </p>
            <div className={`flex items-center gap-2 text-sm font-semibold ${statusColor}`}>
                <StatusIcon className="h-5 w-5" />
                <span>{statusText}</span>
            </div>
        </div>
    );
};

const ReviewCard = ({ review }: { review: Review }) => (
    <Card className="bg-muted/50 shadow-none">
        <CardHeader className="p-4">
            <div className="flex items-center justify-between">
                <div>
                    <CardTitle className="text-base">{review.reviewer}</CardTitle>
                    <CardDescription>{format(parseISO(review.date), 'MMMM d, yyyy')}</CardDescription>
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
    console.log('🔵 Driver Profile Page - Params:', params);
    console.log('🔵 Driver ID:', params.id);
    
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const driverId = params.id;

    const driverQuery = useMemoFirebase(() => {
        if (!firestore || !user?.uid) return null;
        return doc(firestore, `owner_operators/${user.uid}/drivers/${driverId}`);
    }, [firestore, user?.uid, driverId]);

    const { data: driver, isLoading: isDriverLoading } = useDoc<Driver>(driverQuery);
    
    if (isUserLoading || isDriverLoading) {
        return (
             <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Skeleton className="h-24 w-24 rounded-full" />
                        <div className="space-y-2">
                            <Skeleton className="h-8 w-48" />
                            <Skeleton className="h-6 w-32" />
                        </div>
                    </div>
                     <Skeleton className="h-10 w-24" />
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
        notFound();
    }

    const complianceStatus = getComplianceStatus(driver);
    
    const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('');

    const getComplianceBadgeVariant = (status: ComplianceStatus) => {
        switch (status) {
            case 'Green': return 'default';
            case 'Yellow': return 'secondary';
            case 'Red': return 'destructive';
            default: return 'outline';
        }
    };
    
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

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard title="Availability" value={driver.availability} icon={User} />
                <StatCard title="Vehicle Type" value={driver.vehicleType} icon={Truck} />
                <StatCard title="Avg. Rating" value={driver.rating ? `${driver.rating.toFixed(1)} / 5.0` : 'N/A'} icon={Star} />
                <StatCard title="Compliance Status" value={complianceStatus} icon={FileText} />
            </div>

             <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline">Compliance Scorecard</CardTitle>
                        <CardDescription>Status of all required documents and screenings.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between p-4 rounded-lg mb-4" style={{ backgroundColor: `hsl(var(--${getComplianceBadgeVariant(complianceStatus)}))`}}>
                            <p className="font-bold" style={{ color: `hsl(var(--${getComplianceBadgeVariant(complianceStatus)}-foreground))`}}>
                                Overall Status: {complianceStatus}
                            </p>
                        </div>

                        <div className="divide-y">
    <ComplianceItem label="CDL Expiry" value={driver.cdlExpiry} type="expiry" />
    <ComplianceItem label="CDL Number" value={driver.cdlLicense} type="field" />
    <ComplianceItem label="Medical Card" value={driver.medicalCardExpiry} type="expiry" />
    <ComplianceItem label="Insurance" value={driver.insuranceExpiry} type="expiry" />
    <ComplianceItem label="Motor Vehicle Record #" value={driver.motorVehicleRecordNumber} type="field" />
    <ComplianceItem label="Background Check" value={driver.backgroundCheckDate} type="screening" />
    <ComplianceItem label="Pre-Employment Screen" value={driver.preEmploymentScreeningDate} type="field" />
    <ComplianceItem label="Drug & Alcohol Screen" value={driver.drugAndAlcoholScreeningDate} type="screening" />
</div>
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

