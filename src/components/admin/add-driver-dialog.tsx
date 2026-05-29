'use client';

/**
 * Add Driver dialog — admin creates a driver on behalf of any owner-operator
 * (DEV-170). Mirrors the customer-side driver creation surface and calls
 * `POST /api/admin/drivers`. Default `profileStatus` is `confirmed` per the
 * decision recorded on DEV-170 — admin is expected to have verified offline.
 */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { showError, showSuccess } from '@/lib/toast-utils';
import { OwnerOperatorPicker, type PickerOwnerOperator } from './owner-operator-picker';

interface AddDriverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** Optional pre-selected owner-operator id (deep link from /admin/onboard). */
  initialOwnerOperatorId?: string;
  initialFilter?: string;
}

const empty = {
  ownerOperatorId: '',
  name: '',
  email: '',
  phoneNumber: '',
  location: '',
  vehicleType: '',
  availability: 'Available',
  trailerTypes: '',
  cdlLicense: '',
  cdlState: '',
  cdlClass: '',
  cdlExpiry: '',
  cdlLicenseUrl: '',
  cdlDocumentUrl: '',
  endorsements: '',
  medicalCardExpiry: '',
  medicalCardUrl: '',
  insuranceExpiry: '',
  insuranceUrl: '',
  insurerName: '',
  insurancePolicyNumber: '',
  motorVehicleRecordNumber: '',
  mvrUrl: '',
  backgroundCheckDate: '',
  backgroundCheckUrl: '',
  preEmploymentScreeningDate: '',
  preEmploymentScreeningUrl: '',
  drugAndAlcoholScreeningDate: '',
  drugAndAlcoholScreeningUrl: '',
  clearinghouseStatus: '',
  dqfStatus: '',
  profileStatus: 'confirmed',
};

type FormState = typeof empty;

export function AddDriverDialog({
  open,
  onOpenChange,
  onSuccess,
  initialOwnerOperatorId,
  initialFilter,
}: AddDriverDialogProps) {
  const [form, setForm] = useState<FormState>({
    ...empty,
    ownerOperatorId: initialOwnerOperatorId || '',
  });
  const [saving, setSaving] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setForm({ ...empty, ownerOperatorId: initialOwnerOperatorId || '' });
  }

  async function handleSubmit() {
    if (!form.ownerOperatorId) {
      showError('Pick an owner-operator first.');
      return;
    }
    if (!form.name.trim()) {
      showError('Driver name is required.');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...form,
        trailerTypes: form.trailerTypes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const res = await fetch('/api/admin/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to create driver.');
      }
      showSuccess('Driver created.');
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to create driver.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Add Driver</DialogTitle>
          <DialogDescription>
            Create a driver on behalf of an owner-operator. Useful for white-glove
            onboarding before the customer activates.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1">
          <div className="px-6 py-4 space-y-5">
            <div className="space-y-2">
              <Label>Owner Operator</Label>
              <OwnerOperatorPicker
                value={form.ownerOperatorId}
                onChange={(id, _owner: PickerOwnerOperator | null) =>
                  update('ownerOperatorId', id)
                }
                disabled={saving}
                initialFilter={initialFilter}
              />
              <p className="text-xs text-muted-foreground">
                Pick the carrier this driver belongs to. Pre-activated accounts are
                tagged so you can spot the white-glove fleets.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-driver-name">Name</Label>
                <Input
                  id="add-driver-name"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-driver-email">Email</Label>
                <Input
                  id="add-driver-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-driver-phone">Phone</Label>
                <Input
                  id="add-driver-phone"
                  type="tel"
                  value={form.phoneNumber}
                  onChange={(e) => update('phoneNumber', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-driver-location">Location</Label>
                <Input
                  id="add-driver-location"
                  value={form.location}
                  onChange={(e) => update('location', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-driver-vehicle">Vehicle Type</Label>
                <Input
                  id="add-driver-vehicle"
                  value={form.vehicleType}
                  onChange={(e) => update('vehicleType', e.target.value)}
                  placeholder="Dry Van, Reefer, …"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-driver-trailers">
                  Trailer Types{' '}
                  <span className="text-xs text-muted-foreground">(comma-separated)</span>
                </Label>
                <Input
                  id="add-driver-trailers"
                  value={form.trailerTypes}
                  onChange={(e) => update('trailerTypes', e.target.value)}
                  placeholder="dry-van, reefer, flatbed"
                />
              </div>
            </div>

            <div className="pt-3 border-t space-y-3">
              <p className="text-sm font-medium text-muted-foreground">CDL Details</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="add-driver-cdl">CDL License</Label>
                  <Input
                    id="add-driver-cdl"
                    value={form.cdlLicense}
                    onChange={(e) => update('cdlLicense', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-driver-cdl-expiry">CDL Expiry</Label>
                  <Input
                    id="add-driver-cdl-expiry"
                    type="date"
                    value={form.cdlExpiry}
                    onChange={(e) => update('cdlExpiry', e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="add-driver-cdl-state">CDL State</Label>
                  <Input
                    id="add-driver-cdl-state"
                    value={form.cdlState}
                    onChange={(e) => update('cdlState', e.target.value)}
                    placeholder="e.g. FL"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-driver-cdl-class">CDL Class</Label>
                  <Input
                    id="add-driver-cdl-class"
                    value={form.cdlClass}
                    onChange={(e) => update('cdlClass', e.target.value)}
                    placeholder="A, B, or C"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-driver-endorsements">Endorsements</Label>
                <Input
                  id="add-driver-endorsements"
                  value={form.endorsements}
                  onChange={(e) => update('endorsements', e.target.value)}
                  placeholder="H, N, T"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="add-driver-cdl-license-url">CDL License URL</Label>
                  <Input
                    id="add-driver-cdl-license-url"
                    type="url"
                    value={form.cdlLicenseUrl}
                    onChange={(e) => update('cdlLicenseUrl', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-driver-cdl-doc-url">CDL Document URL</Label>
                  <Input
                    id="add-driver-cdl-doc-url"
                    type="url"
                    value={form.cdlDocumentUrl}
                    onChange={(e) => update('cdlDocumentUrl', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t space-y-3">
              <p className="text-sm font-medium text-muted-foreground">
                Medical &amp; Insurance
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="add-driver-medical-expiry">Medical Card Expiry</Label>
                  <Input
                    id="add-driver-medical-expiry"
                    type="date"
                    value={form.medicalCardExpiry}
                    onChange={(e) => update('medicalCardExpiry', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-driver-insurance-expiry">Insurance Expiry</Label>
                  <Input
                    id="add-driver-insurance-expiry"
                    type="date"
                    value={form.insuranceExpiry}
                    onChange={(e) => update('insuranceExpiry', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-driver-medical-url">Medical Card URL</Label>
                <Input
                  id="add-driver-medical-url"
                  type="url"
                  value={form.medicalCardUrl}
                  onChange={(e) => update('medicalCardUrl', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="add-driver-insurer">Insurer Name</Label>
                  <Input
                    id="add-driver-insurer"
                    value={form.insurerName}
                    onChange={(e) => update('insurerName', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-driver-policy">Policy Number</Label>
                  <Input
                    id="add-driver-policy"
                    value={form.insurancePolicyNumber}
                    onChange={(e) => update('insurancePolicyNumber', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-driver-insurance-url">Insurance URL</Label>
                <Input
                  id="add-driver-insurance-url"
                  type="url"
                  value={form.insuranceUrl}
                  onChange={(e) => update('insuranceUrl', e.target.value)}
                />
              </div>
            </div>

            <div className="pt-3 border-t space-y-3">
              <p className="text-sm font-medium text-muted-foreground">MVR &amp; Screenings</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="add-driver-mvr">MVR Number</Label>
                  <Input
                    id="add-driver-mvr"
                    value={form.motorVehicleRecordNumber}
                    onChange={(e) => update('motorVehicleRecordNumber', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-driver-mvr-url">MVR URL</Label>
                  <Input
                    id="add-driver-mvr-url"
                    type="url"
                    value={form.mvrUrl}
                    onChange={(e) => update('mvrUrl', e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="add-driver-bg-date">Background Check Date</Label>
                  <Input
                    id="add-driver-bg-date"
                    type="date"
                    value={form.backgroundCheckDate}
                    onChange={(e) => update('backgroundCheckDate', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-driver-bg-url">Background Check URL</Label>
                  <Input
                    id="add-driver-bg-url"
                    type="url"
                    value={form.backgroundCheckUrl}
                    onChange={(e) => update('backgroundCheckUrl', e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="add-driver-pes-date">Pre-Employment Date</Label>
                  <Input
                    id="add-driver-pes-date"
                    type="date"
                    value={form.preEmploymentScreeningDate}
                    onChange={(e) =>
                      update('preEmploymentScreeningDate', e.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-driver-pes-url">Pre-Employment URL</Label>
                  <Input
                    id="add-driver-pes-url"
                    type="url"
                    value={form.preEmploymentScreeningUrl}
                    onChange={(e) =>
                      update('preEmploymentScreeningUrl', e.target.value)
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="add-driver-da-date">Drug &amp; Alcohol Date</Label>
                  <Input
                    id="add-driver-da-date"
                    type="date"
                    value={form.drugAndAlcoholScreeningDate}
                    onChange={(e) =>
                      update('drugAndAlcoholScreeningDate', e.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-driver-da-url">Drug &amp; Alcohol URL</Label>
                  <Input
                    id="add-driver-da-url"
                    type="url"
                    value={form.drugAndAlcoholScreeningUrl}
                    onChange={(e) =>
                      update('drugAndAlcoholScreeningUrl', e.target.value)
                    }
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Compliance Status</p>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Clearinghouse</Label>
                  <Select
                    value={form.clearinghouseStatus || '__unset'}
                    onValueChange={(v) =>
                      update('clearinghouseStatus', v === '__unset' ? '' : v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unset">— Not set —</SelectItem>
                      <SelectItem value="compliant">Compliant</SelectItem>
                      <SelectItem value="pending_query">Pending query</SelectItem>
                      <SelectItem value="prohibited">Prohibited</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>DQF Status</Label>
                  <Select
                    value={form.dqfStatus || '__unset'}
                    onValueChange={(v) => update('dqfStatus', v === '__unset' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unset">— Not set —</SelectItem>
                      <SelectItem value="not_required">Not required</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Profile Status</Label>
                  <Select
                    value={form.profileStatus || '__unset'}
                    onValueChange={(v) =>
                      update('profileStatus', v === '__unset' ? '' : v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unset">— Not set —</SelectItem>
                      <SelectItem value="incomplete">Incomplete</SelectItem>
                      <SelectItem value="pending_confirmation">
                        Pending confirmation
                      </SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="complete">Complete</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="self_driver">Self driver</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Defaults to <code>confirmed</code> on admin-created drivers — assumes you
                verified the driver offline.
              </p>
            </div>
          </div>
        </ScrollArea>
        <DialogFooter className="px-6 pb-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…
              </>
            ) : (
              'Create Driver'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
