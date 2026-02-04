import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';

interface AuditLogEntry {
  action: string;
  userId: string;
  userRole: 'driver' | 'owner_operator' | 'admin';
  targetId?: string;
  targetType?: 'driver' | 'load' | 'invitation';
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAuditEvent(entry: AuditLogEntry) {
  try {
    const { db } = await getFirebaseAdmin();
    
    await db.collection('audit_logs').add({
      ...entry,
      timestamp: FieldValue.serverTimestamp(),
      createdAt: new Date().toISOString(),
    });

    console.log('[Audit] Logged event:', entry.action);
  } catch (error) {
    console.error('[Audit] Failed to log event:', error);
  }
}

export const AuditActions = {
  DRIVER_PROFILE_SUBMITTED: 'driver.profile.submitted',
  DRIVER_PROFILE_CONFIRMED: 'driver.profile.confirmed',
  DRIVER_PROFILE_REJECTED: 'driver.profile.rejected',
  DRIVER_INVITATION_SENT: 'driver.invitation.sent',
  DRIVER_INVITATION_ACCEPTED: 'driver.invitation.accepted',
  DRIVER_REGISTERED: 'driver.registered',
} as const;
