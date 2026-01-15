"use client";

import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileText, ArrowLeft, AlertCircle, Download } from "lucide-react";
import Link from "next/link";
import { useUser } from "@/firebase";
import { useTLA } from "@/hooks/use-tla";
import { useTLARoles } from "@/hooks/use-tla-roles";
import { downloadTLAPDF } from "@/lib/generate-tla-pdf";

// Import all our components
import { TLAStatusBadge } from "@/components/tla/TLAStatusBadge";
import { TLASignatureCard } from "@/components/tla/TLASignatureCard";
import { TLAStatusAlerts } from "@/components/tla/TLAStatusAlerts";
import { TLASignForm } from "@/components/tla/TLASignForm";
import { TLATripControls } from "@/components/tla/TLATripControls";
import { TLAAgreementDetails } from "@/components/tla/TLAAgreementDetails";
import { TLACompletedSummary } from "@/components/tla/TLACompletedSummary";
import { TLAPartiesCard } from "@/components/tla/TLAPartiesCard";
// ❌ REMOVED: Match fee cards during free trial
// import { TLAMatchFeeCard, TLAMatchFeePaidCard } from "@/components/tla/TLAMatchFeeCard";

export default function TLAPage() {
  const params = useParams();
  const router = useRouter();
  const tlaId = params.id as string;
  const { user } = useUser();

  // Fetch TLA data
  const { tla, isLoading, error, refetch } = useTLA(tlaId);

  // Calculate user roles and permissions
  const roles = useTLARoles(tla);

  // Loading state
  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Skeleton className="h-[600px] w-full" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-[200px] w-full" />
            <Skeleton className="h-[200px] w-full" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
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
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadTLAPDF(tla)}
          >
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
          <TLAStatusBadge status={tla.status} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content - Agreement Details */}
        <TLAAgreementDetails tla={tla} />

        {/* Right Sidebar */}
        <div className="space-y-4">
          {/* Signatures */}
          <TLASignatureCard tla={tla} />

          {/* ❌ REMOVED: Match Fee Payment during 90-day free trial
          {tla.matchFeePaid ? (
            <TLAMatchFeePaidCard />
          ) : (
            <TLAMatchFeeCard 
              tla={tla} 
              tlaId={tlaId} 
              isLoadOwner={roles.isLessee} 
            />
          )}
          */}

          {/* Trip Controls - Show after TLA is signed (no payment required during trial) */}
          {(tla.status === "signed" || tla.status === "in_progress") &&
            roles.canControlTrip &&
            user && (
              <TLATripControls
                tla={tla}
                tlaId={tlaId}
                userId={user.uid}
                userName={roles.userName}
                isDriver={roles.isDriver}
                onTripUpdate={(updatedTLA) => {
                  refetch();
                }}
              />
            )}

          {/* Completed Trip Summary */}
          <TLACompletedSummary tla={tla} />

          {/* Sign Form */}
          {roles.canSign && roles.signingRole && user && (
            <TLASignForm
              tla={tla}
              tlaId={tlaId}
              signingRole={roles.signingRole}
              onSignSuccess={(updatedTLA) => {
                refetch();
              }}
            />
          )}

          {/* Status Alerts */}
          <TLAStatusAlerts
            tla={tla}
            isInvolved={roles.isInvolved}
            canControlTrip={roles.canControlTrip}
            cannotSignReason={roles.cannotSignReason}
            waitingMessage={roles.waitingMessage}
            canSign={roles.canSign}
          />

          {/* Parties Card */}
          <TLAPartiesCard
            tla={tla}
            isLessor={roles.isLessor}
            isLessee={roles.isLessee}
          />
        </div>
      </div>
    </div>
  );
}
