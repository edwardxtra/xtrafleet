import { format, parseISO, differenceInMinutes } from "date-fns";
import type { TLA } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle, Truck, XCircle } from "lucide-react";

/**
 * Get the appropriate badge component for a TLA status
 */
export function getTLAStatusConfig(status: TLA['status']) {
  switch (status) {
    case 'draft':
      return { label: 'Draft', variant: 'outline' as const, icon: null };
    case 'pending_lessor':
      return { label: 'Awaiting Lessor', variant: 'secondary' as const, icon: Clock };
    case 'pending_lessee':
      return { label: 'Awaiting Lessee', variant: 'secondary' as const, icon: Clock };
    case 'signed':
      return { label: 'Signed', variant: 'default' as const, icon: CheckCircle, className: 'bg-green-600' };
    case 'in_progress':
      return { label: 'In Progress', variant: 'default' as const, icon: Truck, className: 'bg-blue-600' };
    case 'completed':
      return { label: 'Completed', variant: 'default' as const, icon: CheckCircle, className: 'bg-purple-600' };
    case 'voided':
      return { label: 'Voided', variant: 'destructive' as const, icon: XCircle };
    default:
      return { label: status, variant: 'outline' as const, icon: null };
  }
}

/**
 * Determine which role can sign the TLA
 * ENFORCES ORDER: Lessor must sign first, then lessee
 */
export function getTLASigningRole(
  tla: TLA | null,
  userId: string | undefined,
  isLessor: boolean,
  isLessee: boolean
): 'lessor' | 'lessee' | null {
  if (!tla || !userId) return null;
  
  // Can't sign if already fully signed or voided
  if (tla.status === 'signed' || tla.status === 'voided' || tla.status === 'in_progress' || tla.status === 'completed') {
    return null;
  }
  
  // STEP 1: Lessor must sign first
  if (tla.status === 'pending_lessor' || tla.status === 'draft') {
    // Only lessor can sign at this stage
    if (isLessor && !tla.lessorSignature) {
      return 'lessor';
    }
    // Lessee cannot sign yet
    return null;
  }
  
  // STEP 2: After lessor signs, lessee can sign
  if (tla.status === 'pending_lessee') {
    // Only lessee can sign at this stage
    if (isLessee && !tla.lesseeSignature) {
      return 'lessee';
    }
    // Lessor already signed
    return null;
  }
  
  return null;
}

/**
 * Get reason why user cannot sign (for display)
 */
export function getCannotSignReason(
  tla: TLA | null,
  userId: string | undefined,
  isLessor: boolean,
  isLessee: boolean
): string | null {
  if (!tla || !userId) return null;
  
  // Lessee trying to sign before lessor
  if ((tla.status === 'pending_lessor' || tla.status === 'draft') && isLessee && !tla.lessorSignature) {
    return 'The driver owner (lessor) must sign this agreement first.';
  }
  
  // Lessor trying to sign after already signing
  if (tla.status === 'pending_lessee' && isLessor && tla.lessorSignature) {
    return 'You have already signed. Waiting for the load owner (lessee) to sign.';
  }
  
  return null;
}

/**
 * Get message for waiting state
 */
export function getWaitingMessage(
  tla: TLA | null,
  userId: string | undefined,
  isLessor: boolean,
  isLessee: boolean
): string | null {
  if (!tla || !userId) return null;
  
  if (tla.status === 'pending_lessor') {
    if (isLessee && tla.lesseeSignature) {
      return 'You have signed. Waiting for the driver owner (lessor) to sign.';
    }
  }
  
  if (tla.status === 'pending_lessee') {
    if (isLessor && tla.lessorSignature) {
      return 'You have signed. Waiting for the load owner (lessee) to sign.';
    }
  }
  
  return null;
}

/**
 * Format a date string for display
 */
export function formatTLADate(dateString?: string): string {
  if (!dateString) return "Not specified";
  try {
    return format(parseISO(dateString), "MMM d, yyyy 'at' h:mm a");
  } catch {
    return dateString;
  }
}

/**
 * Format trip duration in minutes to readable string
 */
export function formatTripDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} minutes`;
  if (mins === 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  return `${hours} hour${hours > 1 ? 's' : ''} ${mins} min`;
}

/**
 * Calculate trip duration from start to end time
 */
export function calculateTripDuration(startedAt: string, endedAt: string): number {
  try {
    const start = parseISO(startedAt);
    const end = parseISO(endedAt);
    return differenceInMinutes(end, start);
  } catch {
    return 0;
  }
}
