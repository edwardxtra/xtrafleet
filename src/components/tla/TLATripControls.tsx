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
import { Loader2, Play, Square, Truck, PartyPopper, CheckCircle } from "lucide-react";
import type { TLA } from "@/lib/data";
import { useFirestore } from "@/firebase";
import { startTrip, endTrip, updateDriverAvailability } from "@/lib/tla-actions";
import { formatTLADate, formatTripDuration } from "@/lib/tla-utils";

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
