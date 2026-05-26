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
import { Loader2, UserPlus, Copy, CheckCircle2, Search } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast-utils';
import { useAdminRole } from '../layout';

interface OnboardResult {
  ownerOperatorId: string;
  activationUrl: string;
  expiresAt: string;
  carrier: { legalName?: string; authorityStatus?: string; allowedToOperate: boolean };
}

interface FormState {
  companyName: string;
  legalName: string;
  contactName: string;
  contactEmail: string;
  phone: string;
  dotNumber: string;
  mcNumber: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

const EMPTY_FORM: FormState = {
  companyName: '',
  legalName: '',
  contactName: '',
  contactEmail: '',
  phone: '',
  dotNumber: '',
  mcNumber: '',
  address: '',
  city: '',
  state: '',
  zip: '',
};

export default function AdminOnboardPage() {
  const { hasPermission } = useAdminRole();
  const canOnboard = hasPermission('users:create');

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [lookingUp, setLookingUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OnboardResult | null>(null);

  const update =
    (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleLookup = async () => {
    const dot = form.dotNumber.trim();
    if (!dot) {
      showError('Enter a DOT number first.');
      return;
    }
    setLookingUp(true);
    setError(null);
    try {
      const res = await fetch(`/api/fmcsa-lookup?dot=${encodeURIComponent(dot)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.carrier) {
        const message = data?.error || 'FMCSA lookup failed.';
        setError(message);
        showError(message);
        return;
      }
      const c = data.carrier as {
        legalName?: string;
        dbaName?: string;
        mcNumber?: string;
        hqAddress?: string;
        hqCity?: string;
        hqState?: string;
        hqZip?: string;
        phone?: string;
      };
      // Don't overwrite anything the admin has already typed.
      setForm((prev) => ({
        ...prev,
        companyName: prev.companyName || c.dbaName || c.legalName || '',
        legalName: prev.legalName || c.legalName || '',
        mcNumber: prev.mcNumber || c.mcNumber || '',
        address: prev.address || c.hqAddress || '',
        city: prev.city || c.hqCity || '',
        state: prev.state || c.hqState || '',
        zip: prev.zip || c.hqZip || '',
        phone: prev.phone || c.phone || '',
      }));
      showSuccess(`FMCSA records loaded${c.legalName ? ` for ${c.legalName}` : ''}.`);
    } catch (err) {
      console.error('FMCSA lookup error:', err);
      const message = 'Could not reach FMCSA. Try again.';
      setError(message);
      showError(message);
    } finally {
      setLookingUp(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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
                setForm(EMPTY_FORM);
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
            Pre-register a fleet on the customer&apos;s behalf. Enter the DOT and click
            <em> Look up FMCSA</em> to auto-fill the company details, then add the contact
            information.
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
                <Label htmlFor="dotNumber">DOT Number *</Label>
                <div className="flex gap-2">
                  <Input
                    id="dotNumber"
                    value={form.dotNumber}
                    onChange={update('dotNumber')}
                    required
                    disabled={submitting || lookingUp}
                    placeholder="e.g. 1234567"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleLookup}
                    disabled={submitting || lookingUp || !form.dotNumber.trim()}
                  >
                    {lookingUp ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Search className="mr-2 h-4 w-4" />
                        Look up FMCSA
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Looks up the carrier and auto-fills the company name, address, and MC #.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="companyName">Company Name *</Label>
                <Input
                  id="companyName"
                  value={form.companyName}
                  onChange={update('companyName')}
                  required
                  disabled={submitting}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="legalName">Legal Name</Label>
                <Input
                  id="legalName"
                  value={form.legalName}
                  onChange={update('legalName')}
                  placeholder="Defaults to the FMCSA legal name"
                  disabled={submitting}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mcNumber">MC Number</Label>
                <Input
                  id="mcNumber"
                  value={form.mcNumber}
                  onChange={update('mcNumber')}
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="grid gap-4 border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground">Contact</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="contactName">Contact Name *</Label>
                  <Input
                    id="contactName"
                    value={form.contactName}
                    onChange={update('contactName')}
                    required
                    disabled={submitting}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={update('phone')}
                    disabled={submitting}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contactEmail">Contact Email *</Label>
                <Input
                  id="contactEmail"
                  type="email"
                  value={form.contactEmail}
                  onChange={update('contactEmail')}
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
                Address <span className="font-normal">(filled by FMCSA lookup)</span>
              </p>
              <div className="grid gap-2">
                <Label htmlFor="address">Street Address</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={update('address')}
                  disabled={submitting}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={form.city}
                    onChange={update('city')}
                    disabled={submitting}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={form.state}
                    onChange={update('state')}
                    disabled={submitting}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="zip">ZIP</Label>
                  <Input
                    id="zip"
                    value={form.zip}
                    onChange={update('zip')}
                    disabled={submitting}
                  />
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
