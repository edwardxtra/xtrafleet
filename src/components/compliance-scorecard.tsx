"use client";

/**
 * ComplianceScorecard — DEV-83
 *
 * Reusable scorecard component used in:
 *  - matches/page.tsx  (Sheet slide-out panel on each match card)
 *  - dashboard/drivers/page.tsx  (driver profile view)
 *  - dashboard/drivers/[id]/page.tsx
 *
 * Role-based visibility:
 *  - OO view  : FMCSA Status, Insurance, CDL, License Class/Endorsements,
 *               Clearinghouse Eligibility, Attestations + all screening docs
 *  - Driver view : CDL, License Class/Endorsements, Clearinghouse, Attestations only
 */

import { format, parseISO, differenceInDays } from "date-fns";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Driver } from "@/lib/data";
import type { ExpiryDetail } from "@/lib/matching";

const EXPIRY_WARNING_DAYS = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScorecardRole = "owner_operator" | "driver";

interface ScorecardRow {
  label: string;
  value?: string;
  type: "expiry" | "field" | "screening";
  documentUrl?: string;
}

// ---------------------------------------------------------------------------
// Individual row
// ---------------------------------------------------------------------------

function ScorecardItem({ label, value, type, documentUrl }: ScorecardRow) {
  let Icon = AlertTriangle;
  let colorClass = "text-amber-500";
  let statusText = "Missing";

  if (value) {
    if (type === "field") {
      Icon = CheckCircle;
      colorClass = "text-green-500";
      statusText = "Provided";
    } else if (type === "expiry") {
      try {
        const expiry = parseISO(value);
        const days = differenceInDays(expiry, new Date());
        if (days < 0) {
          Icon = XCircle;
          colorClass = "text-destructive";
          statusText = `Expired ${format(expiry, "MM/dd/yyyy")}`;
        } else if (days <= EXPIRY_WARNING_DAYS) {
          Icon = AlertTriangle;
          colorClass = "text-amber-500";
          statusText = `Expires soon: ${format(expiry, "MM/dd/yyyy")}`;
        } else {
          Icon = CheckCircle;
          colorClass = "text-green-500";
          statusText = `Expires ${format(expiry, "MM/dd/yyyy")}`;
        }
      } catch {
        Icon = AlertTriangle;
        colorClass = "text-amber-500";
        statusText = "Invalid date";
      }
    } else if (type === "screening") {
      try {
        const screenDate = parseISO(value);
        const expiry = new Date(screenDate);
        expiry.setFullYear(expiry.getFullYear() + 1);
        const days = differenceInDays(expiry, new Date());
        if (days < 0) {
          Icon = XCircle;
          colorClass = "text-destructive";
          statusText = `Expired ${format(expiry, "MM/dd/yyyy")}`;
        } else if (days <= EXPIRY_WARNING_DAYS) {
          Icon = AlertTriangle;
          colorClass = "text-amber-500";
          statusText = `Expires soon: ${format(expiry, "MM/dd/yyyy")}`;
        } else {
          Icon = CheckCircle;
          colorClass = "text-green-500";
          statusText = `Valid until ${format(expiry, "MM/dd/yyyy")}`;
        }
      } catch {
        Icon = AlertTriangle;
        colorClass = "text-amber-500";
        statusText = "Invalid date";
      }
    }
  }

  return (
    <div className="flex items-center justify-between py-2.5">
      <p className="text-sm font-medium flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        {label}
      </p>
      <div className="flex items-center gap-2">
        <div className={`flex items-center gap-1.5 text-sm font-semibold ${colorClass}`}>
          <Icon className="h-4 w-4 flex-shrink-0" />
          <span className="text-xs">{statusText}</span>
        </div>
        {documentUrl ? (
          <a
            href={documentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded hover:bg-primary/90 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />View
          </a>
        ) : (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">No file</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overall status banner
// ---------------------------------------------------------------------------

function OverallStatus({ driver }: { driver: Driver }) {
  const now = new Date();
  const expiryChecks = [
    driver.cdlExpiry,
    driver.medicalCardExpiry,
    driver.insuranceExpiry,
  ];

  let isExpired = false;
  let isWarning = false;

  for (const v of expiryChecks) {
    if (!v) continue;
    try {
      const days = differenceInDays(parseISO(v), now);
      if (days < 0) { isExpired = true; break; }
      if (days <= EXPIRY_WARNING_DAYS) isWarning = true;
    } catch { /* skip bad dates */ }
  }

  const hasRequiredFields = !!(driver.cdlLicense && driver.cdlExpiry);
  const status = !hasRequiredFields || isExpired ? "Red" : isWarning ? "Yellow" : "Green";

  const bg = status === "Green" ? "bg-green-50 border-green-200" : status === "Yellow" ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200";
  const text = status === "Green" ? "text-green-800" : status === "Yellow" ? "text-yellow-800" : "text-red-800";
  const dot = status === "Green" ? "bg-green-500" : status === "Yellow" ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border mb-3 ${bg}`}>
      <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${dot}`} />
      <ShieldCheck className={`h-4 w-4 flex-shrink-0 ${text}`} />
      <p className={`text-sm font-semibold ${text}`}>Overall Compliance: {status}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expiry decay warning callout (shown in match context only)
// ---------------------------------------------------------------------------

interface DecayWarningProps {
  warning: string;
  expiryDetails: ExpiryDetail[];
  onLearnMore?: () => void;
}

function DecayWarning({ warning, expiryDetails, onLearnMore }: DecayWarningProps) {
  const affected = expiryDetails.filter((d) => d.status !== "green");
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 mb-3">
      <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-amber-800 font-medium">{warning}</p>
        {affected.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {affected.map((d) => (
              <li key={d.label} className="text-xs text-amber-700">
                {d.label}: {d.daysUntil < 0 ? "Expired" : `${d.daysUntil}d remaining`}
              </li>
            ))}
          </ul>
        )}
        {onLearnMore && (
          <button
            onClick={onLearnMore}
            className="text-xs text-amber-700 underline mt-1 hover:text-amber-900"
          >
            Learn more about scoring
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score formula modal content (used inside Sheet)
// ---------------------------------------------------------------------------

export function ScoringFormulaExplainer({ expiryDetails }: { expiryDetails?: ExpiryDetail[] }) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="font-semibold mb-2">How match scores are calculated</p>
        <div className="space-y-1">
          {[
            ["Location", "35 pts", "Distance between driver and pickup"],
            ["Qualification & Compliance", "40 pts", "Certifications + document health"],
            ["Vehicle Match", "20 pts", "Equipment compatibility"],
            ["Rating", "5 pts", "Historical performance"],
          ].map(([label, pts, desc]) => (
            <div key={label} className="flex items-start justify-between gap-2 py-1.5 border-b last:border-0">
              <div>
                <p className="font-medium text-xs">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Badge variant="secondary" className="flex-shrink-0 text-xs">{pts}</Badge>
            </div>
          ))}
        </div>
      </div>

      {expiryDetails && expiryDetails.length > 0 && (
        <div>
          <Separator className="my-2" />
          <p className="font-semibold mb-2">Document expiry affecting this score</p>
          <div className="space-y-1">
            {expiryDetails.map((d) => {
              const color = d.status === "green" ? "text-green-700" : d.status === "yellow" ? "text-amber-700" : "text-red-700";
              return (
                <div key={d.label} className="flex justify-between items-center py-1">
                  <span className="text-xs">{d.label}</span>
                  <span className={`text-xs font-medium ${color}`}>
                    {d.status === "expired" ? "Expired" : `${d.daysUntil}d remaining`}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Documents expiring within 30 days reduce the Qualification & Compliance score.
            Expired documents reduce the score to 0 for that bucket.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface ComplianceScorecardProps {
  driver: Driver;
  role: ScorecardRole;
  // If provided, shows the decay warning callout (match context only)
  qualificationWarning?: string;
  expiryDetails?: ExpiryDetail[];
  onLearnMore?: () => void;
}

export function ComplianceScorecard({
  driver,
  role,
  qualificationWarning,
  expiryDetails,
  onLearnMore,
}: ComplianceScorecardProps) {
  const isOO = role === "owner_operator";

  return (
    <div className="space-y-1">
      <OverallStatus driver={driver} />

      {qualificationWarning && expiryDetails && (
        <DecayWarning
          warning={qualificationWarning}
          expiryDetails={expiryDetails}
          onLearnMore={onLearnMore}
        />
      )}

      <div className="divide-y">
        {/* CDL — both roles */}
        <ScorecardItem label="CDL Number" value={driver.cdlLicense} type="field" documentUrl={driver.cdlDocumentUrl || driver.cdlLicenseUrl} />
        <ScorecardItem label="CDL Expiry" value={driver.cdlExpiry} type="expiry" documentUrl={driver.cdlDocumentUrl || driver.cdlLicenseUrl} />
        <ScorecardItem
          label="License Class & Endorsements"
          value={
            driver.cdlClass
              ? `Class ${driver.cdlClass}${driver.endorsements ? ` · ${driver.endorsements}` : ""}`
              : driver.endorsements
          }
          type="field"
        />

        {/* OO-only rows */}
        {isOO && (
          <>
            <ScorecardItem label="Medical Certificate" value={driver.medicalCardExpiry} type="expiry" documentUrl={driver.medicalCardUrl} />
            <ScorecardItem label="Insurance (COI)" value={driver.insuranceExpiry} type="expiry" documentUrl={driver.insuranceUrl} />
            <ScorecardItem label="Motor Vehicle Record #" value={driver.motorVehicleRecordNumber} type="field" documentUrl={driver.mvrUrl} />
            <ScorecardItem label="Background Check" value={driver.backgroundCheckDate} type="screening" documentUrl={driver.backgroundCheckUrl} />
            <ScorecardItem label="Pre-Employment Screen" value={driver.preEmploymentScreeningDate} type="field" documentUrl={driver.preEmploymentScreeningUrl} />
            <ScorecardItem label="Drug & Alcohol Screen" value={driver.drugAndAlcoholScreeningDate} type="screening" documentUrl={driver.drugAndAlcoholScreeningUrl} />
          </>
        )}

        {/* Clearinghouse + Attestations — both roles */}
        <ScorecardItem label="Clearinghouse Eligibility" value={driver.clearinghouseStatus} type="field" />
      </div>
    </div>
  );
}
