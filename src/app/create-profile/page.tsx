'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CompanyProfileForm } from '@/components/company-profile-form';
import { Logo } from '@/components/logo';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Building2 } from 'lucide-react';

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
          <div className="flex items-center justify-center gap-2 text-primary">
            <Building2 className="h-5 w-5" />
            <span className="text-sm font-medium">Step 1 of 5</span>
          </div>
          <CardTitle className="font-headline text-2xl">
            Create Your Company Profile
          </CardTitle>
          <CardDescription>
            Tell us more about your business to get started. You can save partial info and come back later.
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
      </Card>
    </div>
  );
}

export default function CreateProfilePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    }>
      <CreateProfileContent />
    </Suspense>
  );
}
