'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/firebase';
import { Loader2, UserCircle, Info, X } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast-utils';
import { TRAILER_TYPES } from '@/lib/trailer-types';

interface AddSelfAsDriverButtonProps {
  onSuccess?: () => void;
  alreadyAdded?: boolean;
}

export function AddSelfAsDriverButton({ onSuccess, alreadyAdded }: AddSelfAsDriverButtonProps) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedVehicleTypes, setSelectedVehicleTypes] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    location: '',
    cdlLicense: '',
    cdlExpiry: '',
    medicalCardExpiry: '',
    endorsements: '',
  });

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleVehicleType = (value: string) => {
    setSelectedVehicleTypes(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
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
          ...formData,
          vehicleTypes: selectedVehicleTypes,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to add yourself as a driver.');
      showSuccess('You have been added as a driver to your fleet!');
      setOpen(false);
      onSuccess?.();
    } catch (err: any) {
      showError(err.message || 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (alreadyAdded) {
    return (
      <Button size="sm" variant="outline" disabled className="h-8 gap-1 opacity-60">
        <UserCircle className="h-3.5 w-3.5" />
        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Added as Driver</span>
      </Button>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1">
          <UserCircle className="h-3.5 w-3.5" />
          <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Add Myself as Driver</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-headline">Add Yourself as a Driver</SheetTitle>
          <SheetDescription>
            Create a driver profile under your fleet. You will remain logged in as an owner-operator — this is a driver record only, with no separate login.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-6">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              This adds you as a driveable asset on your own fleet. You&apos;ll always log in as an owner-operator — there is no separate driver login tied to this profile.
            </AlertDescription>
          </Alert>

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
            <Label htmlFor="self-location">Home Location</Label>
            <Input
              id="self-location"
              value={formData.location}
              onChange={e => handleChange('location', e.target.value)}
              placeholder="e.g., Miami, FL"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label>Vehicle Types</Label>
            <div className="flex flex-wrap gap-2">
              {TRAILER_TYPES.map(type => (
                <Badge
                  key={type.value}
                  variant={selectedVehicleTypes.includes(type.value) ? 'default' : 'outline'}
                  className="cursor-pointer select-none"
                  onClick={() => toggleVehicleType(type.value)}
                >
                  {selectedVehicleTypes.includes(type.value) && <X className="h-3 w-3 mr-1" />}
                  {type.label}
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="self-cdl">CDL Number</Label>
              <Input
                id="self-cdl"
                value={formData.cdlLicense}
                onChange={e => handleChange('cdlLicense', e.target.value)}
                placeholder="CDL Number"
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
            <Label htmlFor="self-medCard">Medical Card Expiry</Label>
            <Input
              id="self-medCard"
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
              placeholder="e.g., H, N, T"
              disabled={isSubmitting}
            />
          </div>

          <SheetFooter className="pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
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
    </Sheet>
  );
}
