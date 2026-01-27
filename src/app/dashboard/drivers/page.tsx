'use client';

import { useState, useEffect, useMemo } from "react";
import Link from 'next/link';
import { File, PlusCircle, Search, Upload, ArrowLeft, WifiOff, AlertCircle, RefreshCw, ExternalLink, Download, Pencil, UserX, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { AddDriverForm } from "@/components/add-driver-form";
import { EditDriverModal } from "@/components/edit-driver-modal";
import { MoreHorizontal } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import type { Driver } from "@/lib/data";
import { UploadDriversCSV } from "@/components/upload-drivers-csv";
import { useUser, useCollection, useFirestore, useMemoFirebase, useDoc } from "@/firebase";
import { collection, doc, updateDoc } from 'firebase/firestore';
import { getComplianceStatus, ComplianceStatus } from "@/lib/compliance";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Star, Truck, User, FileText as FileTextIcon, CheckCircle, XCircle, AlertTriangle, MessageSquare } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { showSuccess, showError } from '@/lib/toast-utils';
import { TRAILER_TYPES } from '@/lib/trailer-types';
import { TableAvatar, TableStatusBadge } from '@/components/ui/table-components';

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
                <FileTextIcon className="h-4 w-4 text-muted-foreground"/> {label}
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

const TableSkeleton = () => (
  <>
    {[1, 2, 3, 4, 5].map((i) => (
      <TableRow key={i}>
        <TableCell>
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div>
              <Skeleton className="h-4 w-32 mb-1" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </TableCell>
        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
        <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
        <TableCell><Skeleton className="h-8 w-8" /></TableCell>
      </TableRow>
    ))}
  </>
);

const ProfileSkeleton = () => (
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
    <div className="grid gap-6 lg:grid-cols-2">
      <Skeleton className="h-96 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  </div>
);

const DriversTable = ({
  drivers,
  isLoading,
  isUserLoading,
  driversError,
  isOnline,
  emptyMessage = "No drivers found",
  onSelectDriver,
  onEditDriver,
  onToggleActive,
}: {
  drivers: Driver[] | null;
  isLoading: boolean;
  isUserLoading: boolean;
  driversError: Error | null;
  isOnline: boolean;
  emptyMessage?: string;
  onSelectDriver: (id: string) => void;
  onEditDriver: (driver: Driver) => void;
  onToggleActive: (driver: Driver) => void;
}) => {
  const getComplianceBadgeVariant = (status: ComplianceStatus) => {
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

  // Get vehicle types display text
  const getVehicleTypesDisplay = (driver: Driver) => {
    const types = driver.vehicleTypes || (driver.vehicleType ? [driver.vehicleType] : []);
    if (types.length === 0) return '-';
    
    const labels = types.map(typeValue => {
      const typeLabel = TRAILER_TYPES.find(t => t.value === typeValue)?.label;
      return typeLabel || typeValue;
    });
    
    // Show first type, then "+X more" if there are multiple
    if (labels.length === 1) return labels[0];
    return `${labels[0]} +${labels.length - 1}`;
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Vehicle Types</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Availability</TableHead>
          <TableHead>Compliance</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading || isUserLoading ? (
          <TableSkeleton />
        ) : driversError ? (
          <TableRow>
            <TableCell colSpan={6} className="h-24 text-center">
              <div className="flex flex-col items-center gap-2">
                <AlertCircle className="h-8 w-8 text-destructive" />
                <p className="text-muted-foreground">Failed to load drivers</p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => window.location.reload()}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ) : drivers && drivers.length > 0 ? (
          drivers.map((driver) => {
            const complianceStatus = getComplianceStatus(driver);
            const isInactive = driver.isActive === false;
            return (
              <TableRow key={driver.id} className={isInactive ? "opacity-50" : ""}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <TableAvatar
                      name={driver.name || 'Unnamed Driver'}
                      subtitle={driver.certifications?.join(', ') || driver.email}
                    />
                    {isInactive && (
                      <Badge variant="outline" className="text-xs">Inactive</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{getVehicleTypesDisplay(driver)}</span>
                </TableCell>
                <TableCell>{driver.location || '-'}</TableCell>
                <TableCell>
                  <TableStatusBadge status={driver.availability || 'Off-duty'} />
                </TableCell>
                <TableCell>
                  <Badge variant={getComplianceBadgeVariant(complianceStatus)} className="flex items-center gap-1.5 w-fit">
                    <span className={`h-2 w-2 rounded-full ${
                      complianceStatus === 'Green' ? 'bg-green-500' : 
                      complianceStatus === 'Yellow' ? 'bg-yellow-500' : 
                      'bg-red-500'
                    }`} />
                    {complianceStatus}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button aria-haspopup="true" size="icon" variant="ghost">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Toggle menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => onSelectDriver(driver.id)}>
                        View Profile
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        disabled={!isOnline}
                        onClick={() => onEditDriver(driver)}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit Profile
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        disabled={!isOnline}
                        onClick={() => onToggleActive(driver)}
                        className={isInactive ? "text-green-600" : "text-destructive"}
                      >
                        {isInactive ? (
                          <><UserCheck className="h-4 w-4 mr-2" /> Reactivate</>
                        ) : (
                          <><UserX className="h-4 w-4 mr-2" /> Deactivate</>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })
        ) : (
          <TableRow>
            <TableCell colSpan={6} className="h-24 text-center">
              <div className="flex flex-col items-center gap-2">
                <User className="h-8 w-8 text-muted-foreground" />
                <p className="text-muted-foreground">{emptyMessage}</p>
              </div>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
};

export default function DriversPage() {
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [togglingDriver, setTogglingDriver] = useState<Driver | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showSuccess('You\'re back online!');
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const driversQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return collection(firestore, `owner_operators/${user.uid}/drivers`);
  }, [firestore, user?.uid]);

  const { data: drivers, isLoading, error: driversError } = useCollection<Driver>(driversQuery);

  const filteredDrivers = useMemo(() => {
    if (!drivers) return null;
    
    switch (activeTab) {
      case "available":
        return drivers.filter(driver => driver.availability === "Available" && driver.isActive !== false);
      case "on-trip":
        return drivers.filter(driver => driver.availability === "On-trip");
      case "off-duty":
        return drivers.filter(driver => driver.availability === "Off-duty" || !driver.availability);
      case "inactive":
        return drivers.filter(driver => driver.isActive === false);
      default:
        return drivers;
    }
  }, [drivers, activeTab]);

  const counts = useMemo(() => {
    if (!drivers) return { all: 0, available: 0, onTrip: 0, offDuty: 0, inactive: 0 };
    return {
      all: drivers.length,
      available: drivers.filter(d => d.availability === "Available" && d.isActive !== false).length,
      onTrip: drivers.filter(d => d.availability === "On-trip").length,
      offDuty: drivers.filter(d => (d.availability === "Off-duty" || !d.availability) && d.isActive !== false).length,
      inactive: drivers.filter(d => d.isActive === false).length,
    };
  }, [drivers]);

  const selectedDriverQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid || !selectedDriverId) return null;
    return doc(firestore, `owner_operators/${user.uid}/drivers/${selectedDriverId}`);
  }, [firestore, user?.uid, selectedDriverId]);

  const { data: selectedDriver, isLoading: isDriverLoading, error: driverError } = useDoc<Driver>(selectedDriverQuery);

  useEffect(() => {
    if (driversError) {
      showError('Failed to load drivers. Please try again.');
    }
    if (driverError) {
      showError('Failed to load driver details. Please try again.');
    }
  }, [driversError, driverError]);

  const handleExport = () => {
    if (!filteredDrivers || filteredDrivers.length === 0) {
      showError('No drivers to export');
      return;
    }

    const headers = ['Name', 'Email', 'Vehicle Types', 'Location', 'Availability', 'CDL Number', 'CDL Expiry'];
    const csvContent = [
      headers.join(','),
      ...filteredDrivers.map(driver => {
        const types = driver.vehicleTypes || (driver.vehicleType ? [driver.vehicleType] : []);
        const typeLabels = types.map(t => TRAILER_TYPES.find(tt => tt.value === t)?.label || t).join('; ');
        
        return [
          `"${driver.name || ''}"`,
          `"${driver.email || ''}"`,
          `"${typeLabels}"`,
          `"${driver.location || ''}"`,
          `"${driver.availability || ''}"`,
          `"${driver.cdlLicense || ''}"`,
          `"${driver.cdlExpiry || ''}"`,
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `drivers-${activeTab}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    showSuccess('Drivers exported successfully!');
  };

  const handleToggleActive = async () => {
    if (!togglingDriver || !firestore || !user?.uid) return;
    
    setIsToggling(true);
    try {
      const driverRef = doc(firestore, `owner_operators/${user.uid}/drivers/${togglingDriver.id}`);
      const newStatus = togglingDriver.isActive === false ? true : false;
      await updateDoc(driverRef, { isActive: newStatus });
      showSuccess(newStatus ? 'Driver reactivated' : 'Driver deactivated');
      setTogglingDriver(null);
    } catch (error: any) {
      showError(error.message || 'Failed to update driver status');
    } finally {
      setIsToggling(false);
    }
  };
  
  const getComplianceBadgeVariant = (status: ComplianceStatus) => {
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

  const getInitials = (name: string) => {
    return name?.split(' ').map(n => n[0]).join('') || '';
  }

  // Get vehicle types display text for profile
  const getVehicleTypesDisplay = (driver: Driver) => {
    const types = driver.vehicleTypes || (driver.vehicleType ? [driver.vehicleType] : []);
    if (types.length === 0) return 'N/A';
    
    return types.map(typeValue => {
      const typeLabel = TRAILER_TYPES.find(t => t.value === typeValue)?.label;
      return typeLabel || typeValue;
    }).join(', ');
  };

  if (selectedDriverId) {
    if (isDriverLoading) {
      return <ProfileSkeleton />;
    }

    if (driverError || !selectedDriver) {
      return (
        <div className="space-y-6">
          <Button variant="outline" onClick={() => setSelectedDriverId(null)} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Drivers List
          </Button>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load driver profile. 
              <Button 
                variant="link" 
                className="p-0 h-auto ml-2" 
                onClick={() => window.location.reload()}
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    const complianceStatus = getComplianceStatus(selectedDriver);
    
    return (
      <div className="space-y-6">
        {!isOnline && (
          <Alert variant="destructive" className="mb-4">
            <WifiOff className="h-4 w-4" />
            <AlertDescription>
              You&apos;re currently offline. Data may not be up to date.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => setSelectedDriverId(null)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Drivers List
          </Button>
          <Button onClick={() => setEditingDriver(selectedDriver)} disabled={!isOnline}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit Profile
          </Button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-24 w-24">
              <AvatarFallback className="text-3xl">{getInitials(selectedDriver.name)}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-3xl font-bold font-headline flex items-center gap-2">
                {selectedDriver.name}
                {selectedDriver.isActive === false && (
                  <Badge variant="outline">Inactive</Badge>
                )}
              </h1>
              <p className="text-muted-foreground">{selectedDriver.location}</p>
            </div>
          </div>
        </div>

        <Separator />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Availability" value={selectedDriver.availability || 'Off-duty'} icon={User} />
          <StatCard title="Vehicle Types" value={getVehicleTypesDisplay(selectedDriver)} icon={Truck} />
          <StatCard title="Avg. Rating" value={selectedDriver.rating ? `${selectedDriver.rating.toFixed(1)} / 5.0` : 'N/A'} icon={Star} />
          <StatCard title="Compliance Status" value={complianceStatus} icon={FileTextIcon} />
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
                <ComplianceItem label="CDL Expiry" value={selectedDriver.cdlExpiry} type="expiry" documentUrl={selectedDriver.cdlDocumentUrl || selectedDriver.cdlLicenseUrl}/>
                <ComplianceItem label="CDL Number" value={selectedDriver.cdlLicense} type="field" documentUrl={selectedDriver.cdlLicenseUrl}/>
                <ComplianceItem label="Medical Card" value={selectedDriver.medicalCardExpiry} type="expiry" documentUrl={selectedDriver.medicalCardUrl}/>
                <ComplianceItem label="Insurance" value={selectedDriver.insuranceExpiry} type="expiry" documentUrl={selectedDriver.insuranceUrl}/>
                <ComplianceItem label="Motor Vehicle Record #" value={selectedDriver.motorVehicleRecordNumber} type="field" documentUrl={selectedDriver.mvrUrl}/>
                <ComplianceItem label="Background Check" value={selectedDriver.backgroundCheckDate} type="screening" documentUrl={selectedDriver.backgroundCheckUrl}/>
                <ComplianceItem label="Pre-Employment Screen" value={selectedDriver.preEmploymentScreeningDate} type="field" documentUrl={selectedDriver.preEmploymentScreeningUrl}/>
                <ComplianceItem label="Drug & Alcohol Screen" value={selectedDriver.drugAndAlcoholScreeningDate} type="screening" documentUrl={selectedDriver.drugAndAlcoholScreeningUrl}/>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-headline">Ratings & Reviews</CardTitle>
              <CardDescription>Feedback from previous loads.</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedDriver.reviews && selectedDriver.reviews.length > 0 ? (
                <div className="space-y-4">
                  {selectedDriver.reviews.map(review => (
                    <Card key={review.id} className="bg-muted/50 shadow-none">
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
                  ))}
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
        
        <EditDriverModal open={!!editingDriver} onOpenChange={(open) => !open && setEditingDriver(null)} driver={editingDriver} onSuccess={() => setSelectedDriverId(selectedDriverId)}/>
      </div>
    );
  }

  return (
    <Sheet>
      <main className="grid flex-1 items-start gap-4 sm:py-0 md:gap-8">
        {!isOnline && (
          <Alert variant="destructive">
            <WifiOff className="h-4 w-4" />
            <AlertDescription>You&apos;re currently offline. Data may not be up to date.</AlertDescription>
          </Alert>
        )}

        {driversError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load drivers. 
              <Button variant="link" className="p-0 h-auto ml-2" onClick={() => window.location.reload()}>
                <RefreshCw className="h-3 w-3 mr-1" />Refresh
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center">
            <TabsList>
              <TabsTrigger value="all">All {counts.all > 0 && `(${counts.all})`}</TabsTrigger>
              <TabsTrigger value="available">Available {counts.available > 0 && `(${counts.available})`}</TabsTrigger>
              <TabsTrigger value="on-trip">On-trip {counts.onTrip > 0 && `(${counts.onTrip})`}</TabsTrigger>
              <TabsTrigger value="off-duty">Off-duty {counts.offDuty > 0 && `(${counts.offDuty})`}</TabsTrigger>
              {counts.inactive > 0 && (<TabsTrigger value="inactive">Inactive {`(${counts.inactive})`}</TabsTrigger>)}
            </TabsList>
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 gap-1" disabled={!isOnline || !filteredDrivers?.length} onClick={handleExport}>
                <Download className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Export</span>
              </Button>
              <SheetTrigger asChild>
                <Button size="sm" className="h-8 gap-1" disabled={!isOnline}>
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Add Driver</span>
                </Button>
              </SheetTrigger>
            </div>
          </div>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="font-headline">Drivers</CardTitle>
              <CardDescription>Manage your drivers and view their status.</CardDescription>
            </CardHeader>
            <CardContent>
              <DriversTable drivers={filteredDrivers} isLoading={isLoading} isUserLoading={isUserLoading} driversError={driversError} isOnline={isOnline} emptyMessage={activeTab === "all" ? "No drivers found. Invite your first driver!" : activeTab === "inactive" ? "No inactive drivers." : `No ${activeTab} drivers found.`} onSelectDriver={setSelectedDriverId} onEditDriver={setEditingDriver} onToggleActive={setTogglingDriver}/>
            </CardContent>
          </Card>
        </Tabs>
      </main>
      
      <AddDriverForm />
      
      <EditDriverModal open={!!editingDriver && !selectedDriverId} onOpenChange={(open) => !open && setEditingDriver(null)} driver={editingDriver}/>

      <AlertDialog open={!!togglingDriver} onOpenChange={(open) => !open && setTogglingDriver(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{togglingDriver?.isActive === false ? 'Reactivate Driver' : 'Deactivate Driver'}</AlertDialogTitle>
            <AlertDialogDescription>
              {togglingDriver?.isActive === false 
                ? `Are you sure you want to reactivate ${togglingDriver?.name}? They will be visible in matching again.`
                : `Are you sure you want to deactivate ${togglingDriver?.name}? They will no longer appear in matching.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleActive} disabled={isToggling} className={togglingDriver?.isActive === false ? "" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}>
              {isToggling ? "Processing..." : togglingDriver?.isActive === false ? "Reactivate" : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
