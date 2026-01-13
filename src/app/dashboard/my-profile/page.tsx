"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { 
  User, 
  Truck, 
  FileText, 
  Pencil, 
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Star
} from "lucide-react";
import { useUser, useFirestore, useMemoFirebase, useDoc } from "@/firebase";
import { doc } from "firebase/firestore";
import type { Driver } from "@/lib/data";
import { getComplianceStatus } from "@/lib/compliance";
import { format, parseISO, differenceInDays } from "date-fns";
import { EditDriverModal } from "@/components/edit-driver-modal";
import { ProfileCompletionBanner } from "@/components/profile-completion-banner";

const ComplianceItem = ({ 
    label, 
    value, 
    type = 'expiry',
    documentUrl
}: { 
    label: string; 
    value?: string; 
    type?: 'expiry' | 'field' | 'screening';
    documentUrl?: string;
}) => {
    let StatusIcon = AlertTriangle;
    let statusColor = "text-amber-500";
    let statusText = "Missing";

    if (value) {
        if (type === 'field') {
            StatusIcon = CheckCircle;
            statusColor = "text-green-500";
            statusText = `Provided`;
        } else if (type === 'expiry') {
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
            <div className="flex items-center gap-3">
                <div className={`flex items-center gap-2 text-sm font-semibold ${statusColor}`}>
                    <StatusIcon className="h-5 w-5" />
                    <span>{statusText}</span>
                </div>
                {documentUrl ? (
                    <a 
                        href={documentUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs bg-primary text-primary-foreground px-2 py-1 rounded hover:bg-primary/90 transition-colors"
                    >
                        <ExternalLink className="h-3 w-3" />
                        View
                    </a>
                ) : (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                        No file
                    </span>
                )}
            </div>
        </div>
    );
};

const StatCard = ({ title, value, icon: Icon }: { title: string; value: string | number; icon: React.ElementType }) => (
    <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
        <Icon className="h-8 w-8 text-muted-foreground" />
        <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-lg font-semibold">{value}</p>
        </div>
    </div>
);

export default function MyProfilePage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  // First, get the user's role document to find their ownerId
  const userRoleQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return doc(firestore, `users/${user.uid}`);
  }, [firestore, user?.uid]);

  const { data: userRole } = useDoc<{ role: string; ownerId: string }>(userRoleQuery);

  useEffect(() => {
    if (userRole?.ownerId) {
      setOwnerId(userRole.ownerId);
    }
  }, [userRole]);

  // Now get the driver's profile from their owner's subcollection
  const driverQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid || !ownerId) return null;
    return doc(firestore, `owner_operators/${ownerId}/drivers/${user.uid}`);
  }, [firestore, user?.uid, ownerId]);

  const { data: driver, isLoading, error } = useDoc<Driver>(driverQuery);

  const getInitials = (name: string) => {
    return name?.split(' ').map(n => n[0]).join('') || '';
  };

  const getComplianceBadgeVariant = (status: string) => {
    switch (status) {
      case 'Green':
        return 'default';
      case 'Yellow':
        return 'secondary';
      case 'Red':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  if (isLoading || !ownerId) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-40" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-24 w-24 rounded-full" />
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Separator />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !driver) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load your profile. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const complianceStatus = getComplianceStatus(driver);

  return (
    <div className="space-y-6">
      {/* Profile Completion Banner */}
      {user?.uid && (
        <ProfileCompletionBanner driver={driver} driverId={user.uid} />
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-headline">My Profile</h1>
        <Button onClick={() => setEditingDriver(driver)}>
          <Pencil className="h-4 w-4 mr-2" />
          Edit Profile
        </Button>
      </div>

      {/* Profile Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-24 w-24">
            <AvatarFallback className="text-3xl">{getInitials(driver.name)}</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-3xl font-bold font-headline">{driver.name}</h2>
            <p className="text-muted-foreground">{driver.location}</p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Vehicle Type" 
          value={driver.vehicleType || 'N/A'} 
          icon={Truck} 
        />
        <StatCard 
          title="Availability" 
          value={driver.availability || 'Off-duty'} 
          icon={User} 
        />
        <StatCard 
          title="Avg. Rating" 
          value={driver.rating ? `${driver.rating.toFixed(1)} / 5.0` : 'N/A'} 
          icon={Star} 
        />
        <StatCard 
          title="Compliance Status" 
          value={complianceStatus} 
          icon={FileText} 
        />
      </div>

      {/* Compliance Scorecard */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-headline">Compliance Scorecard</CardTitle>
              <CardDescription>
                Keep your documents up to date to continue receiving loads.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={() => setEditingDriver(driver)}>
              <Pencil className="h-4 w-4 mr-2" />
              Update Documents
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div 
            className="flex items-center justify-between p-4 rounded-lg mb-4" 
            style={{ backgroundColor: `hsl(var(--${getComplianceBadgeVariant(complianceStatus)}))` }}
          >
            <p 
              className="font-bold" 
              style={{ color: `hsl(var(--${getComplianceBadgeVariant(complianceStatus)}-foreground))` }}
            >
              Overall Status: {complianceStatus}
            </p>
          </div>

          <div className="divide-y">
            <ComplianceItem 
              label="CDL Expiry" 
              value={driver.cdlExpiry} 
              type="expiry" 
              documentUrl={driver.cdlDocumentUrl || driver.cdlLicenseUrl}
            />
            <ComplianceItem 
              label="CDL Number" 
              value={driver.cdlLicense} 
              type="field" 
              documentUrl={driver.cdlLicenseUrl}
            />
            <ComplianceItem 
              label="Medical Card" 
              value={driver.medicalCardExpiry} 
              type="expiry" 
              documentUrl={driver.medicalCardUrl}
            />
            <ComplianceItem 
              label="Insurance" 
              value={driver.insuranceExpiry} 
              type="expiry" 
              documentUrl={driver.insuranceUrl}
            />
            <ComplianceItem 
              label="Motor Vehicle Record #" 
              value={driver.motorVehicleRecordNumber} 
              type="field" 
              documentUrl={driver.mvrUrl}
            />
            <ComplianceItem 
              label="Background Check" 
              value={driver.backgroundCheckDate} 
              type="screening" 
              documentUrl={driver.backgroundCheckUrl}
            />
            <ComplianceItem 
              label="Pre-Employment Screen" 
              value={driver.preEmploymentScreeningDate} 
              type="field" 
              documentUrl={driver.preEmploymentScreeningUrl}
            />
            <ComplianceItem 
              label="Drug & Alcohol Screen" 
              value={driver.drugAndAlcoholScreeningDate} 
              type="screening" 
              documentUrl={driver.drugAndAlcoholScreeningUrl}
            />
          </div>
        </CardContent>
      </Card>

      {/* Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="font-medium">{driver.email || 'Not provided'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Phone</p>
            <p className="font-medium">{driver.phoneNumber || driver.phone || 'Not provided'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Location</p>
            <p className="font-medium">{driver.location || 'Not provided'}</p>
          </div>
        </CardContent>
      </Card>

      <EditDriverModal 
        open={!!editingDriver} 
        onOpenChange={(open) => !open && setEditingDriver(null)} 
        driver={editingDriver}
      />
    </div>
  );
}
