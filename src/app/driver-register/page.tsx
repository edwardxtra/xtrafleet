'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Logo } from '@/components/logo';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DriverRegisterForm } from '@/components/driver-register-form';
import { Button } from '@/components/ui/button';

interface InvitationData {
  email: string;
  ownerId: string;
  status: string;
  expiresAt: { seconds: number };
  driverType?: 'existing' | 'newHire';
}

function DriverRegisterContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<InvitationData | null>(null);

  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setError('No invitation token provided.');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/validate-invitation?token=${token}`);
        const data = await response.json();

        if (!response.ok) {
          setError(data.error || 'Invalid invitation token.');
          setLoading(false);
          return;
        }

        setInvitation(data.invitation);
        setLoading(false);
      } catch (err) {
        console.error('Error validating token:', err);
        setError('Failed to validate invitation. Please try again.');
        setLoading(false);
      }
    }

    validateToken();
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="mx-auto w-full max-w-2xl">
          <CardContent className="pt-6">
            <div className="text-center">Validating invitation...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader className="space-y-4 text-center">
          <Link href="/" passHref className="inline-block">
            <Logo />
          </Link>
          <CardTitle className="font-headline text-2xl">
            Complete Your Driver Profile
          </CardTitle>
          <CardDescription>
            Create your account and tell us a bit about yourself to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!error && invitation && token && (
            <DriverRegisterForm
              driverId={token}
              ownerId={invitation.ownerId}
              invitationEmail={invitation.email}
              driverType={invitation.driverType}
            />
          )}
        </CardContent>
        <CardFooter className="flex-col items-center justify-center">
          <Button asChild variant="link">
            <Link href="/">Back to main page</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function DriverRegisterPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        Loading...
      </div>
    }>
      <DriverRegisterContent />
    </Suspense>
  );
}
