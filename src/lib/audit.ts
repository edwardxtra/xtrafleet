import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Firestore } from 'firebase/firestore';

export type AuditAction = 
  | 'user_suspended'
  | 'user_reactivated'
  | 'user_updated'
  | 'tla_voided'
  | 'match_cancelled'
  | 'driver_deactivated'
  | 'driver_reactivated'
  | 'admin_login'
  | 'data_exported';

export interface AuditLogEntry {
  id?: string;
  action: AuditAction;
  adminId: string;
  adminEmail: string;
  targetType: 'user' | 'tla' | 'match' | 'driver' | 'system';
  targetId: string;
  targetName?: string;
  details?: Record<string, any>;
  reason?: string;
  timestamp?: any;
  createdAt?: string;
}

export async function logAuditAction(
  firestore: Firestore,
  entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'createdAt'>
): Promise<string> {
  const auditRef = collection(firestore, 'audit_logs');
  const docRef = await addDoc(auditRef, {
    ...entry,
    timestamp: serverTimestamp(),
    createdAt: new Date().toISOString(),
  });
  return docRef.id;
}

export function getActionLabel(action: AuditAction): string {
  const labels: Record<AuditAction, string> = {
    user_suspended: 'User Suspended',
    user_reactivated: 'User Reactivated',
    user_updated: 'User Updated',
    tla_voided: 'TLA Voided',
    match_cancelled: 'Match Cancelled',
    driver_deactivated: 'Driver Deactivated',
    driver_reactivated: 'Driver Reactivated',
    admin_login: 'Admin Login',
    data_exported: 'Data Exported',
  };
  return labels[action] || action;
}

export function getActionColor(action: AuditAction): string {
  if (action.includes('suspended') || action.includes('voided') || action.includes('cancelled') || action.includes('deactivated')) {
    return 'text-red-600';
  }
  if (action.includes('reactivated')) {
    return 'text-green-600';
  }
  return 'text-blue-600';
}
