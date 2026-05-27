'use client';

/**
 * /admin/health — DEV-166 system snapshot. Shows which integrations are
 * configured on this environment and surfaces a recent-error signal pulled
 * from audit_logs.
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, XCircle, RefreshCw, Activity, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { showError } from '@/lib/toast-utils';
import { useAdminRole } from '../layout';

interface HealthSnapshot {
  firebaseAdmin: boolean;
  fmcsaConfigured: boolean;
  resendConfigured: boolean;
  upstashConfigured: boolean;
  stripeConfigured: boolean;
  recentBlockedMatches: number | null;
  appUrl: string | null;
  nodeEnv: string | null;
  checkedAt: string;
}

interface CheckRow {
  label: string;
  ok: boolean;
  detail: string;
}

export default function AdminHealthPage() {
  const { hasPermission } = useAdminRole();
  const canView = hasPermission('audit:view');

  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/health');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to load health.');
      setSnapshot(data as HealthSnapshot);
    } catch (e: any) {
      showError(e?.message || 'Failed to load health.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (canView) load();
  }, [canView]);

  if (!canView) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>No access</CardTitle>
          <CardDescription>Your admin role can&apos;t view system health.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const checks: CheckRow[] = snapshot
    ? [
        {
          label: 'Firebase Admin SDK',
          ok: snapshot.firebaseAdmin,
          detail: 'Initialized (this route ran).',
        },
        {
          label: 'FMCSA (compliance gate)',
          ok: snapshot.fmcsaConfigured,
          detail: snapshot.fmcsaConfigured
            ? 'FMCSA_WEB_KEY configured. Live carrier verification works.'
            : 'FMCSA_WEB_KEY missing — the compliance gate will block every match (fail-closed).',
        },
        {
          label: 'Resend (transactional email)',
          ok: snapshot.resendConfigured,
          detail: snapshot.resendConfigured
            ? 'RESEND_API_KEY configured.'
            : 'RESEND_API_KEY missing — activation, password-reset, and notification emails won\'t send.',
        },
        {
          label: 'Upstash Redis (rate limiting)',
          ok: snapshot.upstashConfigured,
          detail: snapshot.upstashConfigured
            ? 'Configured. Rate limiters enforce normally.'
            : 'Not configured. Rate limiters fall back to a no-op (development mode).',
        },
        {
          label: 'Stripe (payments / refunds)',
          ok: snapshot.stripeConfigured,
          detail: snapshot.stripeConfigured
            ? 'STRIPE_SECRET_KEY configured. Refunds and checkout work.'
            : 'STRIPE_SECRET_KEY missing — checkout and refunds disabled.',
        },
      ]
    : [];

  const allOk = checks.length > 0 && checks.every((c) => c.ok);
  const blockedCount = snapshot?.recentBlockedMatches;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-2">
            <Activity className="h-7 w-7" />
            System Health
          </h1>
          <p className="text-muted-foreground">Integration configuration + recent error signals.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Integrations</CardTitle>
              <CardDescription>
                {snapshot ? `Checked ${format(new Date(snapshot.checkedAt), 'PPp')}` : 'Loading…'}
              </CardDescription>
            </div>
            {snapshot && (
              <Badge variant={allOk ? 'default' : 'destructive'} className={allOk ? 'bg-green-600' : ''}>
                {allOk ? 'All systems configured' : 'Configuration gaps'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {checks.map((c) => (
                <div
                  key={c.label}
                  className="flex items-start justify-between gap-4 rounded-lg border p-3"
                >
                  <div className="flex items-start gap-3">
                    {c.ok ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive mt-0.5" />
                    )}
                    <div>
                      <p className="font-medium">{c.label}</p>
                      <p className="text-sm text-muted-foreground">{c.detail}</p>
                    </div>
                  </div>
                  <Badge variant={c.ok ? 'default' : 'destructive'} className={c.ok ? 'bg-green-600' : ''}>
                    {c.ok ? 'OK' : 'Missing'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent signals</CardTitle>
          <CardDescription>Last ~100 audit-log entries scanned.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading || !snapshot ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <div className="space-y-2">
              <div className="flex items-start justify-between rounded-lg border p-3">
                <div className="flex items-start gap-3">
                  {blockedCount === null ? (
                    <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                  ) : blockedCount === 0 ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                  )}
                  <div>
                    <p className="font-medium">Compliance gate blocks</p>
                    <p className="text-sm text-muted-foreground">
                      {blockedCount === null
                        ? 'Could not query audit_logs for this signal (composite index may not exist).'
                        : blockedCount === 0
                        ? 'No recent match-formation blocks.'
                        : `${blockedCount}${blockedCount === 100 ? '+' : ''} recent match-formation blocks — possible FMCSA outage or inactive-carrier traffic spike.`}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border p-3 text-xs text-muted-foreground space-y-1">
                <p>NODE_ENV: <code>{snapshot.nodeEnv || 'unknown'}</code></p>
                {snapshot.appUrl && <p>APP_URL: <code>{snapshot.appUrl}</code></p>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
