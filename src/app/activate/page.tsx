'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, FormEvent } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/logo';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/firebase';
import { Loader2, Check, X, PartyPopper, Truck } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast-utils';
import { passwordSchema } from '@/lib/password-validation';

interface ActivationInfo {
  email: string;
  recipientName: string | null;
  companyName: string | null;
  matchSummary: string | null;
}

function ActivateContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const auth = useAuth();
  const token = searchParams.get('token') || '';

  const [checking, setChecking] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [info, setInfo] = useState<ActivationInfo | null>(null);

  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setTokenError('This activation link is missing its code.');
      setChecking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/activate?token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data.valid) {
          setTokenError(data.error || 'This activation link is not valid.');
        } else {
          setInfo({
            email: data.email,
            recipientName: data.recipientName,
            companyName: data.companyName,
            matchSummary: data.matchSummary,
          });
        }
      } catch {
        if (!cancelled) setTokenError('Could not validate this link. Please try again.');
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const passwordChecks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!info) return;

    const pw = passwordSchema.safeParse(password);
    if (!pw.success) {
      const message = pw.error.errors[0].message;
      setError(message);
      showError(message);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = data?.error || 'Activation failed. Please try again.';
        setError(message);
        showError(message);
        setSubmitting(false);
        return;
      }

      // Sign in with the credentials we just set, then exchange the ID token
      // for the session cookie — same pattern as /api/register.
      const credential = await signInWithEmailAndPassword(auth, info.email, password);
      const idToken = await credential.user.getIdToken();

      const sessionRes = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: idToken }),
      });

      if (!sessionRes.ok) {
        showSuccess('Account activated. Please sign in to continue.');
        router.push(
          `/login?email=${encodeURIComponent(info.email)}&message=Account activated. Please log in to continue.`
        );
        return;
      }

      showSuccess('Welcome to XtraFleet!');
      // Hard navigation so the next request carries the fresh session cookie.
      window.location.href = '/dashboard';
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/user-not-found'
      ) {
        // The account was activated server-side; only the client sign-in
        // failed. The user can still log in normally.
        showSuccess('Account activated. Please sign in to continue.');
        router.push(
          `/login?email=${encodeURIComponent(info.email)}&message=Account activated. Please log in to continue.`
        );
        return;
      }
      console.error('Activation error:', err);
      setError('An error occurred. Please try again.');
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="mx-auto w-full max-w-sm">
          <CardHeader className="space-y-4 text-center">
            <Link href="/" passHref className="inline-block">
              <Logo />
            </Link>
            <CardTitle className="font-headline text-2xl">Activation Link Problem</CardTitle>
            <CardDescription>{tokenError}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-center text-sm text-muted-foreground">
            <p>
              Please contact your XtraFleet representative for a new link, or{' '}
              <Link href="/login" className="underline">
                sign in
              </Link>{' '}
              if your account is already set up.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="mx-auto w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <Link href="/" passHref className="inline-block">
            <Logo />
          </Link>
          <div className="flex items-center justify-center gap-2 text-primary">
            <PartyPopper className="h-5 w-5" />
            <span className="text-sm font-medium">
              Welcome{info?.recipientName ? `, ${info.recipientName}` : ''}
            </span>
          </div>
          <CardTitle className="font-headline text-2xl">Activate Your Account</CardTitle>
          <CardDescription>
            {info?.companyName
              ? `Set a password to access the XtraFleet account for ${info.companyName}.`
              : 'Set a password to access your XtraFleet account.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {info?.matchSummary && (
            <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-start gap-2">
                <Truck className="mt-0.5 h-4 w-4 text-primary" />
                <div className="text-sm">
                  <p className="font-medium">You have a match waiting</p>
                  <p className="text-muted-foreground">{info.matchSummary}</p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={info?.email || ''} disabled readOnly />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Choose a Password *</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  disabled={submitting}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {password && (
                  <div className="mt-2 space-y-1">
                    <p className="mb-1 text-xs text-muted-foreground">Password must have:</p>
                    {[
                      { label: 'At least 8 characters', met: passwordChecks.length },
                      { label: 'One uppercase letter', met: passwordChecks.uppercase },
                      { label: 'One lowercase letter', met: passwordChecks.lowercase },
                      { label: 'One number', met: passwordChecks.number },
                    ].map((req, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        {req.met ? (
                          <Check className="h-3 w-3 text-green-600" />
                        ) : (
                          <X className="h-3 w-3 text-muted-foreground" />
                        )}
                        <span className={req.met ? 'text-green-600' : 'text-muted-foreground'}>
                          {req.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Activating...
                  </>
                ) : (
                  'Activate & Sign In'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <ActivateContent />
    </Suspense>
  );
}
