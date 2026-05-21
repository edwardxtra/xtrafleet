/**
 * Client-side match acceptance (DEV-162).
 *
 * All match acceptance goes through the server route /api/matches/accept, which
 * runs the synchronous compliance gate, creates the TLA, and updates the match
 * and load. This helper invokes that route and then performs the non-critical
 * follow-ups (conversation, email, in-app notification) the route hands back.
 */
import type { Firestore } from 'firebase/firestore';
import { collection, addDoc } from 'firebase/firestore';
import { createConversation } from './messaging-utils';
import { notify } from './notifications';

export interface AcceptMatchResult {
  tlaId: string;
  complianceWarning: boolean;
  complianceMessage?: string;
}

export async function acceptMatch(
  firestore: Firestore,
  matchId: string
): Promise<AcceptMatchResult> {
  const res = await fetch('/api/matches/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId }),
  });

  let data: any = {};
  try {
    data = await res.json();
  } catch {
    // fall through to the generic error below
  }

  if (!res.ok) {
    throw new Error(data?.error || 'Failed to accept match. Please try again.');
  }

  const { tlaId, followUp } = data;

  // Follow-ups are best-effort — a failure here must not undo the formed match.
  if (followUp?.conversation) {
    try {
      await createConversation(
        firestore,
        followUp.conversation.driverOwnerId,
        followUp.conversation.loadOwnerId,
        followUp.conversation.loadId,
        tlaId
      );
    } catch (e) {
      console.warn('Failed to create conversation:', e);
    }
  }

  if (followUp?.email?.to) {
    notify
      .matchAccepted({
        loadOwnerEmail: followUp.email.to,
        loadOwnerName: followUp.email.loadOwnerName,
        driverName: followUp.email.driverName,
        loadOrigin: followUp.email.loadOrigin,
        loadDestination: followUp.email.loadDestination,
        rate: followUp.email.rate,
        tlaId,
      })
      .catch((err) => console.error('Failed to send match accepted notification:', err));
  }

  if (followUp?.notification) {
    try {
      await addDoc(collection(firestore, 'notifications'), {
        ...followUp.notification,
        createdAt: new Date().toISOString(),
        read: false,
      });
    } catch (e) {
      console.warn('Failed to create in-app notification:', e);
    }
  }

  return {
    tlaId,
    complianceWarning: !!data.complianceWarning,
    complianceMessage: data.complianceMessage,
  };
}
