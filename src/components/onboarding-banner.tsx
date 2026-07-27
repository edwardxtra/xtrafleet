"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertTriangle, X, ArrowRight, CheckCircle2 } from "lucide-react";
import { useState } from "react";

interface OnboardingStatus {
  profileComplete?: boolean;
  fmcsaDesignated?: boolean | string;
  completedAt?: string | null;
}

interface OnboardingBannerProps {
  onboardingStatus?: OnboardingStatus;
}

export function OnboardingBanner({ onboardingStatus }: OnboardingBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (!onboardingStatus) return null;

  // Compliance attestations were retired in DEV-154 — they now happen
  // contextually at marketplace, driver-add, and match-confirm surfaces
  // rather than as a setup step.
  const steps = [
    { key: 'profile', label: 'Company Profile', complete: !!onboardingStatus.profileComplete, href: '/dashboard/profile' },
    { key: 'fmcsa', label: 'FMCSA Clearinghouse', complete: onboardingStatus.fmcsaDesignated === true, href: '/onboarding/fmcsa-clearinghouse' },
  ];

  const incompleteSteps = steps.filter(s => !s.complete);
  const allComplete = incompleteSteps.length === 0;

  if (allComplete) return null;

  const nextStep = incompleteSteps[0];

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="space-y-2 flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Complete your setup to unlock all features
            </p>
            <div className="flex flex-wrap gap-3">
              {steps.map(step => (
                <div key={step.key} className="flex items-center gap-1.5 text-xs">
                  {step.complete ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <div className="h-3.5 w-3.5 rounded-full border-2 border-amber-400" />
                  )}
                  <span className={step.complete ? 'text-green-700 dark:text-green-400 line-through' : 'text-amber-700 dark:text-amber-300'}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
            <Button asChild size="sm" variant="default" className="mt-2">
              <Link href={nextStep.href}>
                Continue Setup
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
        <button onClick={() => setDismissed(true)} className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
