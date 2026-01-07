'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CompanyProfileForm } from '@/components/company-profile-form';
import { Logo } from '@/components/logo';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

function CreateProfileContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader className="space-y-4 text-center">
          <Link href="/" passHref className="inline-block">
            <Logo />
          </Link>
          <CardTitle className="font-headline text-2xl">
            Create Your Company Profile
          </CardTitle>
          <CardDescription>
            Tell us more about your business to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <CompanyProfileForm />
        </CardContent>
        <CardFooter className="flex-col items-center justify-center">
          <Button asChild variant="link">
            <Link href="/dashboard/getting-started">Skip for now</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function CreateProfilePage() {
  return (
    <Suspense>
      <CreateProfileContent />
    </Suspense>
  );
}
