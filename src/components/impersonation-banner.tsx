'use client';

/**
 * Persistent banner shown while a super-admin is impersonating another user
 * (DEV-166). Reads the impersonation context from localStorage (set by the
 * admin/users page when impersonation started). Provides a Stop button that
 * signs out the impersonated session, clears local state, and audits the end.
 *
 * Hard-stops on the 30-minute TTL set when impersonation began.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { AlertTriangle, LogOut, Loader2 } from 'lucide-react';

const STORAGE_KEY = 'xtrafleet:impersonation';

interface ImpersonationState {
  adminUid: string;
  adminEmail: string;
  targetUid: string;
  targetEmail: string;
  targetName: string;
  startedAt: string;
  expiresAt: string;
}

function read(): ImpersonationState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ImpersonationState;
  } catch {
    return null;
  }
}

function clear() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
}

export function setImpersonation(state: ImpersonationState) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

export function ImpersonationBanner() {
  const auth = useAuth();
  const router = useRouter();
  const [state, setState] = useState<ImpersonationState | null>(null);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    setState(read());
    // Re-check on storage events (cross-tab) and on focus.
    const refresh = () => setState(read());
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  // Hard-stop when the 30-min TTL elapses.
  useEffect(() => {
    if (!state) return;
    const expiresMs = new Date(state.expiresAt).getTime();
    const remaining = expiresMs - Date.now();
    if (remaining <= 0) {
      stop('Auto-ended (TTL expired)');
      return;
    }
    const timer = setTimeout(() => stop('Auto-ended (TTL expired)'), remaining);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.expiresAt]);

  async function stop(reason = 'Stopped via banner') {
    if (!state || stopping) return;
    setStopping(true);
    const snapshot = state;
    try {
      // Best-effort audit + clear cookie before the client signs out so the
      // admin's logout state is clean.
      await fetch('/api/admin/impersonate/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminUid: snapshot.adminUid,
          adminEmail: snapshot.adminEmail,
          targetUid: snapshot.targetUid,
          reason,
        }),
      }).catch(() => {});
      try {
        await auth.signOut();
      } catch {
        /* ignore */
      }
      await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
    } finally {
      clear();
      setState(null);
      router.push(`/login?message=${encodeURIComponent('Impersonation ended — sign in again.')}`);
    }
  }

  if (!state) return null;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-100 px-4 py-2 text-amber-900 shadow-sm dark:bg-amber-950/60 dark:text-amber-100 dark:border-amber-700">
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <p className="text-sm truncate">
          <strong>Impersonating</strong>{' '}
          <span className="font-medium">{state.targetName || state.targetEmail}</span>{' '}
          <span className="text-xs opacity-80">as {state.adminEmail}</span>
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="bg-white/80 hover:bg-white"
        onClick={() => stop()}
        disabled={stopping}
      >
        {stopping ? (
          <>
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Stopping…
          </>
        ) : (
          <>
            <LogOut className="h-3.5 w-3.5 mr-1.5" />Stop impersonating
          </>
        )}
      </Button>
    </div>
  );
}
