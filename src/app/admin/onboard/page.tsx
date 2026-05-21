'use client';

import { useState, FormEvent } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, UserPlus, Copy, CheckCircle2 } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast-utils';
import { useAdminRole } from '../layout';

interface OnboardResult {
  ownerOperatorId: string;
  activationUrl: string;
  expiresAt: string;
  carrier: { legalName?: string; authorityStatus?: string; allowedToOperate: boolean };
}

export default function AdminOnboardPage() {
  const { hasPermission } = useAdminRole();
  const canOnboard = hasPermission('users:create');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OnboardResult | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      companyName: String(form.get('companyName') || ''),
      legalName: String(form.get('legalName') || ''),
      contactName: String(form.get('contactName') || ''),
      contactEmail: String(form.get('contactEmail') || ''),
      phone: String(form.get('phone') || ''),
      dotNumber: String(form.get('dotNumber') || ''),
      mcNumber: String(form.get('mcNumber') || ''),
      address: String(form.get('address') || ''),
      city: String(form.get('city') || ''),
      state: String(form.get('state') || ''),
      zip: String(form.get('zip') || ''),
    };

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = data?.error || 'Failed to pre-register the customer.';
        setError(message);
        showError(message);
        setSubmitting(false);
        return;
      }
      setResult(data as OnboardResult);
      showSuccess('Customer pre-registered.');
    } catch (err) {
      console.error('Onboard error:', err);
      const message = 'An unexpected error occurred. Please try again.';
      setError(message);
      showError(message);
      setSubmitting(false);
    }
  };

  const copyLink = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.activationUrl);
      showSuccess('Activation link copied.');
    } catch {
      showError('Could not copy automatically — select and copy the link manually.');
    }
  };

  if (!canOnboard) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>No access</CardTitle>
          <CardDescription>Your admin role can&apos;t pre-register customers.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (result) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Customer Pre-registered
            </CardTitle>
            <CardDescription>
              The account is created and pre-activated. Run a match for this customer, then
              send them the activation link below so they can set a password and sign in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Account ID:</span>{' '}
                <code className="text-xs">{result.ownerOperatorId}</code>
              </p>
              <p>
                <span className="text-muted-foreground">FMCSA:</span>{' '}
                {result.carrier.legalName || 'Verified'} — authority{' '}
                {result.carrier.authorityStatus || 'unknown'}
              </p>
            </div>
            <div className="grid gap-2">
              <Label>
                Activation link (expires {new Date(result.expiresAt).toLocaleDateString()})
              </Label>
              <div className="flex gap-2">
                <Input readOnly value={result.activationUrl} className="font-mono text-xs" />
                <Button type="button" variant="outline" onClick={copyLink}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setResult(null);
                setError(null);
                setSubmitting(false);
              }}
            >
              Onboard another customer
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Onboard a Customer
          </CardTitle>
          <CardDescription>
            Pre-register a fleet on the customer&apos;s behalf using the details collected
            over the phone. The carrier is verified against FMCSA and a one-time activation
            link is generated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleSubmit} className="grid gap-5">
            <div className="grid gap-4">
              <p className="text-sm font-medium text-muted-foreground">Company</p>
              <div className="grid gap-2">
                <Label htmlFor="companyName">Company Name *</Label>
                <Input id="companyName" name="companyName" required disabled={submitting} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="legalName">Legal Name</Label>
                <Input
                  id="legalName"
                  name="legalName"
                  placeholder="Defaults to the FMCSA legal name"
                  disabled={submitting}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="dotNumber">DOT Number *</Label>
                  <Input id="dotNumber" name="dotNumber" required disabled={submitting} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="mcNumber">MC Number</Label>
                  <Input id="mcNumber" name="mcNumber" disabled={submitting} />
                </div>
              </div>
            </div>

            <div className="grid gap-4 border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground">Contact</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="contactName">Contact Name *</Label>
                  <Input id="contactName" name="contactName" required disabled={submitting} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" type="tel" disabled={submitting} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contactEmail">Contact Email *</Label>
                <Input
                  id="contactEmail"
                  name="contactEmail"
                  type="email"
                  required
                  disabled={submitting}
                />
                <p className="text-xs text-muted-foreground">
                  The activation link will be sent here. Must not already be a XtraFleet account.
                </p>
              </div>
            </div>

            <div className="grid gap-4 border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground">
                Address <span className="font-normal">(optional — filled from FMCSA if blank)</span>
              </p>
              <div className="grid gap-2">
                <Label htmlFor="address">Street Address</Label>
                <Input id="address" name="address" disabled={submitting} />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" name="city" disabled={submitting} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="state">State</Label>
                  <Input id="state" name="state" disabled={submitting} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="zip">ZIP</Label>
                  <Input id="zip" name="zip" disabled={submitting} />
                </div>
              </div>
            </div>

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying with FMCSA &amp; creating account...
                </>
              ) : (
                'Pre-register Customer'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
