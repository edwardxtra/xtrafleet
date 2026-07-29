'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
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
import { Loader2, UserPlus, Copy, CheckCircle2, Search, Users, Truck } from 'lucide-react';
import Link from 'next/link';
import { showSuccess, showError } from '@/lib/toast-utils';
import { useAdminRole } from '../layout';
import { useAuth } from '@/firebase';

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

// Auto-lookup fires once the DOT has at least this many digits, matching the
// normal profile form's debounced lookup.
const DOT_MIN_DIGITS = 4;

export default function AdminOnboardPage() {
  const { hasPermission } = useAdminRole();
  const canOnboard = hasPermission('users:create');

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [lookingUp, setLookingUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OnboardResult | null>(null);
  const auth = useAuth();
  const dotDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (dotDebounceRef.current) clearTimeout(dotDebounceRef.current); }, []);

  const update =
    (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  // Core FMCSA lookup. Mirrors the normal profile form: sends a fresh Bearer
  // token (the /api/fmcsa-lookup route requires auth — relying on the cookie
  // alone silently 401s when the session cookie is stale). `silent` suppresses
  // error toasts for the debounced auto-lookup so partial typing doesn't spam.
  const runLookup = async (rawDot: string, { silent = false }: { silent?: boolean } = {}) => {
    const dot = rawDot.replace(/\D/g, '');
    if (!dot) {
      if (!silent) showError('Enter a DOT number first.');
      return;
    }
    setLookingUp(true);
    setError(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch(`/api/fmcsa-lookup?dot=${encodeURIComponent(dot)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.carrier) {
        const message = data?.error || 'FMCSA lookup failed.';
        setError(message);
        if (!silent) showError(message);
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
      // Populate from FMCSA (authoritative); only keep a prior value when FMCSA
      // returns nothing for that field. companyName is the admin's display
      // choice, so preserve it if already set.
      setForm((prev) => ({
        ...prev,
        companyName: prev.companyName || c.dbaName || c.legalName || '',
        legalName: c.legalName || prev.legalName,
        mcNumber: c.mcNumber || prev.mcNumber,
        address: c.hqAddress || prev.address,
        city: c.hqCity || prev.city,
        state: c.hqState || prev.state,
        zip: c.hqZip || prev.zip,
        phone: c.phone || prev.phone,
      }));
      showSuccess(`FMCSA records loaded${c.legalName ? ` for ${c.legalName}` : ''}.`);
    } catch (err) {
      console.error('FMCSA lookup error:', err);
      const message = 'Could not reach FMCSA. Try again.';
      setError(message);
      if (!silent) showError(message);
    } finally {
      setLookingUp(false);
    }
  };

  const handleLookup = () => runLookup(form.dotNumber);

  // Auto-lookup on DOT entry (debounced), matching the normal onboard flow so
  // the admin doesn't have to click a button to populate the company details.
  const handleDotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numbersOnly = e.target.value.replace(/\D/g, '');
    setForm((prev) => ({ ...prev, dotNumber: numbersOnly }));
    if (dotDebounceRef.current) clearTimeout(dotDebounceRef.current);
    if (numbersOnly.length < DOT_MIN_DIGITS) return;
    dotDebounceRef.current = setTimeout(() => runLookup(numbersOnly, { silent: true }), 800);
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
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <p className="text-sm font-medium">Next: complete the white-glove setup</p>
              <p className="text-xs text-muted-foreground">
                Pre-populate this customer's drivers and loads so the activation lands on a
                lived-in dashboard with a real match waiting.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/drivers?addFor=${result.ownerOperatorId}`}>
                    <Users className="h-4 w-4 mr-1.5" /> Add drivers
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/loads?addFor=${result.ownerOperatorId}`}>
                    <Truck className="h-4 w-4 mr-1.5" /> Post loads
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/matches?q=${result.ownerOperatorId}`}>
                    Form a match
                  </Link>
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
                    onChange={handleDotChange}
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
