"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Truck,
  User,
  MapPin,
  DollarSign,
  Calendar,
  ShieldCheck,
  Mail,
  Building2
} from "lucide-react";
import type { Driver, Load } from "@/lib/data";
import type { LoadMatchScore } from "@/lib/matching";
import { useUser, useFirestore } from "@/firebase";
import { collection, addDoc, doc, getDoc } from "firebase/firestore";
import { showSuccess, showError } from "@/lib/toast-utils";
import { notify } from "@/lib/notifications";
import { getComplianceStatus } from "@/lib/compliance";

type DriverWithOwner = Driver & { ownerId: string };
type LoadWithOwner = Load & { ownerId: string };

interface DriverMatchRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: DriverWithOwner;
  loadMatch: LoadMatchScore;
  onSuccess?: () => void;
}

export function DriverMatchRequestModal({
  open,
  onOpenChange,
  driver,
  loadMatch,
  onSuccess,
}: DriverMatchRequestModalProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rate, setRate] = useState<string>(loadMatch.load.price?.toString() || "");
  const [pickupDate, setPickupDate] = useState<string>(loadMatch.load.pickupDate || "");
  const [notes, setNotes] = useState<string>("");
  const [loadOwnerEmail, setLoadOwnerEmail] = useState<string>("");
  const [loadOwnerName, setLoadOwnerName] = useState<string>("");

  const load = loadMatch.load as LoadWithOwner;
  const complianceStatus = getComplianceStatus(driver);

  // Fetch load owner info when modal opens
  useEffect(() => {
    async function fetchLoadOwnerInfo() {
      if (!firestore || !load.ownerId) return;

      try {
        const loadOwnerDoc = await getDoc(doc(firestore, `owner_operators/${load.ownerId}`));
        if (loadOwnerDoc.exists()) {
          const loadOwnerData = loadOwnerDoc.data();
          setLoadOwnerEmail(loadOwnerData?.contactEmail || loadOwnerData?.email || "");
          setLoadOwnerName(loadOwnerData?.legalName || loadOwnerData?.companyName || "Unknown");
        }
      } catch (error) {
        console.error("Error fetching load owner info:", error);
      }
    }

    if (open) {
      fetchLoadOwnerInfo();
    }
  }, [open, firestore, load.ownerId]);

  const handleSubmit = async () => {
    if (!firestore || !user) return;

    if (!rate || parseFloat(rate) <= 0) {
      showError("Please enter a valid rate");
      return;
    }

    setIsSubmitting(true);

    try {
      // Get driver owner (current user) info
      const driverOwnerDoc = await getDoc(doc(firestore, `owner_operators/${user.uid}`));
      const driverOwnerData = driverOwnerDoc.exists() ? driverOwnerDoc.data() : null;
      const driverOwnerName = driverOwnerData?.legalName || driverOwnerData?.companyName || 'Unknown';
      const driverOwnerEmail = driverOwnerData?.contactEmail || '';

      // Get load owner info
      const loadOwnerId = load.ownerId;
      const loadOwnerDoc = await getDoc(doc(firestore, `owner_operators/${loadOwnerId}`));
      const loadOwnerData = loadOwnerDoc.exists() ? loadOwnerDoc.data() : null;
      const loadOwnerNameFetched = loadOwnerData?.legalName || loadOwnerData?.companyName || 'Unknown';
      const loadOwnerEmailFetched = loadOwnerData?.contactEmail || '';

      // Calculate expiry (48 hours from now)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48);

      // Build match document
      const matchData: Record<string, any> = {
        // Load info
        loadId: load.id,
        loadOwnerId: loadOwnerId,
        loadOwnerName: loadOwnerNameFetched,
        loadOwnerEmail: loadOwnerEmailFetched,

        // Driver info
        driverId: driver.id,
        driverOwnerId: user.uid,
        driverName: driver.name,
        driverOwnerName,
        driverOwnerEmail,

        // Bidirectional matching - driver owner initiated, load owner responds
        initiatedBy: 'driver_owner',
        recipientOwnerId: loadOwnerId,

        // Match details
        status: 'pending',
        matchScore: loadMatch.score ?? 0,

        // Terms
        originalTerms: {
          rate: parseFloat(rate),
        },

        // Timestamps
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),

        // Snapshots
        loadSnapshot: {
          origin: load.origin,
          destination: load.destination,
          cargo: load.cargo,
          weight: load.weight,
        },
        driverSnapshot: {
          name: driver.name,
          location: driver.location,
          vehicleType: driver.vehicleType,
        },
      };

      // Only add optional fields if they have values
      if (pickupDate) {
        matchData.originalTerms.pickupDate = pickupDate;
      }
      if (notes) {
        matchData.originalTerms.notes = notes;
      }
      if (load.price) {
        matchData.loadSnapshot.price = load.price;
      }
      if (driver.rating) {
        matchData.driverSnapshot.rating = driver.rating;
      }

      // Save to Firestore
      const matchRef = await addDoc(collection(firestore, "matches"), matchData);

      console.log("Driver-initiated match request created:", matchRef.id);

      // Send email notification to load owner
      if (loadOwnerEmailFetched) {
        notify.driverOfferRequest({
          loadOwnerEmail: loadOwnerEmailFetched,
          loadOwnerName: loadOwnerNameFetched,
          driverOwnerName,
          driverName: driver.name,
          loadOrigin: load.origin,
          loadDestination: load.destination,
          rate: parseFloat(rate),
          matchId: matchRef.id,
        }).catch(err => console.error('Failed to send driver offer notification:', err));
      }

      showSuccess("Driver offer sent! The load owner has 48 hours to respond.");
      onOpenChange(false);

      // Reset form
      setRate(load.price?.toString() || "");
      setPickupDate(load.pickupDate || "");
      setNotes("");

      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Error creating driver offer:", error);
      showError("Failed to send driver offer. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Offer Your Driver
          </DialogTitle>
          <DialogDescription>
            Offer your driver for this load. The load owner has 48 hours to respond.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Driver Summary */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">Your Driver</h4>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {driver.name}
                </p>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {driver.location}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary">{driver.vehicleType}</Badge>
                  <Badge className="bg-green-100 text-green-800 border-green-300">
                    <ShieldCheck className="h-3 w-3 mr-1" />
                    {complianceStatus}
                  </Badge>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-primary">
                  Score: {loadMatch.score}/100
                </div>
              </div>
            </div>
          </div>

          {/* Load Summary */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">Load Details</h4>
            <p className="text-sm font-semibold flex items-center gap-2">
              <Truck className="h-4 w-4" />
              {load.origin} → {load.destination}
            </p>
            <p className="text-sm text-muted-foreground">
              {load.cargo} • {load.weight.toLocaleString()} lbs
            </p>
            {loadOwnerName && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Building2 className="h-3 w-3" />
                {loadOwnerName}
              </p>
            )}
            {loadOwnerEmail && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Mail className="h-3 w-3" />
                {loadOwnerEmail}
              </p>
            )}
            {load.price && (
              <p className="text-sm font-medium text-green-600 mt-1">
                Listed: ${load.price.toLocaleString()}
              </p>
            )}
          </div>

          {/* Terms Form */}
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="rate">Proposed Rate ($) *</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="rate"
                  type="number"
                  placeholder="Enter rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="pickupDate">Pickup Date (Optional)</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="pickupDate"
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Any additional information for the load owner..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            The load owner will receive this offer and can accept, decline, or send a counter offer.
            This offer expires in 48 hours.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              "Send Driver Offer"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
