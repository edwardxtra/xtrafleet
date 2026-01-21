'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
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
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { Loader2, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast-utils';

function AuthActionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const auth = useAuth();

  const mode = searchParams.get('mode');
  const oobCode = searchParams.get('oobCode');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Verify the code on mount
  useEffect(() => {
    async function verifyCode() {
      if (!oobCode) {
        setError('Invalid or missing reset code.');
        setLoading(false);
        return;
      }

      if (mode !== 'resetPassword') {
        setError('This action is not supported.');
        setLoading(false);
        return;
      }

      try {
        // Verify the password reset code and get the email
        const userEmail = await verifyPasswordResetCode(auth, oobCode);
        setEmail(userEmail);
        setLoading(false);
      } catch (e: any) {
        console.error('Code verification error:', e);
        if (e.code === 'auth/expired-action-code') {
          setError('This reset link has expired. Please request a new one.');
        } else if (e.code === 'auth/invalid-action-code') {
          setError('This reset link is invalid or has already been used.');
        } else {
          setError('Unable to verify reset link. Please try again.');
        }
        setLoading(false);
      }
    }

    verifyCode();
  }, [auth, oobCode, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!oobCode) {
      setError('Invalid reset code.');
      return;
    }

    setSubmitting(true);

    try {
      await confirmPasswordReset(auth, oobCode, password);
      setSuccess(true);
      showSuccess('Password reset successfully!');

      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (e: any) {
      console.error('Password reset error:', e);
      if (e.code === 'auth/expired-action-code') {
        setError('This reset link has expired. Please request a new one.');
      } else if (e.code === 'auth/invalid-action-code') {
        setError('This reset link is invalid or has already been used.');
      } else if (e.code === 'auth/weak-password') {
        setError('Password is too weak. Please use a stronger password.');
      } else {
        setError('Failed to reset password. Please try again.');
      }
      showError('Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="mx-auto w-full max-w-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Verifying reset link...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state (invalid/expired code)
  if (error && !email) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="mx-auto w-full max-w-sm">
          <CardHeader className="space-y-4 text-center">
            <Link href="/" passHref className="inline-block">
              <Logo />
            </Link>
            <div className="flex justify-center">
              <XCircle className="h-12 w-12 text-destructive" />
            </div>
            <CardTitle className="font-headline text-2xl">
              Reset Link Invalid
            </CardTitle>
            <CardDescription>
              {error}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Button asChild className="w-full">
                <Link href="/forgot-password">Request New Reset Link</Link>
              </Button>
              <div className="text-center">
                <Link
                  href="/login"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Back to login
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="mx-auto w-full max-w-sm">
          <CardHeader className="space-y-4 text-center">
            <Link href="/" passHref className="inline-block">
              <Logo />
            </Link>
            <div className="flex justify-center">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
            <CardTitle className="font-headline text-2xl">
              Password Reset!
            </CardTitle>
            <CardDescription>
              Your password has been successfully reset. Redirecting to login...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/login">Go to Login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Password reset form
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="mx-auto w-full max-w-sm">
        <CardHeader className="space-y-4 text-center">
          <Link href="/" passHref className="inline-block">
            <Logo />
          </Link>
          <CardTitle className="font-headline text-2xl">
            Reset Your Password
          </CardTitle>
          <CardDescription>
            {email && (
              <>Enter a new password for <strong>{email}</strong></>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter new password"
                    required
                    disabled={submitting}
                    minLength={6}
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    required
                    disabled={submitting}
                    minLength={6}
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  'Reset Password'
                )}
              </Button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Back to login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AuthActionPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <AuthActionContent />
    </Suspense>
  );
}
