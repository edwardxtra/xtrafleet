"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useRef } from "react";
import { useAuth } from "@/firebase";
import { Loader2, Plus, X, Shield } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ATTESTATIONS, type AttestationType } from "@/lib/attestations";

const DRIVER_ADD_ATTESTATIONS: AttestationType[] = [
  'driverDqf',
  'driverFmcsaChecks',
  'driverAuthority',
];
type DriverChecks = Record<AttestationType, boolean>;

interface DriverInvite {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export function AddDriverForm() {
  const { toast } = useToast();
  const auth = useAuth();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [driverChecks, setDriverChecks] = useState<DriverChecks>(
    () =>
      DRIVER_ADD_ATTESTATIONS.reduce(
        (acc, t) => ({ ...acc, [t]: false }),
        {} as DriverChecks,
      ),
  );
  const allDriverChecked = DRIVER_ADD_ATTESTATIONS.every(t => driverChecks[t]);
  
  const [drivers, setDrivers] = useState<DriverInvite[]>([
    { id: crypto.randomUUID(), firstName: "", lastName: "", email: "" }
  ]);

  const addDriver = () => {
    setDrivers([...drivers, { id: crypto.randomUUID(), firstName: "", lastName: "", email: "" }]);
  };

  const removeDriver = (id: string) => {
    if (drivers.length > 1) {
      setDrivers(drivers.filter(d => d.id !== id));
    }
  };

  const updateDriver = (id: string, field: keyof DriverInvite, value: string) => {
    setDrivers(drivers.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const validateDrivers = () => {
    const errors: string[] = [];
    drivers.forEach((driver, index) => {
      if (!driver.firstName.trim()) errors.push(`Driver ${index + 1}: First name required`);
      if (!driver.lastName.trim()) errors.push(`Driver ${index + 1}: Last name required`);
      if (!driver.email.trim()) errors.push(`Driver ${index + 1}: Email required`);
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(driver.email)) errors.push(`Driver ${index + 1}: Invalid email`);
    });
    const emails = drivers.map(d => d.email.toLowerCase());
    const duplicates = emails.filter((email, index) => emails.indexOf(email) !== index);
    if (duplicates.length > 0) errors.push(`Duplicate emails: ${[...new Set(duplicates)].join(", ")}`);
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      toast({ title: "Error", description: "You must be logged in.", variant: "destructive" });
      return;
    }
    if (!allDriverChecked) {
      toast({ title: "Attestations Required", description: "Please confirm all three driver compliance attestations.", variant: "destructive" });
      return;
    }
    const errors = validateDrivers();
    if (errors.length > 0) {
      toast({ title: "Validation Error", description: errors[0], variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/add-drivers-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({
          drivers: drivers.map(d => ({ firstName: d.firstName.trim(), lastName: d.lastName.trim(), email: d.email.trim().toLowerCase() })),
          // DEV-154 phase 3: server records 3 attestations per invited driver
          // (driverDqf, driverFmcsaChecks, driverAuthority) on the owner's
          // unified attestations array.
          attestDriverAdd: true,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to send invitations');

      const count = result.successful || drivers.length;
      toast({ title: "Success", description: `${count} invitation${count !== 1 ? 's' : ''} sent!` });
      setDrivers([{ id: crypto.randomUUID(), firstName: "", lastName: "", email: "" }]);
      setDriverChecks(
        DRIVER_ADD_ATTESTATIONS.reduce(
          (acc, t) => ({ ...acc, [t]: false }),
          {} as DriverChecks,
        ),
      );
      closeRef.current?.click();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SheetContent className="sm:max-w-2xl overflow-y-auto">
      <SheetHeader>
        <SheetTitle className="font-headline">Add Drivers to Your Fleet</SheetTitle>
        <SheetDescription>Invite drivers for short-term leasing opportunities.</SheetDescription>
      </SheetHeader>
      <form onSubmit={handleSubmit} className="space-y-6 py-6">
        <div className="space-y-4">
          <Label className="text-base font-medium">Driver Information</Label>
          {drivers.map((driver, index) => (
            <div key={driver.id} className="p-4 border rounded-lg space-y-3 relative">
              {drivers.length > 1 && (
                <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 h-8 w-8"
                  onClick={() => removeDriver(driver.id)} disabled={isSubmitting}>
                  <X className="h-4 w-4" />
                </Button>
              )}
              <div className="text-sm font-medium text-muted-foreground mb-2">Driver {index + 1}</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor={`firstName-${driver.id}`}>First Name <span className="text-destructive">*</span></Label>
                  <Input id={`firstName-${driver.id}`} value={driver.firstName}
                    onChange={(e) => updateDriver(driver.id, "firstName", e.target.value)}
                    placeholder="John" disabled={isSubmitting} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`lastName-${driver.id}`}>Last Name <span className="text-destructive">*</span></Label>
                  <Input id={`lastName-${driver.id}`} value={driver.lastName}
                    onChange={(e) => updateDriver(driver.id, "lastName", e.target.value)}
                    placeholder="Smith" disabled={isSubmitting} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`email-${driver.id}`}>Email <span className="text-destructive">*</span></Label>
                <Input id={`email-${driver.id}`} type="email" value={driver.email}
                  onChange={(e) => updateDriver(driver.id, "email", e.target.value)}
                  placeholder="driver@example.com" disabled={isSubmitting} required />
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addDriver} disabled={isSubmitting} className="w-full">
            <Plus className="h-4 w-4 mr-2" />Add Another Driver
          </Button>
        </div>
        <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-600" />
            <h4 className="font-medium text-sm">Driver Compliance Attestations</h4>
          </div>
          <p className="text-xs text-muted-foreground">
            Required for each driver you invite. By checking each box you confirm:
          </p>
          <div className="space-y-2.5">
            {DRIVER_ADD_ATTESTATIONS.map(type => {
              const def = ATTESTATIONS[type];
              return (
                <div key={type} className="flex items-start space-x-3">
                  <Checkbox
                    id={`driver-${type}`}
                    checked={driverChecks[type]}
                    onCheckedChange={checked =>
                      setDriverChecks(prev => ({ ...prev, [type]: checked === true }))
                    }
                    disabled={isSubmitting}
                    className="mt-0.5"
                  />
                  <Label htmlFor={`driver-${type}`} className="text-xs leading-relaxed cursor-pointer">
                    {def.text}
                  </Label>
                </div>
              );
            })}
          </div>
        </div>
        <Alert>
          <AlertDescription className="text-sm">
            Each driver will receive an email invitation to complete their profile and consent to verification.
          </AlertDescription>
        </Alert>
        <SheetFooter className="pt-6">
          <SheetClose asChild>
            <Button ref={closeRef} type="button" variant="secondary" disabled={isSubmitting}>Cancel</Button>
          </SheetClose>
          <Button type="submit" variant="accent" disabled={isSubmitting || !allDriverChecked}>
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
            ) : (
              `Send ${drivers.length} Invitation${drivers.length !== 1 ? 's' : ''}`
            )}
          </Button>
        </SheetFooter>
      </form>
    </SheetContent>
  );
}
