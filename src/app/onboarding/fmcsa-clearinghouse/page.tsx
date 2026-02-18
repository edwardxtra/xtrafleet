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
import { Loader2, Database, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast-utils';

const CLEARINGHOUSE_URL = 'https://clearinghouse.fmcsa.dot.gov';
const XTRAFLEET_ENTITY_NAME = 'XtraFleet Technologies Inc.';

function FMCSAClearinghouseContent() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const [alreadyDesignated, setAlreadyDesignated] = useState(false);
  const [acknowledgment, setAcknowledgment] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = (alreadyDesignated || acknowledgment);

  const handleSubmit = async () => {
    if (!canSubmit || !user || !db) return;

    setSubmitting(true);
    try {
      const ownerDocRef = doc(db, 'owner_operators', user.uid);
      await updateDoc(ownerDocRef, {
        'onboardingStatus.fmcsaDesignated': alreadyDesignated ? true : 'pending',
        'onboardingStatus.fmcsaDesignatedAt': new Date().toISOString(),
        clearinghouseCompletedAt: new Date().toISOString(),
        fmcsaClearinghouse: {
          alreadyDesignated: alreadyDesignated,
          acknowledgment: acknowledgment,
          submittedAt: new Date().toISOString(),
        },
      });

      showSuccess(alreadyDesignated
        ? 'FMCSA designation confirmed!'
        : 'Acknowledgment saved. You can complete the designation at any time.'
      );
      router.push('/onboarding/invite-driver');
    } catch (error) {
      console.error('Failed to save FMCSA status:', error);
      showError('Failed to save. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    if (!user || !db) return;

    try {
      const ownerDocRef = doc(db, 'owner_operators', user.uid);
      await updateDoc(ownerDocRef, {
        'onboardingStatus.fmcsaDesignated': 'skipped',
      });
    } catch (error) {
      console.error('Failed to save skip status:', error);
    }
    router.push('/onboarding/invite-driver');
  };

  if (isUserLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    router.push('/login');
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader className="space-y-4 text-center">
          <Link href="/" passHref className="inline-block">
            <Logo />
          </Link>
          <div className="flex items-center justify-center gap-2 text-primary">
            <Database className="h-5 w-5" />
            <span className="text-sm font-medium">Step 3 of 5</span>
          </div>
          <CardTitle className="font-headline text-2xl">
            FMCSA Clearinghouse Authorization
          </CardTitle>
          <CardDescription className="text-left">
            To enable Drug & Alcohol Clearinghouse eligibility checks, XtraFleet must be
            designated as your <strong>Designated Agent</strong> in the FMCSA Clearinghouse.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <p className="text-sm font-medium">What This Means:</p>
            <ul className="text-sm text-muted-foreground space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                XtraFleet can submit <strong>Limited Queries only</strong>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                Queries are run <strong>with driver consent</strong>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                You remain the employer of record
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                No violation details are stored or displayed
              </li>
            </ul>
          </div>

          <div
            className={`rounded-lg border p-4 transition-colors ${
              alreadyDesignated ? 'border-primary/30 bg-primary/5' : 'border-border'
            }`}
          >
            <div className="flex items-start gap-3">
              <Checkbox
                id="alreadyDesignated"
                checked={alreadyDesignated}
                onCheckedChange={(checked) => {
                  setAlreadyDesignated(checked === true);
                  if (checked) setAcknowledgment(false);
                }}
                className="mt-0.5"
              />
              <Label htmlFor="alreadyDesignated" className="cursor-pointer space-y-1">
                <span className="text-sm font-medium">Option A — Already Designated</span>
                <p className="text-sm text-muted-foreground">
                  We have already designated <strong>{XTRAFLEET_ENTITY_NAME}</strong> as a
                  Designated Agent in the FMCSA Clearinghouse.
                </p>
              </Label>
            </div>
          </div>

          <div
            className={`rounded-lg border p-4 transition-colors ${
              !alreadyDesignated && acknowledgment ? 'border-primary/30 bg-primary/5' : 'border-border'
            }`}
          >
            <div className="space-y-4">
              <p className="text-sm font-medium">Option B — Not Yet Designated (Most Fleets)</p>
              <p className="text-sm text-muted-foreground">
                To designate, visit the FMCSA Clearinghouse:
              </p>

              <Button variant="outline" size="sm" asChild>
                <a href={CLEARINGHOUSE_URL} target="_blank" rel="noopener noreferrer">
                  Open FMCSA Clearinghouse
                  <ExternalLink className="h-4 w-4 ml-2" />
                </a>
              </Button>

              <button
                type="button"
                onClick={() => setShowInstructions(!showInstructions)}
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                {showInstructions ? 'Hide' : 'Show'} step-by-step instructions
                {showInstructions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {showInstructions && (
                <div className="rounded-md bg-muted/50 p-4 space-y-2">
                  <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                    <li>Log into the <a href={CLEARINGHOUSE_URL} target="_blank" rel="noopener noreferrer" className="text-primary underline">FMCSA Clearinghouse</a></li>
                    <li>Navigate to: <span className="font-mono text-xs">My Account → Designated Agents</span></li>
                    <li>Add <strong>{XTRAFLEET_ENTITY_NAME}</strong></li>
                    <li>Select <strong>Limited Query</strong> permissions</li>
                    <li>Save changes and return here</li>
                  </ol>
                </div>
              )}

              <div className="flex items-start gap-3 pt-2">
                <Checkbox
                  id="acknowledgment"
                  checked={acknowledgment}
                  onCheckedChange={(checked) => {
                    setAcknowledgment(checked === true);
                    if (checked) setAlreadyDesignated(false);
                  }}
                  className="mt-0.5"
                />
                <Label htmlFor="acknowledgment" className="cursor-pointer">
                  <span className="text-sm text-muted-foreground">
                    We acknowledge that XtraFleet must be designated as a Clearinghouse
                    Designated Agent to facilitate eligibility checks.
                  </span>
                </Label>
              </div>
            </div>
          </div>

          {!alreadyDesignated && (
            <p className="text-xs text-amber-600 dark:text-amber-400 italic">
              Note: Driver matching will be limited until Clearinghouse designation is confirmed.
            </p>
          )}
        </CardContent>

        <CardFooter className="flex-col gap-3">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full"
            size="lg"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
            ) : alreadyDesignated ? (
              'Confirm & Continue'
            ) : (
              "I've Completed This Step"
            )}
          </Button>
          <Button
            variant="link"
            className="text-muted-foreground"
            onClick={handleSkip}
          >
            Skip for now
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function FMCSAClearinghousePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <FMCSAClearinghouseContent />
    </Suspense>
  );
}
