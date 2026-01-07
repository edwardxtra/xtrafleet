"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  CheckCircle,
  Clock,
  User,
  Truck,
  DollarSign,
  Shield,
  Loader2,
  ArrowLeft,
  AlertCircle,
  PenLine,
  Phone,
  Mail,
  Play,
  Square,
  Timer,
  PartyPopper,
} from "lucide-react";
import { useUser, useFirestore } from "@/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import type { TLA, InsuranceOption } from "@/lib/data";
import { showSuccess, showError } from "@/lib/toast-utils";
import { format, parseISO, differenceInMinutes } from "date-fns";
import Link from "next/link";
import { notify } from "@/lib/notifications";

export default function TLAPage() {
  const params = useParams();
  const router = useRouter();
  const tlaId = params.id as string;
  
  const { user } = useUser();
  const firestore = useFirestore();
  
  const [tla, setTla] = useState<TLA | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [isStartingTrip, setIsStartingTrip] = useState(false);
  const [isEndingTrip, setIsEndingTrip] = useState(false);
  const [showTripCompletedModal, setShowTripCompletedModal] = useState(false);
  const [markDriverAvailable, setMarkDriverAvailable] = useState(true);
  
  // Signing form state
  const [signatureName, setSignatureName] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [insuranceOption, setInsuranceOption] = useState<InsuranceOption | "">("");

  // Fetch TLA
  useEffect(() => {
    async function fetchTLA() {
      if (!firestore || !tlaId) return;
      
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
    }
    
    fetchTLA();
  }, [firestore, tlaId]);

  // Check user roles
  const isLessor = tla && user ? user.uid === tla.lessor.ownerOperatorId : false;
  const isLessee = tla && user ? user.uid === tla.lessee.ownerOperatorId : false;
  const isInvolved = isLessor || isLessee;

  // Check if user is the driver (need to fetch driver data)
  const [isDriver, setIsDriver] = useState(false);
  
  useEffect(() => {
    async function checkIfDriver() {
      if (!firestore || !user || !tla) return;
      
      try {
        const userDoc = await getDoc(doc(firestore, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.role === 'driver' && userData.driverId === tla.driver.id) {
            setIsDriver(true);
          }
        }
      } catch (err) {
        console.error("Error checking driver status:", err);
      }
    }
    
    checkIfDriver();
  }, [firestore, user, tla]);

  // Can start/end trip: Lessor (Driver Owner) or the actual Driver
  const canControlTrip = isLessor || isDriver;

  // Signing role logic - UPDATED to allow either party to sign first
  const signingRole = (): 'lessor' | 'lessee' | null => {
    if (!tla || !user) return null;
    
    // Check if TLA is in a signable state (not yet fully signed, not voided, not in progress/completed)
    const signableStatuses = ['pending_lessor', 'pending_lessee', 'draft'];
    if (!signableStatuses.includes(tla.status)) return null;
    
    // Lessor can sign if they haven't signed yet
    if (isLessor && !tla.lessorSignature) {
      return 'lessor';
    }
    
    // Lessee can sign if they haven't signed yet
    if (isLessee && !tla.lesseeSignature) {
      return 'lessee';
    }
    
    return null;
  };

  const canSign = () => signingRole() !== null;
  const needsInsuranceSelection = signingRole() === 'lessee' && !tla?.insurance?.option;

  // Format duration helper
  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins} minutes`;
    if (mins === 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    return `${hours} hour${hours > 1 ? 's' : ''} ${mins} min`;
  };

  // Handle Start Trip
  const handleStartTrip = async () => {
    if (!firestore || !tla || !user) return;
    
    setIsStartingTrip(true);
    
    try {
      const now = new Date().toISOString();
      
      let userName = user.email || 'Unknown';
      if (isLessor) {
        userName = tla.lessor.legalName;
      } else if (isDriver) {
        userName = tla.driver.name;
      }
      
      const updateData = {
        status: 'in_progress',
        tripTracking: {
          startedAt: now,
          startedBy: user.uid,
          startedByName: userName,
        },
        updatedAt: now,
      };
      
      await updateDoc(doc(firestore, `tlas/${tlaId}`), updateData);
      
      if (tla.matchId) {
        await updateDoc(doc(firestore, `matches/${tla.matchId}`), {
          status: 'in_progress',
        }).catch(err => console.warn("Could not update match:", err));
      }
      
      try {
        const driverRef = doc(firestore, `owner_operators/${tla.lessor.ownerOperatorId}/drivers/${tla.driver.id}`);
        await updateDoc(driverRef, { availability: 'On-trip' });
      } catch (err) {
        console.warn("Could not update driver availability:", err);
      }
      
      notify.tripStarted({
        recipientEmail: tla.lessor.contactEmail,
        recipientName: tla.lessor.legalName,
        driverName: tla.driver.name,
        loadOrigin: tla.trip.origin,
        loadDestination: tla.trip.destination,
        rate: tla.payment.amount,
        tlaId: tlaId,
        startedByName: userName,
      }).catch(err => console.error('Failed to notify lessor:', err));
      
      notify.tripStarted({
        recipientEmail: tla.lessee.contactEmail,
        recipientName: tla.lessee.legalName,
        driverName: tla.driver.name,
        loadOrigin: tla.trip.origin,
        loadDestination: tla.trip.destination,
        rate: tla.payment.amount,
        tlaId: tlaId,
        startedByName: userName,
      }).catch(err => console.error('Failed to notify lessee:', err));
      
      showSuccess("Trip started! Both parties have been notified.");
      
      const updatedDoc = await getDoc(doc(firestore, `tlas/${tlaId}`));
      if (updatedDoc.exists()) {
        setTla({ id: updatedDoc.id, ...updatedDoc.data() } as TLA);
      }
      
    } catch (err) {
      console.error("Error starting trip:", err);
      showError("Failed to start trip. Please try again.");
    } finally {
      setIsStartingTrip(false);
    }
  };

  // Handle End Trip
  const handleEndTrip = async () => {
    if (!firestore || !tla || !user || !tla.tripTracking?.startedAt) return;
    
    setIsEndingTrip(true);
    
    try {
      const now = new Date().toISOString();
      const startedAt = parseISO(tla.tripTracking.startedAt);
      const endedAt = new Date();
      const durationMinutes = differenceInMinutes(endedAt, startedAt);
      
      let userName = user.email || 'Unknown';
      if (isLessor) {
        userName = tla.lessor.legalName;
      } else if (isDriver) {
        userName = tla.driver.name;
      }
      
      const updateData = {
        status: 'completed',
        tripTracking: {
          ...tla.tripTracking,
          endedAt: now,
          endedBy: user.uid,
          endedByName: userName,
          durationMinutes: durationMinutes,
        },
        updatedAt: now,
      };
      
      await updateDoc(doc(firestore, `tlas/${tlaId}`), updateData);
      
      if (tla.matchId) {
        await updateDoc(doc(firestore, `matches/${tla.matchId}`), {
          status: 'completed',
        }).catch(err => console.warn("Could not update match:", err));
      }
      
      if (tla.matchId) {
        try {
          const matchDoc = await getDoc(doc(firestore, `matches/${tla.matchId}`));
          if (matchDoc.exists()) {
            const matchData = matchDoc.data();
            if (matchData.loadId && matchData.loadOwnerId) {
              await updateDoc(
                doc(firestore, `owner_operators/${matchData.loadOwnerId}/loads/${matchData.loadId}`),
                { status: 'Delivered' }
              );
            }
          }
        } catch (err) {
          console.warn("Could not update load status:", err);
        }
      }
      
      const tripDurationStr = formatDuration(durationMinutes);
      
      notify.tripCompleted({
        recipientEmail: tla.lessor.contactEmail,
        recipientName: tla.lessor.legalName,
        driverName: tla.driver.name,
        loadOrigin: tla.trip.origin,
        loadDestination: tla.trip.destination,
        rate: tla.payment.amount,
        tlaId: tlaId,
        endedByName: userName,
        tripDuration: tripDurationStr,
      }).catch(err => console.error('Failed to notify lessor:', err));
      
      notify.tripCompleted({
        recipientEmail: tla.lessee.contactEmail,
        recipientName: tla.lessee.legalName,
        driverName: tla.driver.name,
        loadOrigin: tla.trip.origin,
        loadDestination: tla.trip.destination,
        rate: tla.payment.amount,
        tlaId: tlaId,
        endedByName: userName,
        tripDuration: tripDurationStr,
      }).catch(err => console.error('Failed to notify lessee:', err));
      
      const updatedDoc = await getDoc(doc(firestore, `tlas/${tlaId}`));
      if (updatedDoc.exists()) {
        setTla({ id: updatedDoc.id, ...updatedDoc.data() } as TLA);
      }
      
      setShowTripCompletedModal(true);
      
    } catch (err) {
      console.error("Error ending trip:", err);
      showError("Failed to end trip. Please try again.");
    } finally {
      setIsEndingTrip(false);
    }
  };

  // Handle post-trip driver availability
  const handleTripCompletedConfirm = async () => {
    if (!firestore || !tla) {
      setShowTripCompletedModal(false);
      return;
    }
    
    try {
      if (markDriverAvailable) {
        const driverRef = doc(firestore, `owner_operators/${tla.lessor.ownerOperatorId}/drivers/${tla.driver.id}`);
        await updateDoc(driverRef, { availability: 'Available' });
        showSuccess("Trip completed! Driver marked as Available.");
      } else {
        const driverRef = doc(firestore, `owner_operators/${tla.lessor.ownerOperatorId}/drivers/${tla.driver.id}`);
        await updateDoc(driverRef, { availability: 'Off-duty' });
        showSuccess("Trip completed! Driver marked as Off-duty.");
      }
    } catch (err) {
      console.warn("Could not update driver availability:", err);
      showSuccess("Trip completed!");
    }
    
    setShowTripCompletedModal(false);
  };

  const handleSign = async () => {
    const role = signingRole();
    if (!firestore || !tla || !user || !role) return;
    
    if (!signatureName.trim()) {
      showError("Please enter your name to sign");
      return;
    }
    
    if (!agreeToTerms) {
      showError("Please agree to the terms to sign");
      return;
    }
    
    if (role === 'lessee' && !insuranceOption) {
      showError("Please select an insurance option");
      return;
    }
    
    setIsSigning(true);
    
    try {
      const signature = {
        signedBy: user.uid,
        signedByName: signatureName,
        signedByRole: role,
        signedAt: new Date().toISOString(),
      };
      
      const updateData: Record<string, any> = {
        updatedAt: new Date().toISOString(),
      };
      
      // Determine the other party's signature status
      const otherPartyHasSigned = role === 'lessor' ? !!tla.lesseeSignature : !!tla.lessorSignature;
      
      if (role === 'lessor') {
        updateData.lessorSignature = signature;
        
        if (otherPartyHasSigned) {
          // Both have now signed
          updateData.status = 'signed';
          updateData.signedAt = new Date().toISOString();
          
          // Notify both parties that TLA is fully signed
          notify.tlaSigned({
            recipientEmail: tla.lessor.contactEmail,
            recipientName: tla.lessor.legalName,
            driverName: tla.driver.name,
            loadOrigin: tla.trip.origin,
            loadDestination: tla.trip.destination,
            rate: tla.payment.amount,
            tlaId: tlaId,
          }).catch(err => console.error('Failed to send TLA signed notification to lessor:', err));
          
          notify.tlaSigned({
            recipientEmail: tla.lessee.contactEmail,
            recipientName: tla.lessee.legalName,
            driverName: tla.driver.name,
            loadOrigin: tla.trip.origin,
            loadDestination: tla.trip.destination,
            rate: tla.payment.amount,
            tlaId: tlaId,
          }).catch(err => console.error('Failed to send TLA signed notification to lessee:', err));
        } else {
          // Waiting for lessee to sign
          updateData.status = 'pending_lessee';
          
          notify.tlaReady({
            recipientEmail: tla.lessee.contactEmail,
            recipientName: tla.lessee.legalName,
            role: 'lessee',
            driverName: tla.driver.name,
            loadOrigin: tla.trip.origin,
            loadDestination: tla.trip.destination,
            rate: tla.payment.amount,
            tlaId: tlaId,
          }).catch(err => console.error('Failed to send TLA ready notification:', err));
        }
        
      } else if (role === 'lessee') {
        updateData.lesseeSignature = signature;
        updateData.insurance = {
          option: insuranceOption,
          confirmedAt: new Date().toISOString(),
          confirmedBy: user.uid,
        };
        
        if (otherPartyHasSigned) {
          // Both have now signed
          updateData.status = 'signed';
          updateData.signedAt = new Date().toISOString();
          
          // Notify both parties that TLA is fully signed
          notify.tlaSigned({
            recipientEmail: tla.lessor.contactEmail,
            recipientName: tla.lessor.legalName,
            driverName: tla.driver.name,
            loadOrigin: tla.trip.origin,
            loadDestination: tla.trip.destination,
            rate: tla.payment.amount,
            tlaId: tlaId,
          }).catch(err => console.error('Failed to send TLA signed notification to lessor:', err));
          
          notify.tlaSigned({
            recipientEmail: tla.lessee.contactEmail,
            recipientName: tla.lessee.legalName,
            driverName: tla.driver.name,
            loadOrigin: tla.trip.origin,
            loadDestination: tla.trip.destination,
            rate: tla.payment.amount,
            tlaId: tlaId,
          }).catch(err => console.error('Failed to send TLA signed notification to lessee:', err));
        } else {
          // Waiting for lessor to sign
          updateData.status = 'pending_lessor';
          
          notify.tlaReady({
            recipientEmail: tla.lessor.contactEmail,
            recipientName: tla.lessor.legalName,
            role: 'lessor',
            driverName: tla.driver.name,
            loadOrigin: tla.trip.origin,
            loadDestination: tla.trip.destination,
            rate: tla.payment.amount,
            tlaId: tlaId,
          }).catch(err => console.error('Failed to send TLA ready notification:', err));
        }
      }
      
      await updateDoc(doc(firestore, `tlas/${tlaId}`), updateData);
      
      // Update match status if both signed
      if (updateData.status === 'signed' && tla.matchId) {
        try {
          await updateDoc(doc(firestore, `matches/${tla.matchId}`), {
            status: 'tla_signed',
          });
        } catch (matchErr) {
          console.warn("Could not update match status:", matchErr);
        }
      }
      
      showSuccess(
        otherPartyHasSigned 
          ? "TLA fully signed! Trip can now begin." 
          : `Signed! Waiting for ${role === 'lessor' ? 'lessee' : 'lessor'} to sign.`
      );
      
      const updatedDoc = await getDoc(doc(firestore, `tlas/${tlaId}`));
      if (updatedDoc.exists()) {
        setTla({ id: updatedDoc.id, ...updatedDoc.data() } as TLA);
      }
      
      setSignatureName("");
      setAgreeToTerms(false);
      
    } catch (err) {
      console.error("Error signing TLA:", err);
      showError("Failed to sign. Please try again.");
    } finally {
      setIsSigning(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Not specified";
    try {
      return format(parseISO(dateString), "MMM d, yyyy 'at' h:mm a");
    } catch {
      return dateString;
    }
  };

  const getStatusBadge = (status: TLA['status']) => {
    switch (status) {
      case 'draft':
        return <Badge variant="outline">Draft</Badge>;
      case 'pending_lessor':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Awaiting Lessor</Badge>;
      case 'pending_lessee':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Awaiting Lessee</Badge>;
      case 'signed':
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Signed</Badge>;
      case 'in_progress':
        return <Badge variant="default" className="bg-blue-600"><Truck className="h-3 w-3 mr-1" />In Progress</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-purple-600"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'voided':
        return <Badge variant="destructive">Voided</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Helper to get waiting message
  const getWaitingMessage = () => {
    if (!tla || !user) return null;
    
    if (tla.status === 'pending_lessor') {
      if (isLessee && tla.lesseeSignature) {
        return 'You have signed. Waiting for the driver owner (lessor) to sign.';
      }
    }
    
    if (tla.status === 'pending_lessee') {
      if (isLessor && tla.lessorSignature) {
        return 'You have signed. Waiting for the load owner (lessee) to sign.';
      }
    }
    
    return null;
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[400px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !tla) {
    return (
      <div className="max-w-4xl mx-auto">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || "TLA not found"}</AlertDescription>
        </Alert>
        <Button asChild variant="link" className="mt-4">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2">
            <Link href="/dashboard/agreements">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Agreements
            </Link>
          </Button>
          <h1 className="text-2xl font-bold font-headline flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Trip Lease Agreement
          </h1>
          <p className="text-muted-foreground">
            {tla.trip.origin} → {tla.trip.destination}
          </p>
        </div>
        {getStatusBadge(tla.status)}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main TLA Content */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Agreement Details</CardTitle>
            <CardDescription>
              FMCSA-Compliant Short-Term Lease – Driver Only
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-6 text-sm">
                {/* Parties */}
                <div>
                  <h3 className="font-semibold mb-3">Parties</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Fleet A (Lessor - Driver Provider)</p>
                      <p className="font-semibold">{tla.lessor.legalName}</p>
                      <p className="text-muted-foreground text-xs">{tla.lessor.address}</p>
                      {tla.lessor.dotNumber && <p className="text-xs">DOT: {tla.lessor.dotNumber}</p>}
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Fleet B (Lessee - Hiring Carrier)</p>
                      <p className="font-semibold">{tla.lessee.legalName}</p>
                      <p className="text-muted-foreground text-xs">{tla.lessee.address}</p>
                      {tla.lessee.dotNumber && <p className="text-xs">DOT: {tla.lessee.dotNumber}</p>}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Driver */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Driver
                  </h3>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-semibold">{tla.driver.name}</p>
                    {tla.driver.cdlNumber && <p className="text-xs">CDL: {tla.driver.cdlNumber}</p>}
                    {tla.driver.medicalCardExpiry && (
                      <p className="text-xs">Medical Card Expires: {formatDate(tla.driver.medicalCardExpiry)}</p>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Trip Details */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    Trip Details
                  </h3>
                  <div className="grid gap-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Route:</span>
                      <span className="font-medium">{tla.trip.origin} → {tla.trip.destination}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cargo:</span>
                      <span>{tla.trip.cargo}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Weight:</span>
                      <span>{tla.trip.weight.toLocaleString()} lbs</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Start Date:</span>
                      <span>{formatDate(tla.trip.startDate)}</span>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Payment */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Payment Terms
                  </h3>
                  <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">
                      ${tla.payment.amount.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Due upon trip completion
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Insurance */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Insurance & Liability
                  </h3>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <p>Fleet B assumes liability for all vehicle and driver operations during the trip.</p>
                    <p>Fleet A confirms that the Driver holds a valid CDL, possesses a current medical certificate, and has a compliant driver qualification file.</p>
                    {tla.insurance?.option && (
                      <div className="mt-3 p-2 bg-muted rounded">
                        <p className="font-medium text-foreground">
                          {tla.insurance.option === 'existing_policy' 
                            ? '☑ Lessee confirms existing insurance policy covers this trip'
                            : '☑ Lessee elected trip-based coverage'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Trip Tracking Info (if started) */}
                {tla.tripTracking?.startedAt && (
                  <>
                    <div>
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <Timer className="h-4 w-4" />
                        Trip Tracking
                      </h3>
                      <div className="grid gap-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Started:</span>
                          <span>{formatDate(tla.tripTracking.startedAt)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Started By:</span>
                          <span>{tla.tripTracking.startedByName}</span>
                        </div>
                        {tla.tripTracking.endedAt && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Ended:</span>
                              <span>{formatDate(tla.tripTracking.endedAt)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Ended By:</span>
                              <span>{tla.tripTracking.endedByName}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Duration:</span>
                              <span className="font-medium">{formatDuration(tla.tripTracking.durationMinutes || 0)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <Separator />
                  </>
                )}

                {/* Legal Terms Summary */}
                <div>
                  <h3 className="font-semibold mb-3">Terms & Conditions</h3>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <p><strong>Control:</strong> Fleet B has exclusive possession, control, and responsibility for the Driver during the trip.</p>
                    <p><strong>Indemnification:</strong> Each party agrees to indemnify and hold harmless the other against claims caused by its negligence.</p>
                    <p><strong>Platform:</strong> XtraFleet Technologies, Inc. is a neutral technology facilitator and assumes no liability.</p>
                    <p><strong>Retention:</strong> Both parties shall retain documentation for a minimum of three (3) years.</p>
                    <p><strong>Governing Law:</strong> This Agreement is governed by Delaware law and applicable FMCSA regulations.</p>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right Sidebar */}
        <div className="space-y-4">
          {/* Signatures Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Signatures</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Lessor Signature */}
              <div className={`p-3 rounded-lg ${tla.lessorSignature ? 'bg-green-50 dark:bg-green-950/20' : 'bg-muted/50'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">Lessor (Driver Owner)</span>
                  {tla.lessorSignature ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                {tla.lessorSignature ? (
                  <div className="text-xs">
                    <p className="font-medium">{tla.lessorSignature.signedByName}</p>
                    <p className="text-muted-foreground">{formatDate(tla.lessorSignature.signedAt)}</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Awaiting signature</p>
                )}
              </div>

              {/* Lessee Signature */}
              <div className={`p-3 rounded-lg ${tla.lesseeSignature ? 'bg-green-50 dark:bg-green-950/20' : 'bg-muted/50'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">Lessee (Load Owner)</span>
                  {tla.lesseeSignature ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                {tla.lesseeSignature ? (
                  <div className="text-xs">
                    <p className="font-medium">{tla.lesseeSignature.signedByName}</p>
                    <p className="text-muted-foreground">{formatDate(tla.lesseeSignature.signedAt)}</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Awaiting signature</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Trip Controls - Show after TLA is signed */}
          {(tla.status === 'signed' || tla.status === 'in_progress') && canControlTrip && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Trip Controls
                </CardTitle>
                <CardDescription>
                  {isDriver ? "Manage your trip" : "Manage the trip for your driver"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {tla.status === 'signed' && (
                  <Button 
                    onClick={handleStartTrip} 
                    disabled={isStartingTrip}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    {isStartingTrip ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Start Trip
                      </>
                    )}
                  </Button>
                )}
                
                {tla.status === 'in_progress' && (
                  <>
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
                        <Truck className="h-4 w-4" />
                        Trip in progress
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Started {formatDate(tla.tripTracking?.startedAt)}
                      </p>
                    </div>
                    <Button 
                      onClick={handleEndTrip} 
                      disabled={isEndingTrip}
                      variant="destructive"
                      className="w-full"
                    >
                      {isEndingTrip ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Ending...
                        </>
                      ) : (
                        <>
                          <Square className="h-4 w-4 mr-2" />
                          End Trip
                        </>
                      )}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Completed Trip Summary */}
          {tla.status === 'completed' && (
            <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-purple-700 dark:text-purple-300">
                  <PartyPopper className="h-5 w-5" />
                  Trip Completed!
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration:</span>
                  <span className="font-medium">{formatDuration(tla.tripTracking?.durationMinutes || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Completed:</span>
                  <span>{formatDate(tla.tripTracking?.endedAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment:</span>
                  <span className="font-medium text-green-600">${tla.payment.amount.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sign Form */}
          {canSign() && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <PenLine className="h-5 w-5" />
                  Sign Agreement
                </CardTitle>
                <CardDescription>
                  {signingRole() === 'lessor' 
                    ? 'Sign as the driver provider (Lessor)' 
                    : 'Sign as the hiring carrier (Lessee)'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Insurance Selection (Lessee only) */}
                {needsInsuranceSelection && (
                  <div className="space-y-3">
                    <Label>Insurance Confirmation *</Label>
                    <RadioGroup 
                      value={insuranceOption} 
                      onValueChange={(v) => setInsuranceOption(v as InsuranceOption)}
                    >
                      <div className="flex items-start space-x-2">
                        <RadioGroupItem value="existing_policy" id="existing" />
                        <Label htmlFor="existing" className="text-sm font-normal cursor-pointer">
                          I confirm that my active insurance policy includes leased or temporary drivers for this trip.
                        </Label>
                      </div>
                      <div className="flex items-start space-x-2">
                        <RadioGroupItem value="trip_coverage" id="trip" />
                        <Label htmlFor="trip" className="text-sm font-normal cursor-pointer">
                          I elect to obtain trip-based coverage through an approved third-party provider.
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                )}

                {/* Signature Name */}
                <div className="space-y-2">
                  <Label htmlFor="signatureName">Full Legal Name *</Label>
                  <Input
                    id="signatureName"
                    placeholder="Type your full name to sign"
                    value={signatureName}
                    onChange={(e) => setSignatureName(e.target.value)}
                  />
                </div>

                {/* Agreement Checkbox */}
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="agreeToTerms"
                    checked={agreeToTerms}
                    onCheckedChange={(checked) => setAgreeToTerms(checked === true)}
                  />
                  <Label htmlFor="agreeToTerms" className="text-sm font-normal cursor-pointer">
                    I have read and agree to all terms and conditions of this Trip Lease Agreement.
                  </Label>
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={handleSign} 
                  disabled={isSigning || !signatureName || !agreeToTerms || (needsInsuranceSelection && !insuranceOption)}
                  className="w-full"
                >
                  {isSigning ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Signing...
                    </>
                  ) : (
                    <>
                      <PenLine className="h-4 w-4 mr-2" />
                      Sign Agreement
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Status Messages */}
          {getWaitingMessage() && (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                {getWaitingMessage()}
              </AlertDescription>
            </Alert>
          )}

          {tla.status === 'signed' && !canControlTrip && (
            <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                This agreement has been fully signed. Waiting for the driver owner to start the trip.
              </AlertDescription>
            </Alert>
          )}

          {tla.status === 'in_progress' && !canControlTrip && (
            <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
              <Truck className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800 dark:text-blue-200">
                Trip is currently in progress. Started {formatDate(tla.tripTracking?.startedAt)}.
              </AlertDescription>
            </Alert>
          )}

          {/* Contact Information - Show after TLA is signed/in_progress/completed */}
          {(tla.status === 'signed' || tla.status === 'in_progress' || tla.status === 'completed') && isInvolved && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Contact Information
                </CardTitle>
                <CardDescription>
                  Coordinate trip details with the other party
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Lessor sees Lessee contact info */}
                {isLessor && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Load Owner (Lessee)</p>
                      <p className="font-semibold">{tla.lessee.legalName}</p>
                    </div>
                    {tla.lessee.contactEmail && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <a 
                          href={`mailto:${tla.lessee.contactEmail}`} 
                          className="text-primary hover:underline text-sm"
                        >
                          {tla.lessee.contactEmail}
                        </a>
                      </div>
                    )}
                    {tla.lessee.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <a 
                          href={`tel:${tla.lessee.phone}`} 
                          className="text-primary hover:underline text-sm"
                        >
                          {tla.lessee.phone}
                        </a>
                      </div>
                    )}
                    {!tla.lessee.contactEmail && !tla.lessee.phone && (
                      <p className="text-sm text-muted-foreground">No contact information available.</p>
                    )}
                  </div>
                )}
                
                {/* Lessee sees Lessor and Driver contact info */}
                {isLessee && (
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Driver Owner (Lessor)</p>
                        <p className="font-semibold">{tla.lessor.legalName}</p>
                      </div>
                      {tla.lessor.contactEmail && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <a 
                            href={`mailto:${tla.lessor.contactEmail}`} 
                            className="text-primary hover:underline text-sm"
                          >
                            {tla.lessor.contactEmail}
                          </a>
                        </div>
                      )}
                      {tla.lessor.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <a 
                            href={`tel:${tla.lessor.phone}`} 
                            className="text-primary hover:underline text-sm"
                          >
                            {tla.lessor.phone}
                          </a>
                        </div>
                      )}
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Driver</p>
                        <p className="font-semibold">{tla.driver.name}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Contact the Driver Owner to coordinate directly with the driver.
                      </p>
                    </div>
                  </div>
                )}

                {isLessor && isLessee && (
                  <div className="mt-2 p-2 bg-muted/50 rounded text-xs text-muted-foreground">
                    <p>You are both the lessor and lessee in this agreement (testing mode).</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {!isInvolved && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You are not a party to this agreement.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      {/* Trip Completed Modal */}
      <Dialog open={showTripCompletedModal} onOpenChange={setShowTripCompletedModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PartyPopper className="h-5 w-5 text-green-600" />
              Trip Completed!
            </DialogTitle>
            <DialogDescription>
              The trip from {tla.trip.origin} to {tla.trip.destination} has been completed successfully.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Driver:</span>
                <span className="font-medium">{tla.driver.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Duration:</span>
                <span className="font-medium">{formatDuration(tla.tripTracking?.durationMinutes || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Payment:</span>
                <span className="font-medium text-green-600">${tla.payment.amount.toLocaleString()}</span>
              </div>
            </div>
            
            {(isLessor || isDriver) && (
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="markAvailable"
                  checked={markDriverAvailable}
                  onCheckedChange={(checked) => setMarkDriverAvailable(checked === true)}
                />
                <div>
                  <Label htmlFor="markAvailable" className="cursor-pointer">
                    Mark {tla.driver.name} as Available
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Uncheck to mark as Off-duty instead
                  </p>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button onClick={handleTripCompletedConfirm} className="w-full">
              <CheckCircle className="h-4 w-4 mr-2" />
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
