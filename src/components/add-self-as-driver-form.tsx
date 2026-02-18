"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/firebase";
import { Loader2, UserCheck } from "lucide-react";
import { showSuccess, showError } from "@/lib/toast-utils";
import { TRAILER_TYPES } from "@/lib/trailer-types";
import { useRef } from "react";

interface AddSelfAsDriverFormProps {
  onSuccess?: () => void;
}

export function AddSelfAsDriverForm({ onSuccess }: AddSelfAsDriverFormProps) {
  const auth = useAuth();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    location: "",
    phoneNumber: "",
    cdlLicense: "",
    cdlExpiry: "",
    medicalCardExpiry: "",
    endorsements: "",
    vehicleTypes: [] as string[],
  });

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleVehicleTypeToggle = (value: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      vehicleTypes: checked
        ? [...prev.vehicleTypes, value]
        : prev.vehicleTypes.filter(t => t !== value),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) { showError('You must be logged in.'); return; }
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      showError('First and last name are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/add-self-as-driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          location: formData.location.trim(),
          phoneNumber: formData.phoneNumber.trim(),
          cdlLicense: formData.cdlLicense.trim(),
          cdlExpiry: formData.cdlExpiry,
          medicalCardExpiry: formData.medicalCardExpiry,
          endorsements: formData.endorsements.trim(),
          vehicleTypes: formData.vehicleTypes,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to add driver profile');

      showSuccess('You have been added as a driver on your fleet!');
      onSuccess?.();
      closeRef.current?.click();
    } catch (err: any) {
      showError(err.message || 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SheetContent className="sm:max-w-2xl overflow-y-auto">
      <SheetHeader>
        <SheetTitle className="font-headline flex items-center gap-2">
          <UserCheck className="h-5 w-5" />
          Add Yourself as a Driver
        </SheetTitle>
        <SheetDescription>
          Create a driver profile for yourself under your fleet. You&apos;ll remain logged in as an owner-operator.
        </SheetDescription>
      </SheetHeader>

      <Alert className="mt-4">
        <AlertDescription className="text-sm">
          This creates a driver record under your account for matching purposes. Your login and owner-operator dashboard are not affected.
        </AlertDescription>
      </Alert>

      <form onSubmit={handleSubmit} className="space-y-6 py-6">
        {/* Name */}
        <div className="space-y-3">
          <Label className="text-base font-medium">Your Name</Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="self-firstName">First Name <span className="text-destructive">*</span></Label>
              <Input
                id="self-firstName"
                value={formData.firstName}
                onChange={e => handleChange('firstName', e.target.value)}
                placeholder="John"
                disabled={isSubmitting}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="self-lastName">Last Name <span className="text-destructive">*</span></Label>
              <Input
                id="self-lastName"
                value={formData.lastName}
                onChange={e => handleChange('lastName', e.target.value)}
                placeholder="Smith"
                disabled={isSubmitting}
                required
              />
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className="space-y-3">
          <Label className="text-base font-medium">Contact & Location</Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="self-phone">Phone Number</Label>
              <Input
                id="self-phone"
                value={formData.phoneNumber}
                onChange={e => handleChange('phoneNumber', e.target.value)}
                placeholder="(555) 000-0000"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="self-location">Location</Label>
              <Input
                id="self-location"
                value={formData.location}
                onChange={e => handleChange('location', e.target.value)}
                placeholder="Miami, FL"
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>

        {/* CDL */}
        <div className="space-y-3">
          <Label className="text-base font-medium">CDL Information</Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="self-cdlLicense">CDL Number</Label>
              <Input
                id="self-cdlLicense"
                value={formData.cdlLicense}
                onChange={e => handleChange('cdlLicense', e.target.value)}
                placeholder="CDL123456"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="self-cdlExpiry">CDL Expiry</Label>
              <Input
                id="self-cdlExpiry"
                type="date"
                value={formData.cdlExpiry}
                onChange={e => handleChange('cdlExpiry', e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="self-medicalCardExpiry">Medical Card Expiry</Label>
            <Input
              id="self-medicalCardExpiry"
              type="date"
              value={formData.medicalCardExpiry}
              onChange={e => handleChange('medicalCardExpiry', e.target.value)}
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="self-endorsements">Endorsements</Label>
            <Input
              id="self-endorsements"
              value={formData.endorsements}
              onChange={e => handleChange('endorsements', e.target.value)}
              placeholder="e.g., Hazmat, Tanker"
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Vehicle Types */}
        <div className="space-y-3">
          <Label className="text-base font-medium">Vehicle Types You Can Drive</Label>
          <div className="flex flex-wrap gap-3">
            {TRAILER_TYPES.map(type => (
              <div key={type.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`self-vt-${type.value}`}
                  checked={formData.vehicleTypes.includes(type.value)}
                  onCheckedChange={checked => handleVehicleTypeToggle(type.value, checked as boolean)}
                  disabled={isSubmitting}
                />
                <label htmlFor={`self-vt-${type.value}`} className="text-sm font-medium cursor-pointer">
                  {type.label}
                </label>
              </div>
            ))}
          </div>
        </div>

        <SheetFooter className="pt-6">
          <SheetClose asChild>
            <Button ref={closeRef} type="button" variant="secondary" disabled={isSubmitting}>Cancel</Button>
          </SheetClose>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Adding...</>
            ) : (
              'Add Myself as Driver'
            )}
          </Button>
        </SheetFooter>
      </form>
    </SheetContent>
  );
}
