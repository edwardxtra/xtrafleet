'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast-utils';
import { ATTESTATIONS, type AttestationType } from '@/lib/attestations';

interface AttestationRecaptureSheetProps {
  /** Attestation types eligible for capture in this sheet (allowlist). */
  candidateTypes: AttestationType[];
  /** Subset of candidateTypes that are currently MISSING and should be capturable. */
  missingTypes: AttestationType[];
  /** Optional context — required for driver_add types, omitted for profile types. */
  driverId?: string;
  /** Free-form context label rendered in the sheet header. */
  contextLabel?: string;
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCaptured?: () => void;
}

export function AttestationRecaptureSheet({
  candidateTypes,
  missingTypes,
  driverId,
  contextLabel,
  title,
  description,
  open,
  onOpenChange,
  onCaptured,
}: AttestationRecaptureSheetProps) {
  const [checked, setChecked] = useState<Set<AttestationType>>(new Set(missingTypes));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setChecked(new Set(missingTypes));
    }
  }, [open, missingTypes]);

  function toggle(type: AttestationType) {
    setChecked(prev => {
      const copy = new Set(prev);
      if (copy.has(type)) {
        copy.delete(type);
      } else {
        copy.add(type);
      }
      return copy;
    });
  }

  async function handleSubmit() {
    if (checked.size === 0) {
      showError('Select at least one attestation to capture.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/append-attestations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          types: Array.from(checked),
          ...(driverId ? { driverId } : {}),
          deviceInfo: {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to capture attestations');
      }
      showSuccess(`Captured ${(data.captured || []).length} attestation(s).`);
      onOpenChange(false);
      onCaptured?.();
    } catch (e: any) {
      console.error('[AttestationRecaptureSheet] submit error', e);
      showError(e?.message || 'Failed to capture attestations.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {description}
            {contextLabel && (
              <>
                {' '}
                <strong>{contextLabel}</strong>
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        <Alert className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Only check items that are accurate right now. Recording an attestation
            you can&apos;t back up creates compliance and legal exposure.
          </AlertDescription>
        </Alert>

        <div className="mt-6 space-y-4">
          {candidateTypes.map(type => {
            const isMissing = missingTypes.includes(type);
            const def = ATTESTATIONS[type];
            return (
              <div
                key={type}
                className={`flex items-start gap-3 rounded-md border p-3 ${isMissing ? '' : 'opacity-60'}`}
              >
                <Checkbox
                  id={`attest-${type}`}
                  checked={checked.has(type)}
                  onCheckedChange={() => toggle(type)}
                  disabled={!isMissing || submitting}
                  className="mt-1"
                />
                <div className="space-y-1">
                  <Label htmlFor={`attest-${type}`} className="cursor-pointer text-sm font-medium">
                    {type}
                    {!isMissing && (
                      <span className="ml-2 text-xs text-muted-foreground">(already on file)</span>
                    )}
                  </Label>
                  <p className="text-xs text-muted-foreground leading-relaxed">{def.text}</p>
                </div>
              </div>
            );
          })}
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || checked.size === 0}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Capture {checked.size > 0 ? `(${checked.size})` : ''}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
