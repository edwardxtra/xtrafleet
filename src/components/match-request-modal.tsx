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
import { Checkbox } from "@/components/ui/checkbox";
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
  Mail,
  Shield,
} from "lucide-react";
import type { Load } from "@/lib/data";
import type { MatchScore } from "@/lib/matching";
import { useUser, useFirestore } from "@/firebase";
import { collection, addDoc, doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { showSuccess, showError } from "@/lib/toast-utils";
import { notify } from "@/lib/notifications";
import { ATTESTATIONS, buildAttestationEntry, type AttestationType } from "@/lib/attestations";

const BORROWER_ATTESTATIONS: AttestationType[] = [
  'matchBorrowerClearinghouse',
  'matchBorrowerResponsibility',
  'matchBorrowerInsurance',
];

type BorrowerChecks = Record<AttestationType, boolean>;

interface MatchRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  load: Load;
  matchScore: MatchScore;
  onSuccess?: () => void;
}

// Format date to EST timezone
function formatDateEST(dateString: string): string {
  try {
    const date = new Date(dateString);
    const estDate = toZonedTime(date, 'America/New_York');
    return format(estDate, "MMM d, yyyy 'at' h:mm a") + ' EST';
  } catch {
    return dateString;
  }
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
  const [notes, setNotes] = useState<string>("");
  const [driverOwnerEmail, setDriverOwnerEmail] = useState<string>("");
  const [borrowerChecks, setBorrowerChecks] = useState<BorrowerChecks>(
    () =>
      BORROWER_ATTESTATIONS.reduce(
        (acc, t) => ({ ...acc, [t]: false }),
        {} as BorrowerChecks,
      ),
  );
  const allBorrowerChecked = BORROWER_ATTESTATIONS.every(t => borrowerChecks[t]);

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

    if (!load.price || load.price <= 0) {
      showError("Load must have a valid price");
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

        // Bidirectional matching - load owner initiated, driver owner responds
        initiatedBy: 'load_owner',
        recipientOwnerId: driverOwnerId,

        // Match details
        status: 'pending',
        matchScore: matchScore.score ?? 0,

        // Terms - use load's original values
        originalTerms: {
          rate: load.price,
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
      if (load.pickupDate) {
        matchData.originalTerms.pickupDate = load.pickupDate;
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

      // DEV-154 phase 2: record the borrower's match-confirmation attestations
      // against the just-created matchId so we have a contextual audit trail.
      // Non-blocking — if this fails the match is still valid; we just log.
      try {
        const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
        await updateDoc(doc(firestore, 'owner_operators', user.uid), {
          attestations: arrayUnion(
            ...BORROWER_ATTESTATIONS.map(type =>
              buildAttestationEntry(type, user.uid, {
                userAgent,
                context: { matchId: matchRef.id },
              }),
            ),
          ),
        });
      } catch (err) {
        console.error('Failed to record borrower match attestations:', err);
      }

      // Send email notification to driver owner
      if (driverOwnerEmailFetched) {
        notify.matchRequest({
          driverOwnerEmail: driverOwnerEmailFetched,
          driverOwnerName,
          driverName: driver.name,
          loadOrigin: load.origin,
          loadDestination: load.destination,
          rate: load.price,
          matchId: matchRef.id,
        }).catch(err => console.error('Failed to send match request notification:', err));
      }

      showSuccess("Match request sent! The driver owner has 48 hours to respond.");
      onOpenChange(false);

      // Reset form
      setNotes("");
      setBorrowerChecks(
        BORROWER_ATTESTATIONS.reduce(
          (acc, t) => ({ ...acc, [t]: false }),
          {} as BorrowerChecks,
        ),
      );

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
          <DialogTitle className="flex items-center gap-2 text-base md:text-lg">
            <Truck className="h-4 w-4 md:h-5 md:w-5" />
            Send Match Request
          </DialogTitle>
          <DialogDescription className="text-xs md:text-sm">
            Request this driver for your load. The driver owner has 48 hours to respond.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 md:space-y-4 py-2 md:py-4">
          {/* Load Summary */}
          <div className="p-3 md:p-4 bg-muted/50 rounded-lg">
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

          {/* Load Terms (Read-only) */}
          <div className="p-3 md:p-4 border rounded-lg space-y-2">
            <h4 className="font-medium text-sm">Your Terms</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Rate</p>
                <p className="font-semibold text-green-600 flex items-center gap-1">
                  <DollarSign className="h-4 w-4" />
                  {load.price ? `$${load.price.toLocaleString()}` : 'Not specified'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Pickup Date</p>
                <p className="font-semibold flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {load.pickupDate ? formatDateEST(load.pickupDate) : 'Flexible'}
                </p>
              </div>
            </div>
          </div>

          {/* Notes Form */}
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="notes">Message to Driver Owner (Optional)</Label>
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

          {/* DEV-154 phase 2: borrower compliance attestations.
              Required to send the request. Persisted with context.matchId. */}
          <div className="space-y-3 p-3 md:p-4 border rounded-lg bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-600" />
              <h4 className="font-medium text-sm">Compliance Confirmation</h4>
            </div>
            <p className="text-xs text-muted-foreground">
              Required before sending the request. By checking each box you confirm:
            </p>
            <div className="space-y-2.5">
              {BORROWER_ATTESTATIONS.map(type => {
                const def = ATTESTATIONS[type];
                return (
                  <div key={type} className="flex items-start gap-2.5">
                    <Checkbox
                      id={`borrower-${type}`}
                      checked={borrowerChecks[type]}
                      onCheckedChange={(checked) =>
                        setBorrowerChecks(prev => ({ ...prev, [type]: checked === true }))
                      }
                      disabled={isSubmitting}
                      className="mt-0.5"
                    />
                    <Label htmlFor={`borrower-${type}`} className="text-xs leading-relaxed cursor-pointer">
                      {def.text}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !allBorrowerChecked}>
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
