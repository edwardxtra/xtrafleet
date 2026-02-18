'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
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
import { useUser, useFirestore } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Loader2, Building2 } from 'lucide-react';

function CreateProfileContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get('error');
  const { user } = useUser();
  const db = useFirestore();

  const handleSkip = async () => {
    if (!user || !db) {
      router.push('/dashboard');
      return;
    }
    try {
      await updateDoc(doc(db, 'owner_operators', user.uid), {
        'onboardingStatus.profileSkipped': true,
        'onboardingStatus.profileSkippedAt': new Date().toISOString(),
      });
    } catch (e) {
      console.error('Failed to save skip status:', e);
    }
    router.push('/dashboard');
  };

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
        <CardFooter className="flex-col items-center justify-center">
          <Button variant="link" className="text-muted-foreground" onClick={handleSkip}>
            Skip for now
          </Button>
        </CardFooter>
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
