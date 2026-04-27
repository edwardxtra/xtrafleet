import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Play, Square, Truck, PartyPopper, CheckCircle, Shield } from "lucide-react";
import type { TLA } from "@/lib/data";
import { useFirestore } from "@/firebase";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { startTrip, endTrip, updateDriverAvailability } from "@/lib/tla-actions";
import { formatTLADate, formatTripDuration } from "@/lib/tla-utils";
import { ATTESTATIONS, buildAttestationEntry, type AttestationType } from "@/lib/attestations";

const POST_TRIP_ATTESTATIONS: AttestationType[] = [
  'postTripCompleted',
  'postTripNoIncidents',
];
type PostTripChecks = Record<AttestationType, boolean>;

interface TLATripControlsProps {
  tla: TLA;
  tlaId: string;
  userId: string;
  userName: string;
  isDriver: boolean;
  onTripUpdate: (updatedTLA: TLA) => void;
}

export function TLATripControls({
  tla,
  tlaId,
  userId,
  userName,
  isDriver,
  onTripUpdate,
}: TLATripControlsProps) {
  const firestore = useFirestore();
  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [markDriverAvailable, setMarkDriverAvailable] = useState(true);
  // DEV-154 phase 5: optional post-trip attestations. Default ON because
  // the typical trip completes successfully without incidents, but the user
  // can uncheck either before clicking Done.
  const [postTripChecks, setPostTripChecks] = useState<PostTripChecks>(
    () =>
      POST_TRIP_ATTESTATIONS.reduce(
        (acc, t) => ({ ...acc, [t]: true }),
        {} as PostTripChecks,
      ),
  );

  const handleStartTrip = async () => {
    if (!firestore) return;

    setIsStarting(true);
    try {
      const updatedTLA = await startTrip({
        firestore,
        tlaId,
        tla,
        userId,
        userName,
      });

      if (updatedTLA) {
        onTripUpdate(updatedTLA);
      }
    } catch (error) {
      // Error already handled in startTrip
    } finally {
      setIsStarting(false);
    }
  };

  const handleEndTrip = async () => {
    if (!firestore) return;

    setIsEnding(true);
    try {
      const updatedTLA = await endTrip({
        firestore,
        tlaId,
        tla,
        userId,
        userName,
      });

      if (updatedTLA) {
        onTripUpdate(updatedTLA);
        setShowCompletedModal(true);
      }
    } catch (error) {
      // Error already handled in endTrip
    } finally {
      setIsEnding(false);
    }
  };

  const handleCompletedConfirm = async () => {
    if (!firestore) {
      setShowCompletedModal(false);
      return;
    }

    await updateDriverAvailability(firestore, tla, markDriverAvailable);

    // DEV-154 phase 5: record any optional post-trip attestations the user
    // confirmed before closing the modal. Non-blocking — driver-availability
    // update is the primary side-effect and already succeeded.
    const checked = POST_TRIP_ATTESTATIONS.filter(t => postTripChecks[t]);
    if (checked.length > 0) {
      try {
        const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
        await updateDoc(doc(firestore, 'owner_operators', userId), {
          attestations: arrayUnion(
            ...checked.map(type =>
              buildAttestationEntry(type, userId, {
                userAgent,
                context: { tlaId, matchId: tla.matchId },
              }),
            ),
          ),
        });
      } catch (err) {
        console.error('Failed to record post-trip attestations:', err);
      }
    }

    setShowCompletedModal(false);
  };

  return (
    <>
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
              disabled={isStarting}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {isStarting ? (
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
                  Started {formatTLADate(tla.tripTracking?.startedAt)}
                </p>
              </div>
              <Button
                onClick={handleEndTrip}
                disabled={isEnding}
                variant="destructive"
                className="w-full"
              >
                {isEnding ? (
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

      {/* Trip Completed Modal */}
      <Dialog open={showCompletedModal} onOpenChange={setShowCompletedModal}>
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
                <span className="font-medium">
                  {formatTripDuration(tla.tripTracking?.durationMinutes || 0)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Payment:</span>
                <span className="font-medium text-green-600">
                  ${tla.payment.amount.toLocaleString()}
                </span>
              </div>
            </div>

            {(isDriver || userName === tla.lessor.legalName) && (
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

            {/* DEV-154 phase 5: optional post-trip attestations. Defaulted on,
                user can uncheck. Recorded in the unified attestations array
                with context.tlaId so the audit trail is complete. */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Post-Trip Confirmation (Optional)</h4>
              </div>
              {POST_TRIP_ATTESTATIONS.map(type => {
                const def = ATTESTATIONS[type];
                return (
                  <div key={type} className="flex items-start space-x-3">
                    <Checkbox
                      id={`posttrip-${type}`}
                      checked={postTripChecks[type]}
                      onCheckedChange={checked =>
                        setPostTripChecks(prev => ({ ...prev, [type]: checked === true }))
                      }
                      className="mt-0.5"
                    />
                    <Label htmlFor={`posttrip-${type}`} className="text-xs leading-relaxed cursor-pointer">
                      {def.text}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleCompletedConfirm} className="w-full">
              <CheckCircle className="h-4 w-4 mr-2" />
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
