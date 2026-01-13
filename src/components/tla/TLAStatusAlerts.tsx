import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Clock, CheckCircle, Truck } from "lucide-react";
import type { TLA } from "@/lib/data";
import { formatTLADate } from "@/lib/tla-utils";

interface TLAStatusAlertsProps {
  tla: TLA;
  isInvolved: boolean;
  canControlTrip: boolean;
  cannotSignReason: string | null;
  waitingMessage: string | null;
  canSign: boolean;
}

export function TLAStatusAlerts({
  tla,
  isInvolved,
  canControlTrip,
  cannotSignReason,
  waitingMessage,
  canSign,
}: TLAStatusAlertsProps) {
  // Not involved in agreement
  if (!isInvolved) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          You are not a party to this agreement.
        </AlertDescription>
      </Alert>
    );
  }

  // Cannot sign message
  if (!canSign && cannotSignReason) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {cannotSignReason}
        </AlertDescription>
      </Alert>
    );
  }

  // Waiting message
  if (waitingMessage) {
    return (
      <Alert>
        <Clock className="h-4 w-4" />
        <AlertDescription>
          {waitingMessage}
        </AlertDescription>
      </Alert>
    );
  }

  // Fully signed, waiting for trip to start
  if (tla.status === 'signed' && !canControlTrip) {
    return (
      <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800 dark:text-green-200">
          This agreement has been fully signed. Waiting for the driver owner to start the trip.
        </AlertDescription>
      </Alert>
    );
  }

  // Trip in progress
  if (tla.status === 'in_progress' && !canControlTrip) {
    return (
      <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
        <Truck className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800 dark:text-blue-200">
          Trip is currently in progress. Started {formatTLADate(tla.tripTracking?.startedAt)}.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
