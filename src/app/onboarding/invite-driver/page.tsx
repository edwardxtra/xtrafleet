'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Logo } from '@/components/logo';
import { useAuth } from '@/firebase';
import { Loader2, Users, Plus, X, ExternalLink } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast-utils';

interface DriverInvite {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export default function OnboardingInviteDriverPage() {
  const router = useRouter();
  const auth = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasCertifiedDQF, setHasCertifiedDQF] = useState(false);
  const [drivers, setDrivers] = useState<DriverInvite[]>([
    { id: crypto.randomUUID(), firstName: '', lastName: '', email: '' },
  ]);

  const addDriver = () => {
    setDrivers(prev => [...prev, { id: crypto.randomUUID(), firstName: '', lastName: '', email: '' }]);
  };

  const removeDriver = (id: string) => {
    if (drivers.length > 1) setDrivers(prev => prev.filter(d => d.id !== id));
  };

  const updateDriver = (id: string, field: keyof DriverInvite, value: string) => {
    setDrivers(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const validateDrivers = (): string | null => {
    for (let i = 0; i < drivers.length; i++) {
      const d = drivers[i];
      if (!d.firstName.trim()) return `Driver ${i + 1}: First name required`;
      if (!d.lastName.trim()) return `Driver ${i + 1}: Last name required`;
      if (!d.email.trim()) return `Driver ${i + 1}: Email required`;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return `Driver ${i + 1}: Invalid email`;
    }
    const emails = drivers.map(d => d.email.toLowerCase());
    const duplicates = emails.filter((e, i) => emails.indexOf(e) !== i);
    if (duplicates.length > 0) return `Duplicate email: ${[...new Set(duplicates)].join(', ')}`;
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) { showError('You must be logged in.'); return; }
    if (!hasCertifiedDQF) { showError('Please certify the DQF requirement.'); return; }
    const error = validateDrivers();
    if (error) { showError(error); return; }

    setIsSubmitting(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/add-drivers-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          drivers: drivers.map(d => ({
            firstName: d.firstName.trim(),
            lastName: d.lastName.trim(),
            email: d.email.trim().toLowerCase(),
          })),
          dqfCertification: { accepted: true, timestamp: new Date().toISOString(), userId: user.uid },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to send invitations');
      const count = result.successful || drivers.length;
      showSuccess(`${count} invitation${count !== 1 ? 's' : ''} sent!`);
      router.push('/onboarding/add-load');
    } catch (err: any) {
      showError(err.message || 'Failed to send invitations');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    router.push('/onboarding/add-load');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader className="space-y-4 text-center">
          <Link href="/" passHref className="inline-block">
            <Logo />
          </Link>
          <div className="flex items-center justify-center gap-2 text-primary">
            <Users className="h-5 w-5" />
            <span className="text-sm font-medium">Step 5 of 6</span>
          </div>
          <CardTitle className="font-headline text-2xl">Invite Your First Driver</CardTitle>
          <CardDescription className="text-left">
            Add drivers to your fleet so you can start matching them with loads. You can always add more drivers later from your dashboard.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <Label className="text-base font-medium">Driver Information</Label>
              {drivers.map((driver, index) => (
                <div key={driver.id} className="relative rounded-lg border p-4 space-y-3">
                  {drivers.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8"
                      onClick={() => removeDriver(driver.id)}
                      disabled={isSubmitting}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  <p className="text-sm font-medium text-muted-foreground">Driver {index + 1}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor={`firstName-${driver.id}`}>
                        First Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id={`firstName-${driver.id}`}
                        value={driver.firstName}
                        onChange={e => updateDriver(driver.id, 'firstName', e.target.value)}
                        placeholder="John"
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`lastName-${driver.id}`}>
                        Last Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id={`lastName-${driver.id}`}
                        value={driver.lastName}
                        onChange={e => updateDriver(driver.id, 'lastName', e.target.value)}
                        placeholder="Smith"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`email-${driver.id}`}>
                      Email <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id={`email-${driver.id}`}
                      type="email"
                      value={driver.email}
                      onChange={e => updateDriver(driver.id, 'email', e.target.value)}
                      placeholder="driver@example.com"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={addDriver}
                disabled={isSubmitting}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Another Driver
              </Button>
            </div>

            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="dqf-certification"
                  checked={hasCertifiedDQF}
                  onCheckedChange={checked => setHasCertifiedDQF(checked as boolean)}
                />
                <div className="flex-1">
                  <label htmlFor="dqf-certification" className="text-sm font-medium cursor-pointer">
                    We certify that these drivers have complete and current Driver Qualification Files as required by applicable law and that we remain responsible for all driver qualification and compliance obligations.
                  </label>
                  <a
                    href="/legal/dqf-requirements"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-2"
                  >
                    Learn More <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>

            <Alert>
              <AlertDescription className="text-sm">
                Each driver will receive an email invitation to complete their profile and consent to verification.
              </AlertDescription>
            </Alert>
          </CardContent>

          <CardFooter className="flex-col gap-3">
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isSubmitting || !hasCertifiedDQF}
            >
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending Invitations...</>
              ) : (
                `Send ${drivers.length} Invitation${drivers.length !== 1 ? 's' : ''} & Continue`
              )}
            </Button>
            <Button
              type="button"
              variant="link"
              className="text-muted-foreground"
              onClick={handleSkip}
              disabled={isSubmitting}
            >
              Skip for now
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
