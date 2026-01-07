// Replace src/app/forgot-password/page.tsx with this:

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
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
import { sendPasswordReset } from '@/lib/actions';
import { useFormState, useFormStatus } from 'react-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, Loader2, WifiOff, ArrowLeft, CheckCircle } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast-utils';

const initialState = {
  message: '',
  error: '',
};

// Submit button component with loading state
function SubmitButton({ isOnline }: { isOnline: boolean }) {
  const { pending } = useFormStatus();
  
  return (
    <Button type="submit" className="w-full" disabled={pending || !isOnline}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Sending...
        </>
      ) : (
        'Send Reset Link'
      )}
    </Button>
  );
}

export default function ForgotPasswordPage() {
  const [state, formAction] = useFormState(sendPasswordReset, initialState);
  const [isOnline, setIsOnline] = useState(true);
  const [emailSent, setEmailSent] = useState(false);

  // Network status detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showSuccess('You\'re back online!');
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Handle state changes
  useEffect(() => {
    if (state?.message) {
      setEmailSent(true);
      showSuccess('Check your email for the reset link!');
    }
    if (state?.error) {
      showError(state.error);
    }
  }, [state]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="mx-auto w-full max-w-sm">
        <CardHeader className="space-y-4 text-center">
          <Link href="/" passHref className="inline-block">
            <Logo />
          </Link>
          <CardTitle className="font-headline text-2xl">
            Forgot Your Password?
          </CardTitle>
          <CardDescription>
            {emailSent 
              ? 'Check your email for the reset link.'
              : 'No problem. Enter your email below and we\'ll send you a link to reset it.'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Offline Banner */}
          {!isOnline && (
            <Alert variant="destructive" className="mb-4">
              <WifiOff className="h-4 w-4" />
              <AlertDescription>
                You're offline. Please check your connection.
              </AlertDescription>
            </Alert>
          )}

          {state?.error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          {emailSent ? (
            <div className="space-y-4">
              <Alert className="border-green-500 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700">
                  {state.message}
                </AlertDescription>
              </Alert>
              
              <div className="text-center text-sm text-muted-foreground">
                <p>Didn't receive the email?</p>
                <Button 
                  variant="link" 
                  className="p-0 h-auto"
                  onClick={() => setEmailSent(false)}
                >
                  Try again
                </Button>
              </div>
            </div>
          ) : (
            <form action={formAction}>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    name="email"
                    placeholder="m@example.com"
                    required
                    disabled={!isOnline}
                    autoComplete="email"
                  />
                </div>
                <SubmitButton isOnline={isOnline} />
              </div>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link 
              href="/login" 
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
