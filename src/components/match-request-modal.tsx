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
  Star,
  CheckCircle,
  Mail
} from "lucide-react";
import type { Load, Driver, Match } from "@/lib/data";
import type { MatchScore } from "@/lib/matching";
import { useUser, useFirestore } from "@/firebase";
import { collection, addDoc, doc, getDoc } from "firebase/firestore";
import { showSuccess, showError } from "@/lib/toast-utils";
import { notify } from "@/lib/notifications";

interface MatchRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  load: Load;
  matchScore: MatchScore;
  onSuccess?: () => void;
}

export function MatchRequestModal({
  open,
  onOpenChange,
  load,
  matchScore,
  onSuccess,
}: MatchRequestModalProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rate, setRate] = useState<string>(load.price?.toString() || "");
  const [pickupDate, setPickupDate] = useState<string>(load.pickupDate || "");
  const [notes, setNotes] = useState<string>("");
  const [driverOwnerEmail, setDriverOwnerEmail] = useState<string>("");

  const driver = matchScore.driver;

  // Fetch driver owner email when modal opens
  useEffect(() => {
    async function fetchDriverOwnerEmail() {
      if (!firestore || !driver.ownerId) return;
      
      try {
        const driverOwnerDoc = await getDoc(doc(firestore, `owner_operators/${driver.ownerId}`));
        if (driverOwnerDoc.exists()) {
          const driverOwnerData = driverOwnerDoc.data();
          setDriverOwnerEmail(driverOwnerData?.contactEmail || driverOwnerData?.email || "");
        }
      } catch (error) {
        console.error("Error fetching driver owner email:", error);
      }
    }
    
    if (open) {
      fetchDriverOwnerEmail();
    }
  }, [open, firestore, driver.ownerId]);

  const handleSubmit = async () => {
    if (!firestore || !user) return;

    if (!rate || parseFloat(rate) <= 0) {
      showError("Please enter a valid rate");
      return;
    }

    setIsSubmitting(true);

    try {
      // Get load owner info
      const loadOwnerDoc = await getDoc(doc(firestore, `owner_operators/${user.uid}`));
      const loadOwnerData = loadOwnerDoc.exists() ? loadOwnerDoc.data() : null;
      const loadOwnerName = loadOwnerData?.legalName || loadOwnerData?.companyName || 'Unknown';
      const loadOwnerEmail = loadOwnerData?.contactEmail || '';

      // Get driver owner info
      const driverOwnerId = driver.ownerId || user.uid;
      const driverOwnerDoc = await getDoc(doc(firestore, `owner_operators/${driverOwnerId}`));
      const driverOwnerData = driverOwnerDoc.exists() ? driverOwnerDoc.data() : null;
      const driverOwnerName = driverOwnerData?.legalName || driverOwnerData?.companyName || 'Unknown';
      const driverOwnerEmailFetched = driverOwnerData?.contactEmail || '';

      // Calculate expiry (48 hours from now)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48);

      // Build match document - only include defined values
      const matchData: Record<string, any> = {
        // Load info
        loadId: load.id,
        loadOwnerId: user.uid,
        loadOwnerName,
        loadOwnerEmail, // FIX #1: Add load owner email to match document

        // Driver info
        driverId: driver.id,
        driverOwnerId,
        driverName: driver.name,
        driverOwnerName,

        // Match details
        status: 'pending',
        matchScore: matchScore.score ?? 0,

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

      console.log("Match request created:", matchRef.id);

      // Send email notification to driver owner
      if (driverOwnerEmailFetched) {
        notify.matchRequest({
          driverOwnerEmail: driverOwnerEmailFetched,
          driverOwnerName,
          driverName: driver.name,
          loadOrigin: load.origin,
          loadDestination: load.destination,
          rate: parseFloat(rate),
          matchId: matchRef.id,
        }).catch(err => console.error('Failed to send match request notification:', err));
      }

      showSuccess("Match request sent! The driver owner has 48 hours to respond.");
      onOpenChange(false);
      
      // Reset form
      setRate(load.price?.toString() || "");
      setPickupDate(load.pickupDate || "");
      setNotes("");
      
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Error creating match request:", error);
      showError("Failed to send match request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Send Match Request
          </DialogTitle>
          <DialogDescription>
            Request this driver for your load. The driver owner has 48 hours to respond.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Load Summary */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">Load Details</h4>
            <p className="text-sm font-semibold">
              {load.origin} → {load.destination}
            </p>
            <p className="text-sm text-muted-foreground">
              {load.cargo} • {load.weight.toLocaleString()} lbs
            </p>
          </div>

          {/* Driver Summary */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">Selected Driver</h4>
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
                {driverOwnerEmail && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Mail className="h-3 w-3" />
                    {driverOwnerEmail}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary">{driver.vehicleType}</Badge>
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Compliant
                  </Badge>
                </div>
              </div>
              <div className="text-right">
                {driver.rating && (
                  <div className="flex items-center gap-1 text-sm mb-1">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    {driver.rating.toFixed(1)}
                  </div>
                )}
                <div className="text-sm font-medium text-primary">
                  Score: {matchScore.score}/100
                </div>
              </div>
            </div>
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
                placeholder="Any additional information for the driver owner..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            The driver owner will receive this request and can accept, decline, or send a counter offer.
            This request expires in 48 hours.
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
              "Send Match Request"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
