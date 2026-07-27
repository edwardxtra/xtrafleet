'use client';

/**
 * Post Load dialog — admin creates a load on behalf of any owner-operator
 * (DEV-170). Calls `POST /api/admin/loads`.
 */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { OwnerOperatorPicker } from './owner-operator-picker';

interface AddLoadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  initialOwnerOperatorId?: string;
  initialFilter?: string;
}

const empty = {
  ownerOperatorId: '',
  origin: '',
  destination: '',
  cargo: '',
  loadType: '',
  weight: '',
  status: 'Pending',
  requiredQualifications: '',
  trailerType: '',
  description: '',
  price: '',
  driverCompensation: '',
  pickupDate: '',
};

type FormState = typeof empty;

export function AddLoadDialog({
  open,
  onOpenChange,
  onSuccess,
  initialOwnerOperatorId,
  initialFilter,
}: AddLoadDialogProps) {
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
    if (!form.origin.trim() || !form.destination.trim()) {
      showError('Origin and destination are required.');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ownerOperatorId: form.ownerOperatorId,
        origin: form.origin,
        destination: form.destination,
        cargo: form.cargo,
        loadType: form.loadType,
        weight: form.weight ? Number(form.weight) : undefined,
        status: form.status,
        requiredQualifications: form.requiredQualifications
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        trailerType: form.trailerType,
        description: form.description,
        price: form.price ? Number(form.price) : undefined,
        driverCompensation: form.driverCompensation
          ? Number(form.driverCompensation)
          : undefined,
        pickupDate: form.pickupDate,
      };
      const res = await fetch('/api/admin/loads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to post load.');
      showSuccess('Load posted.');
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to post load.');
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
          <DialogTitle>Post Load</DialogTitle>
          <DialogDescription>
            Create a load on behalf of an owner-operator. White-glove flow:
            pre-register → add drivers → post loads → form a match.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1">
          <div className="px-6 py-4 space-y-5">
            <div className="space-y-2">
              <Label>Owner Operator</Label>
              <OwnerOperatorPicker
                value={form.ownerOperatorId}
                onChange={(id) => update('ownerOperatorId', id)}
                disabled={saving}
                initialFilter={initialFilter}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-load-origin">Origin</Label>
                <Input
                  id="add-load-origin"
                  value={form.origin}
                  onChange={(e) => update('origin', e.target.value)}
                  placeholder="City, ST"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-load-destination">Destination</Label>
                <Input
                  id="add-load-destination"
                  value={form.destination}
                  onChange={(e) => update('destination', e.target.value)}
                  placeholder="City, ST"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-load-cargo">Cargo</Label>
                <Input
                  id="add-load-cargo"
                  value={form.cargo}
                  onChange={(e) => update('cargo', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-load-type">Load Type</Label>
                <Input
                  id="add-load-type"
                  value={form.loadType}
                  onChange={(e) => update('loadType', e.target.value)}
                  placeholder="dry-van, reefer, …"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-load-weight">Weight (lbs)</Label>
                <Input
                  id="add-load-weight"
                  type="number"
                  value={form.weight}
                  onChange={(e) => update('weight', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-load-price">Price ($)</Label>
                <Input
                  id="add-load-price"
                  type="number"
                  value={form.price}
                  onChange={(e) => update('price', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-load-comp">Driver Pay ($)</Label>
                <Input
                  id="add-load-comp"
                  type="number"
                  value={form.driverCompensation}
                  onChange={(e) => update('driverCompensation', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-load-trailer">Trailer Type</Label>
                <Input
                  id="add-load-trailer"
                  value={form.trailerType}
                  onChange={(e) => update('trailerType', e.target.value)}
                  placeholder="dry-van"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-load-pickup">Pickup Date</Label>
                <Input
                  id="add-load-pickup"
                  type="date"
                  value={form.pickupDate}
                  onChange={(e) => update('pickupDate', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-load-quals">
                Required Qualifications{' '}
                <span className="text-xs text-muted-foreground">(comma-separated)</span>
              </Label>
              <Input
                id="add-load-quals"
                value={form.requiredQualifications}
                onChange={(e) => update('requiredQualifications', e.target.value)}
                placeholder="cdl-a, hazmat"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-load-status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => update('status', v)}
              >
                <SelectTrigger id="add-load-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Matched">Matched</SelectItem>
                  <SelectItem value="In-transit">In-transit</SelectItem>
                  <SelectItem value="Delivered">Delivered</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-load-description">Description</Label>
              <Textarea
                id="add-load-description"
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                rows={3}
              />
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
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Posting…
              </>
            ) : (
              'Post Load'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
