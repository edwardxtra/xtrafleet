import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Firestore } from 'firebase/firestore';

export type AuditAction =
  | 'user_created'
  | 'user_suspended'
  | 'user_reactivated'
  | 'user_updated'
  | 'user_deleted'
  | 'user_activation_resent'
  | 'driver_updated'
  | 'driver_created_by_admin'
  | 'driver_deleted'
  | 'driver_deactivated'
  | 'driver_reactivated'
  | 'load_updated'
  | 'load_created_by_admin'
  | 'load_deleted'
  | 'match_cancelled'
  | 'match_updated'
  | 'match_deleted'
  | 'tla_voided'
  | 'tla_updated'
  | 'tla_deleted'
  | 'billing_refunded'
  | 'attestation_voided'
  | 'message_deleted'
  | 'password_reset_sent'
  | 'impersonation_started'
  | 'impersonation_ended'
  | 'admin_login'
  | 'data_exported';

export interface AuditLogEntry {
  id?: string;
  action: AuditAction;
  adminId: string;
  adminEmail: string;
  targetType: 'user' | 'tla' | 'match' | 'driver' | 'load' | 'system';
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
    user_created: 'User Created',
    user_suspended: 'User Suspended',
    user_reactivated: 'User Reactivated',
    user_updated: 'User Updated',
    user_deleted: 'User Deleted',
    user_activation_resent: 'Activation Email Sent',
    driver_updated: 'Driver Updated',
    driver_created_by_admin: 'Driver Created (Admin)',
    driver_deleted: 'Driver Deleted',
    driver_deactivated: 'Driver Deactivated',
    driver_reactivated: 'Driver Reactivated',
    load_updated: 'Load Updated',
    load_created_by_admin: 'Load Created (Admin)',
    load_deleted: 'Load Deleted',
    match_cancelled: 'Match Cancelled',
    match_updated: 'Match Updated',
    match_deleted: 'Match Deleted',
    tla_voided: 'TLA Voided',
    tla_updated: 'TLA Updated',
    tla_deleted: 'TLA Deleted',
    billing_refunded: 'Payment Refunded',
    attestation_voided: 'Attestation Voided',
    message_deleted: 'Message Deleted',
    password_reset_sent: 'Password Reset Sent',
    impersonation_started: 'Impersonation Started',
    impersonation_ended: 'Impersonation Ended',
    admin_login: 'Admin Login',
    data_exported: 'Data Exported',
  };
  return labels[action] || action;
}

export function getActionColor(action: AuditAction): string {
  if (action.includes('suspended') || action.includes('voided') || action.includes('cancelled') || action.includes('deactivated')) {
    return 'text-red-600';
  }
  if (action.includes('reactivated') || action.includes('activation_resent')) {
    return 'text-green-600';
  }
  if (action.includes('updated')) {
    return 'text-amber-600';
  }
  return 'text-blue-600';
}
