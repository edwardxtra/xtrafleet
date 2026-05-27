import { parseISO, differenceInDays } from "date-fns";

/**
 * Per-field compliance evaluator. Returns a Green/Yellow/Red status
 * (plus gray for "not applicable") for a single driver document field,
 * mirroring the aggregate `getComplianceStatus()` logic in compliance.ts
 * so the admin Edit Driver dialog can show admins which field is
 * blocking eligibility at a glance.
 *
 * Not used as a blocker — purely visual. The aggregate scorer is still
 * the source of truth for whether a driver is marketable.
 */

const EXPIRY_WARNING_DAYS = 30;
const SCREENING_VALIDITY_YEARS = 1;

export type FieldStatus = "green" | "yellow" | "red" | "gray";

export interface FieldCompliance {
  status: FieldStatus;
  message: string;
}

/** A required field that doesn't expire: present → Green, missing → Red. */
export function evaluateRequiredField(value: string | undefined | null, label: string): FieldCompliance {
  if (!value || !String(value).trim()) {
    return { status: "red", message: `${label} is missing` };
  }
  return { status: "green", message: `${label} on file` };
}

/** A required date field that expires (CDL, medical card, insurance). */
export function evaluateExpiry(value: string | undefined | null, label: string): FieldCompliance {
  if (!value) return { status: "red", message: `${label} is missing` };
  const d = parseISO(value);
  if (Number.isNaN(d.getTime())) return { status: "red", message: "Invalid date" };
  const days = differenceInDays(d, new Date());
  if (days < 0) return { status: "red", message: `Expired ${Math.abs(days)} day(s) ago` };
  if (days <= EXPIRY_WARNING_DAYS) return { status: "yellow", message: `Expires in ${days} day(s)` };
  return { status: "green", message: `Valid for ${days} more day(s)` };
}

/**
 * A screening date that is "valid" for one year from when it was performed
 * (background check, drug & alcohol screening).
 */
export function evaluateScreening(value: string | undefined | null, label: string): FieldCompliance {
  if (!value) return { status: "red", message: `${label} is missing` };
  const performed = parseISO(value);
  if (Number.isNaN(performed.getTime())) return { status: "red", message: "Invalid date" };
  const validUntil = new Date(performed);
  validUntil.setFullYear(validUntil.getFullYear() + SCREENING_VALIDITY_YEARS);
  const days = differenceInDays(validUntil, new Date());
  if (days < 0) {
    return {
      status: "red",
      message: `Annual re-run overdue by ${Math.abs(days)} day(s)`,
    };
  }
  if (days <= EXPIRY_WARNING_DAYS) {
    return { status: "yellow", message: `Annual re-run due in ${days} day(s)` };
  }
  return { status: "green", message: `Valid for ${days} more day(s)` };
}
