'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/logo';
import { useUser, useFirestore } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Loader2, Shield, CheckCircle2 } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast-utils';

const ATTESTATIONS = [
  {
    id: 'driverQualificationFiles',
    title: 'Driver Qualification Files',
    description: 'We confirm that we maintain Driver Qualification Files (DQFs) for all drivers we invite or make available on the XtraFleet platform, in accordance with applicable federal and state regulations.',
  },
  {
    id: 'employmentCompliance',
    title: 'Employment & Compliance Responsibility',
    description: 'We acknowledge that our company retains full responsibility for employment decisions, compliance determinations, and regulatory obligations related to our drivers.',
  },
  {
    id: 'verificationAuth',
    title: 'Verification Use Authorization',
    description: 'We authorize XtraFleet to facilitate limited, transaction-based eligibility verification (e.g., license status, endorsements, Clearinghouse eligibility) on our behalf, subject to driver consent.',
  },
  {
    id: 'noRelianceDisclaimer',
    title: 'No Reliance Disclaimer',
    description: 'We understand that verification results provided through XtraFleet are eligibility signals only and do not replace our independent compliance or safety obligations.',
  },
] as const;

type AttestationId = typeof ATTESTATIONS[number]['id'];

function ComplianceContent() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const [checked, setChecked] = useState<Record<AttestationId, boolean>>({
    driverQualificationFiles: false,
    employmentCompliance: false,
    verificationAuth: false,
    noRelianceDisclaimer: false,
  });
  const [submitting, setSubmitting] = useState(false);

  const allChecked = Object.values(checked).every(Boolean);
  const toggleCheck = (id: AttestationId) => setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleSubmit = async () => {
    if (!allChecked || !user || !db) return;
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'owner_operators', user.uid), {
        'onboardingStatus.complianceAttested': true,
        'onboardingStatus.complianceAttestedAt': new Date().toISOString(),
        complianceAttestations: {
          driverQualificationFiles: { accepted: true, acceptedAt: new Date().toISOString() },
          employmentCompliance: { accepted: true, acceptedAt: new Date().toISOString() },
          verificationAuth: { accepted: true, acceptedAt: new Date().toISOString() },
          noRelianceDisclaimer: { accepted: true, acceptedAt: new Date().toISOString() },
        },
      });
      showSuccess('Compliance acknowledgments saved!');
      router.push('/onboarding/fmcsa-clearinghouse');
    } catch (error) {
      console.error('Failed to save attestations:', error);
      showError('Failed to save. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    if (!user || !db) { router.push('/dashboard'); return; }
    try {
      await updateDoc(doc(db, 'owner_operators', user.uid), {
        'onboardingStatus.complianceSkipped': true,
        'onboardingStatus.complianceSkippedAt': new Date().toISOString(),
      });
    } catch (e) {
      console.error('Failed to save skip status:', e);
    }
    router.push('/dashboard');
  };

  if (isUserLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!user) { router.push('/login'); return null; }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader className="space-y-4 text-center">
          <Link href="/" passHref className="inline-block"><Logo /></Link>
          <div className="flex items-center justify-center gap-2 text-primary">
            <Shield className="h-5 w-5" />
            <span className="text-sm font-medium">Step 2 of 3</span>
          </div>
          <CardTitle className="font-headline text-2xl">Compliance Acknowledgments</CardTitle>
          <CardDescription>Please confirm the following to proceed. These acknowledgments are required to participate in the XtraFleet marketplace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ATTESTATIONS.map((attestation) => (
            <div key={attestation.id} className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${checked[attestation.id] ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
              <Checkbox id={attestation.id} checked={checked[attestation.id]} onCheckedChange={() => toggleCheck(attestation.id)} className="mt-0.5" />
              <Label htmlFor={attestation.id} className="cursor-pointer space-y-1">
                <span className="text-sm font-medium flex items-center gap-2">
                  {attestation.title}
                  {checked[attestation.id] && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                </span>
                <p className="text-sm text-muted-foreground leading-relaxed">{attestation.description}</p>
              </Label>
            </div>
          ))}
        </CardContent>
        <CardFooter className="flex-col gap-3">
          <Button onClick={handleSubmit} disabled={!allChecked || submitting} className="w-full" size="lg">
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : 'Agree & Continue'}
          </Button>
          <Button variant="link" className="text-muted-foreground" onClick={handleSkip}>Skip for now</Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function CompliancePage() {
  return <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}><ComplianceContent /></Suspense>;
}
