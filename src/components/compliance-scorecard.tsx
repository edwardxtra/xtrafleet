"use client";

/**
 * ComplianceScorecard — DEV-83
 *
 * Sections and role visibility:
 *
 * ┌─────────────────────────────────┬────────────┬────────────┐
 * │ Section                         │ OO (owner) │ Driver     │
 * ├─────────────────────────────────┼────────────┼────────────┤
 * │ FMCSA Status                    │     ✓      │     –      │
 * │ Insurance (COI)                 │     ✓      │     –      │
 * │ CDL Status                      │     ✓      │     ✓      │
 * │ License Class & Endorsements    │     ✓      │     ✓      │
 * │ Clearinghouse Eligibility       │     ✓      │     ✓      │
 * │ Attestations                    │     ✓      │     ✓      │
 * └─────────────────────────────────┴────────────┴────────────┘
 *
 * When used in the match Sheet (OO viewing another OO's driver),
 * pass role="owner_operator". FMCSA row shows "Verified by operator"
 * since the viewing OO doesn't have access to the matched driver's
 * owner DOT/MC details.
 *
 * Pass ownerOperator prop (with dotNumber / mcNumber) only when the
 * viewing user IS the driver's owner (i.e. drivers/page.tsx or [id]/page.tsx).
 */

import { format, parseISO, differenceInDays } from "date-fns";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Shield,
  Truck,
  FileText,
  ClipboardCheck,
  ExternalLink,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Driver, OwnerOperator } from "@/lib/data";
import type { ExpiryDetail } from "@/lib/matching";
import { AlertCircle } from "lucide-react";

const EXPIRY_WARNING_DAYS = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScorecardRole = "owner_operator" | "driver";

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type StatusLevel = "green" | "yellow" | "red" | "pending";

interface StatusConfig {
  level: StatusLevel;
  icon: React.ElementType;
  label: string;
  detail?: string;
  colorClass: string;
  dotClass: string;
}

function getExpiryStatus(
  dateStr: string | undefined,
  label: string
): StatusConfig {
  if (!dateStr) {
    return {
      level: "red",
      icon: XCircle,
      label: "Missing",
      colorClass: "text-destructive",
      dotClass: "bg-red-500",
    };
  }
  try {
    const expiry = parseISO(dateStr);
    const days = differenceInDays(expiry, new Date());
    if (days < 0) {
      return {
        level: "red",
        icon: XCircle,
        label: "Expired",
        detail: `Expired ${format(expiry, "MM/dd/yyyy")}`,
        colorClass: "text-destructive",
        dotClass: "bg-red-500",
      };
    }
    if (days <= EXPIRY_WARNING_DAYS) {
      return {
        level: "yellow",
        icon: AlertTriangle,
        label: "Expiring Soon",
        detail: `Expires ${format(expiry, "MM/dd/yyyy")} (${days}d)`,
        colorClass: "text-amber-600",
        dotClass: "bg-amber-500",
      };
    }
    return {
      level: "green",
      icon: CheckCircle,
      label: "Active",
      detail: `Expires ${format(expiry, "MM/dd/yyyy")}`,
      colorClass: "text-green-600",
      dotClass: "bg-green-500",
    };
  } catch {
    return {
      level: "red",
      icon: XCircle,
      label: "Invalid date",
      colorClass: "text-destructive",
      dotClass: "bg-red-500",
    };
  }
}

function getFieldStatus(value: string | undefined): StatusConfig {
  if (!value || value.trim() === "") {
    return {
      level: "red",
      icon: XCircle,
      label: "Missing",
      colorClass: "text-destructive",
      dotClass: "bg-red-500",
    };
  }
  return {
    level: "green",
    icon: CheckCircle,
    label: "Provided",
    colorClass: "text-green-600",
    dotClass: "bg-green-500",
  };
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({
  icon: Icon,
  title,
  status,
}: {
  icon: React.ElementType;
  title: string;
  status: StatusLevel;
}) {
  const dotColor =
    status === "green"
      ? "bg-green-500"
      : status === "yellow"
      ? "bg-amber-500"
      : status === "pending"
      ? "bg-blue-400"
      : "bg-red-500";

  return (
    <div className="flex items-center gap-2 mb-2 mt-4 first:mt-0">
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <p className="text-sm font-semibold">{title}</p>
      <span className={`ml-auto h-2.5 w-2.5 rounded-full flex-shrink-0 ${dotColor}`} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail row inside a section
// ---------------------------------------------------------------------------

function DetailRow({
  label,
  value,
  url,
  mono = false,
}: {
  label: string;
  value: string;
  url?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={`font-medium ${mono ? "font-mono" : ""}`}>{value}</span>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge row
// ---------------------------------------------------------------------------

function StatusRow({
  status,
}: {
  status: StatusConfig;
}) {
  const Icon = status.icon;
  return (
    <div className={`flex items-center gap-1.5 text-xs font-semibold ${status.colorClass} mb-2`}>
      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
      <span>{status.label}</span>
      {status.detail && (
        <span className="font-normal text-muted-foreground">· {status.detail}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. FMCSA Status (OO-only)
// ---------------------------------------------------------------------------

function FMCSASection({ ownerOperator }: { ownerOperator?: Partial<OwnerOperator> }) {
  const hasDot = !!(ownerOperator?.dotNumber);
  const hasMc = !!(ownerOperator?.mcNumber);
  const status: StatusLevel =
    ownerOperator === undefined
      ? "pending" // match context — we don't expose the other OO's FMCSA
      : hasDot && hasMc
      ? "green"
      : hasDot || hasMc
      ? "yellow"
      : "red";

  return (
    <div>
      <SectionHeader icon={Shield} title="FMCSA Status" status={status} />
      <div className="pl-6 space-y-0.5">
        {ownerOperator === undefined ? (
          // Match context — show "Verified by operator" (we can't expose other OO's details)
          <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 mb-1">
            <CheckCircle className="h-3.5 w-3.5" />
            <span>Verified by operator</span>
          </div>
        ) : (
          <>
            <StatusRow
              status={{
                level: status,
                icon: status === "green" ? CheckCircle : status === "yellow" ? AlertTriangle : XCircle,
                label: status === "green" ? "Active" : status === "yellow" ? "Partial" : "Not verified",
                colorClass:
                  status === "green"
                    ? "text-green-600"
                    : status === "yellow"
                    ? "text-amber-600"
                    : "text-destructive",
                dotClass: "",
              }}
            />
            <DetailRow
              label="DOT Number"
              value={ownerOperator.dotNumber || "—"}
              mono
            />
            <DetailRow
              label="MC Number"
              value={ownerOperator.mcNumber || "—"}
              mono
            />
          </>
        )}
        <p className="text-xs text-muted-foreground italic mt-1">
          {ownerOperator === undefined
            ? "FMCSA details are verified by the operator and not shared in match results."
            : "Future: live FMCSA carrier lookup via DOT API."}
        </p>
      </div>
      <Separator className="mt-3" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Insurance / COI (OO-only)
// ---------------------------------------------------------------------------

function InsuranceSection({ driver }: { driver: Driver }) {
  const expiryStatus = getExpiryStatus(driver.insuranceExpiry, "Insurance");
  const hasInfo = !!(
    driver.insurerName ||
    driver.insurancePolicyNumber ||
    driver.insuranceExpiry
  );

  const sectionStatus: StatusLevel =
    expiryStatus.level === "green" && hasInfo
      ? "green"
      : expiryStatus.level === "yellow"
      ? "yellow"
      : "red";

  return (
    <div>
      <SectionHeader icon={FileText} title="Insurance (COI)" status={sectionStatus} />
      <div className="pl-6 space-y-0.5">
        <StatusRow status={expiryStatus} />
        {driver.insurerName && (
          <DetailRow label="Insurer" value={driver.insurerName} />
        )}
        {driver.insurancePolicyNumber && (
          <DetailRow
            label="Policy Number"
            value={driver.insurancePolicyNumber}
            mono
          />
        )}
        {driver.insuranceExpiry && (
          <DetailRow
            label="Expiry"
            value={format(parseISO(driver.insuranceExpiry), "MM/dd/yyyy")}
            url={driver.insuranceUrl}
          />
        )}
        {!hasInfo && (
          <p className="text-xs text-muted-foreground">
            No insurance information on file.
          </p>
        )}
      </div>
      <Separator className="mt-3" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. CDL Status (both roles)
// ---------------------------------------------------------------------------

function CDLSection({ driver }: { driver: Driver }) {
  const expiryStatus = getExpiryStatus(driver.cdlExpiry, "CDL");
  const hasNumber = !!driver.cdlLicense;

  const sectionStatus: StatusLevel =
    expiryStatus.level === "green" && hasNumber
      ? "green"
      : expiryStatus.level === "yellow"
      ? "yellow"
      : "red";

  return (
    <div>
      <SectionHeader icon={Truck} title="CDL Status" status={sectionStatus} />
      <div className="pl-6 space-y-0.5">
        <StatusRow status={expiryStatus} />
        {driver.cdlLicense && (
          <DetailRow
            label="CDL Number"
            value={driver.cdlLicense}
            mono
            url={driver.cdlDocumentUrl || driver.cdlLicenseUrl}
          />
        )}
        {driver.cdlState && (
          <DetailRow label="Issuing State" value={driver.cdlState} />
        )}
        {driver.cdlExpiry && (
          <DetailRow
            label="Expiry"
            value={format(parseISO(driver.cdlExpiry), "MM/dd/yyyy")}
          />
        )}
        {!hasNumber && !driver.cdlExpiry && (
          <p className="text-xs text-muted-foreground">No CDL information on file.</p>
        )}
      </div>
      <Separator className="mt-3" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. License Class & Endorsements (both roles)
// ---------------------------------------------------------------------------

function LicenseClassSection({ driver }: { driver: Driver }) {
  const hasClass = !!driver.cdlClass;
  const endorsementList =
    typeof driver.endorsements === "string" && driver.endorsements.trim()
      ? driver.endorsements.split(",").map((e) => e.trim()).filter(Boolean)
      : Array.isArray(driver.endorsements)
      ? driver.endorsements
      : [];

  const sectionStatus: StatusLevel = hasClass ? "green" : "yellow";

  const ENDORSEMENT_LABELS: Record<string, string> = {
    H: "H — Hazardous Materials",
    N: "N — Tank Vehicles",
    P: "P — Passenger",
    S: "S — School Bus",
    T: "T — Double/Triple Trailers",
    X: "X — Hazmat + Tank",
  };

  return (
    <div>
      <SectionHeader
        icon={ClipboardCheck}
        title="License Class & Endorsements"
        status={sectionStatus}
      />
      <div className="pl-6 space-y-0.5">
        {hasClass ? (
          <DetailRow label="Class" value={`Class ${driver.cdlClass}`} />
        ) : (
          <p className="text-xs text-muted-foreground mb-1">Class not on file.</p>
        )}
        {endorsementList.length > 0 ? (
          <div className="pt-0.5">
            <p className="text-xs text-muted-foreground mb-1">Endorsements</p>
            <div className="flex flex-wrap gap-1">
              {endorsementList.map((e) => (
                <Badge key={e} variant="outline" className="text-xs">
                  {ENDORSEMENT_LABELS[e] ?? e}
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No endorsements.</p>
        )}
        <p className="text-xs text-muted-foreground italic mt-1">
          Future: verified against state DMV via API.
        </p>
      </div>
      <Separator className="mt-3" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Clearinghouse Eligibility (both roles)
// ---------------------------------------------------------------------------

function ClearinghouseSection({ driver }: { driver: Driver }) {
  // clearinghouseStatus field — if not set, we show as Pending Verification
  const hasConsent = !!(driver as any).verificationConsent;
  const status = driver.clearinghouseStatus;

  const sectionStatus: StatusLevel =
    status === "eligible" || status === "Eligible" ? "green" : "pending";

  return (
    <div>
      <SectionHeader
        icon={Shield}
        title="Clearinghouse Eligibility"
        status={sectionStatus}
      />
      <div className="pl-6 space-y-0.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 mb-1">
          <Clock className="h-3.5 w-3.5" />
          <span>No Prohibitions · Pending Verification</span>
        </div>
        <p className="text-xs text-muted-foreground italic">
          {hasConsent
            ? "Verification consent received. Clearinghouse API integration — coming soon."
            : "Future: live FMCSA Drug & Alcohol Clearinghouse query."}
        </p>
      </div>
      <Separator className="mt-3" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. Attestations (both roles)
// ---------------------------------------------------------------------------

function AttestationsSection({ driver }: { driver: Driver }) {
  // authorizationConsent is saved on the driver doc when profile is submitted.
  // If profileComplete or profileStatus === 'complete' / 'pending_confirmation',
  // the driver went through the form and checked the box — mark as Verified.
  const hasAttestation =
    !!(driver as any).authorizationConsent ||
    driver.profileStatus === "complete" ||
    driver.profileStatus === "pending_confirmation" ||
    driver.profileComplete === true;

  const sectionStatus: StatusLevel = hasAttestation ? "green" : "yellow";

  return (
    <div>
      <SectionHeader icon={ClipboardCheck} title="Attestations" status={sectionStatus} />
      <div className="pl-6 space-y-1">
        <div
          className={`flex items-center gap-1.5 text-xs font-semibold ${
            hasAttestation ? "text-green-600" : "text-amber-600"
          }`}
        >
          {hasAttestation ? (
            <CheckCircle className="h-3.5 w-3.5" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5" />
          )}
          <span>
            {hasAttestation ? "Verified" : "Pending"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Driver Authorization & Disclosure
          {hasAttestation
            ? " — signed at profile submission."
            : " — awaiting profile submission."}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overall status banner
// ---------------------------------------------------------------------------

function OverallStatus({ driver }: { driver: Driver }) {
  const now = new Date();
  let isExpired = false;
  let isWarning = false;

  for (const v of [driver.cdlExpiry, driver.medicalCardExpiry, driver.insuranceExpiry]) {
    if (!v) continue;
    try {
      const days = differenceInDays(parseISO(v), now);
      if (days < 0) { isExpired = true; break; }
      if (days <= EXPIRY_WARNING_DAYS) isWarning = true;
    } catch { /* skip */ }
  }

  const hasRequiredFields = !!(driver.cdlLicense && driver.cdlExpiry);
  const overallStatus =
    !hasRequiredFields || isExpired ? "Red" : isWarning ? "Yellow" : "Green";

  const bg =
    overallStatus === "Green"
      ? "bg-green-50 border-green-200"
      : overallStatus === "Yellow"
      ? "bg-yellow-50 border-yellow-200"
      : "bg-red-50 border-red-200";
  const text =
    overallStatus === "Green"
      ? "text-green-800"
      : overallStatus === "Yellow"
      ? "text-yellow-800"
      : "text-red-800";
  const dot =
    overallStatus === "Green"
      ? "bg-green-500"
      : overallStatus === "Yellow"
      ? "bg-yellow-500"
      : "bg-red-500";

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border mb-4 ${bg}`}>
      <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${dot}`} />
      <Shield className={`h-4 w-4 flex-shrink-0 ${text}`} />
      <p className={`text-sm font-semibold ${text}`}>
        Overall Compliance: {overallStatus}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Decay warning callout (match context only)
// ---------------------------------------------------------------------------

interface DecayWarningProps {
  warning: string;
  expiryDetails: ExpiryDetail[];
  onLearnMore?: () => void;
}

function DecayWarning({ warning, expiryDetails, onLearnMore }: DecayWarningProps) {
  const affected = expiryDetails.filter((d) => d.status !== "green");
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 mb-4">
      <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-amber-800 font-medium">{warning}</p>
        {affected.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {affected.map((d) => (
              <li key={d.label} className="text-xs text-amber-700">
                {d.label}:{" "}
                {d.daysUntil < 0 ? "Expired" : `${d.daysUntil}d remaining`}
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
// Score formula explainer (used in Sheet "Learn more" panel)
// ---------------------------------------------------------------------------

export function ScoringFormulaExplainer({
  expiryDetails,
}: {
  expiryDetails?: ExpiryDetail[];
}) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="font-semibold mb-2">How match scores are calculated</p>
        <div className="space-y-1">
          {(
            [
              ["Location", "35 pts", "Distance between driver and pickup"],
              ["Qualification & Compliance", "40 pts", "Certifications + document health"],
              ["Vehicle Match", "20 pts", "Equipment compatibility"],
              ["Rating", "5 pts", "Historical performance"],
            ] as const
          ).map(([label, pts, desc]) => (
            <div
              key={label}
              className="flex items-start justify-between gap-2 py-1.5 border-b last:border-0"
            >
              <div>
                <p className="font-medium text-xs">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Badge variant="secondary" className="flex-shrink-0 text-xs">
                {pts}
              </Badge>
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
              const color =
                d.status === "green"
                  ? "text-green-700"
                  : d.status === "yellow"
                  ? "text-amber-700"
                  : "text-red-700";
              return (
                <div key={d.label} className="flex justify-between items-center py-1">
                  <span className="text-xs">{d.label}</span>
                  <span className={`text-xs font-medium ${color}`}>
                    {d.status === "expired"
                      ? "Expired"
                      : `${d.daysUntil}d remaining`}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Documents expiring within 30 days reduce the Qualification &amp;
            Compliance score. Expired documents reduce the score to 0 for that
            bucket.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface ComplianceScorecardProps {
  driver: Driver;
  role: ScorecardRole;
  /**
   * Pass the driver's ownerOperator doc when the viewing user IS the owner.
   * Leave undefined in match context (other OO's driver) — FMCSA row will
   * show "Verified by operator" instead of the actual DOT/MC numbers.
   */
  ownerOperator?: Partial<OwnerOperator>;
  // Decay warning (match context only)
  qualificationWarning?: string;
  expiryDetails?: ExpiryDetail[];
  onLearnMore?: () => void;
}

export function ComplianceScorecard({
  driver,
  role,
  ownerOperator,
  qualificationWarning,
  expiryDetails,
  onLearnMore,
}: ComplianceScorecardProps) {
  const isOO = role === "owner_operator";

  return (
    <div className="space-y-0">
      <OverallStatus driver={driver} />

      {qualificationWarning && expiryDetails && (
        <DecayWarning
          warning={qualificationWarning}
          expiryDetails={expiryDetails}
          onLearnMore={onLearnMore}
        />
      )}

      {/* OO-only sections */}
      {isOO && <FMCSASection ownerOperator={ownerOperator} />}
      {isOO && <InsuranceSection driver={driver} />}

      {/* Both roles */}
      <CDLSection driver={driver} />
      <LicenseClassSection driver={driver} />
      <ClearinghouseSection driver={driver} />
      <AttestationsSection driver={driver} />
    </div>
  );
}
