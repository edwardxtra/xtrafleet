'use client';

import Link from "next/link";
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Logo } from "@/components/logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useUser, useAuth } from "@/firebase";
import { Suspense, useState, FormEvent } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Loader2, LogOut, LayoutDashboard, Building2, Truck, Check, X } from "lucide-react";
import { showSuccess, showError } from "@/lib/toast-utils";
import { passwordSchema } from "@/lib/password-validation";
import { ATTESTATIONS } from "@/lib/attestations";

function RegisterContent() {
  const searchParams = useSearchParams();
  const [error, setError] = useState(searchParams.get('error'));
  const [loading, setLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [passwordValue, setPasswordValue] = useState('');
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const auth = useAuth();

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await auth.signOut();
      await fetch('/api/auth/session', { method: 'DELETE' });
      showSuccess('Signed out successfully. You can now create a new account.');
    } catch (error) {
      console.error('Sign out error:', error);
      showError('Failed to sign out. Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const companyName = formData.get('companyName') as string;

    if (!email || !password || !companyName) {
      setError("Company name, email, and password are required.");
      showError("Company name, email, and password are required.");
      setLoading(false);
      return;
    }

    const passwordValidation = passwordSchema.safeParse(password);
    if (!passwordValidation.success) {
      const errorMessage = passwordValidation.error.errors[0].message;
      setError(errorMessage);
      showError(errorMessage);
      setLoading(false);
      return;
    }

    try {
      // Clear any stale session before creating a new account. Without this,
      // a leftover fb-id-token cookie + client Auth state from a *previous*
      // account survives the new signup, and the server (cookie) and client
      // (Firebase Auth) end up pointing at different uids — the "two users
      // at once" bug. Best-effort: failures here don't block the new signup.
      try {
        await auth.signOut();
        await fetch('/api/auth/session', { method: 'DELETE' });
      } catch (clearErr) {
        console.warn('[register] failed to clear prior session (continuing)', clearErr);
      }

      // Create the account server-side and atomically — Auth user +
      // owner_operators doc + users doc all in one request.
      const registerRes = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, companyName }),
      });
      const registerData = await registerRes.json().catch(() => ({}));

      if (!registerRes.ok) {
        const message =
          registerData?.error ||
          registerData?.message ||
          'An error occurred during sign up.';
        setError(message);
        showError(message);
        setLoading(false);
        return;
      }

      // Sign in client-side with the email + password the user just typed.
      // The server just created the account with exactly these credentials,
      // so this is guaranteed to succeed. We deliberately avoid a custom
      // token here — createCustomToken requires a real service-account
      // identity to sign, which the emulator-mode Admin SDK doesn't have,
      // and email/password sign-in is simpler and just as clean for
      // (re)establishing fresh client Auth state.
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await userCredential.user.getIdToken();

      // Exchange the ID token for the fb-id-token session cookie.
      const sessionResponse = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: idToken }),
      });

      if (!sessionResponse.ok) {
        // Account + docs exist; only the cookie didn't land (rate limit /
        // transient infra). Don't show a red error — route to login.
        console.warn('[register] Session POST failed after successful account creation', sessionResponse.status);
        showSuccess('Account created. Please sign in to continue.');
        router.push(`/login?email=${encodeURIComponent(email)}&message=Account created. Please log in to continue.`);
        return;
      }

      showSuccess('Account created successfully!');

      // Hard navigation so the next request carries the freshly-Set-Cookie'd
      // fb-id-token — soft client-side navigation can race the cookie write.
      window.location.href = '/create-profile';
      return;
    } catch (e: unknown) {
      console.error('Sign-up error:', e);
      let errorMessage = 'An error occurred during sign up.';
      const firebaseError = e as { code?: string };
      if (firebaseError.code === 'auth/wrong-password' || firebaseError.code === 'auth/user-not-found' || firebaseError.code === 'auth/invalid-credential') {
        // The server-side account was created but the client sign-in
        // failed. The account exists — the user can still log in normally.
        // The user can still log in normally.
        showSuccess('Account created. Please sign in to continue.');
        router.push(`/login?message=Account created. Please log in to continue.`);
        return;
      }
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const passwordChecks = {
    length: passwordValue.length >= 8,
    uppercase: /[A-Z]/.test(passwordValue),
    lowercase: /[a-z]/.test(passwordValue),
    number: /[0-9]/.test(passwordValue),
  };

  if (isUserLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="mx-auto w-full max-w-sm">
          <CardHeader className="space-y-4 text-center">
            <Link href="/" passHref className="inline-block"><Logo /></Link>
            <CardTitle className="font-headline text-2xl">Already Signed In</CardTitle>
            <CardDescription>You&apos;re currently logged in as <strong>{user.email}</strong></CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button className="w-full" onClick={() => router.push('/dashboard')}>
              <LayoutDashboard className="h-4 w-4 mr-2" />Go to Dashboard
            </Button>
            <Button variant="outline" className="w-full" onClick={handleSignOut} disabled={signingOut}>
              {signingOut ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Signing out...</>) : (<><LogOut className="h-4 w-4 mr-2" />Sign Out & Create New Account</>)}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="underline">Back to login</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="mx-auto w-full max-w-lg">
        <CardHeader className="space-y-4 text-center">
          <Link href="/" passHref className="inline-block"><Logo /></Link>
          <div className="flex items-center justify-center gap-2 text-primary">
            <Building2 className="h-5 w-5" />
            <span className="text-sm font-medium">For Fleet Owners</span>
          </div>
          <CardTitle className="font-headline text-2xl">Register Your Company</CardTitle>
          <CardDescription>Create an account to manage your fleet and drivers</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (<Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>)}
          <form onSubmit={handleRegister}>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="company-name">Company Name *</Label>
                <Input id="company-name" name="companyName" placeholder="Acme Trucking LLC" required disabled={loading} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Business Email *</Label>
                <Input id="email" type="email" name="email" placeholder="you@company.com" required disabled={loading} autoComplete="email" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password *</Label>
                <Input id="password" name="password" type="password" required disabled={loading} autoComplete="new-password" value={passwordValue} onChange={(e) => setPasswordValue(e.target.value)} />
                {passwordValue && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-muted-foreground mb-1">Password must have:</p>
                    {[
                      { label: "At least 8 characters", met: passwordChecks.length },
                      { label: "One uppercase letter", met: passwordChecks.uppercase },
                      { label: "One lowercase letter", met: passwordChecks.lowercase },
                      { label: "One number", met: passwordChecks.number },
                    ].map((req, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        {req.met ? <Check className="h-3 w-3 text-green-600" /> : <X className="h-3 w-3 text-muted-foreground" />}
                        <span className={req.met ? "text-green-600" : "text-muted-foreground"}>{req.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-4 pt-4 border-t">
                <p className="text-sm font-medium">Authorization</p>
                <div className="flex items-start gap-3">
                  <Checkbox id="signupAuthorized" name="signupAuthorized" required disabled={loading} className="mt-1" />
                  <Label htmlFor="signupAuthorized" className="text-sm leading-relaxed cursor-pointer">
                    {ATTESTATIONS.signupAuthorized.text}
                  </Label>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating Account...</>) : 'Create Company Account'}
              </Button>
              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                By clicking Create Company Account, you acknowledge and accept the{' '}
                <Link href="/legal/esign-consent" target="_blank" className="underline hover:text-foreground">E-Sign Consent</Link> and{' '}
                <Link href="/legal/terms" target="_blank" className="underline hover:text-foreground">Terms of Service</Link>.
              </p>
            </div>
          </form>
          <div className="mt-4 text-center text-sm">
            Already have an account?{" "}<Link href="/login" className="underline">Sign in</Link>
          </div>
        </CardContent>
        <CardFooter className="flex-col">
          <div className="relative w-full">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Are you a driver?</span></div>
          </div>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg w-full">
            <div className="flex items-start gap-3">
              <Truck className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Drivers join by invitation</p>
                <p className="text-muted-foreground mt-1">Ask your fleet manager to send you an invitation link to create your driver account.</p>
              </div>
            </div>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <RegisterContent />
    </Suspense>
  );
}
