import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PartyPopper } from "lucide-react";
import type { TLA } from "@/lib/data";
import { formatTLADate, formatTripDuration } from "@/lib/tla-utils";

interface TLACompletedSummaryProps {
  tla: TLA;
}

export function TLACompletedSummary({ tla }: TLACompletedSummaryProps) {
  if (tla.status !== 'completed') return null;

  return (
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
          <span className="font-medium">
            {formatTripDuration(tla.tripTracking?.durationMinutes || 0)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Completed:</span>
          <span>{formatTLADate(tla.tripTracking?.endedAt)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Payment:</span>
          <span className="font-medium text-green-600">
            ${tla.payment.amount.toLocaleString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
