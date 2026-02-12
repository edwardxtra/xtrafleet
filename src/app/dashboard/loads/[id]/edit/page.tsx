'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { showSuccess, showError } from '@/lib/toast-utils';
import { ArrowLeft, Loader2, Save, Send, Lock, AlertCircle, MapPin, FileText, Shield } from 'lucide-react';
import { TRAILER_TYPES } from '@/lib/trailer-types';
import { LOAD_TYPES, CDL_CLASSES, LOAD_ENDORSEMENTS, LOAD_STATUSES, isFullyEditable, isLimitedEditable } from '@/lib/load-types';
import type { Load } from '@/lib/data';
import Link from 'next/link';

export default function EditLoadPage() {
  const router = useRouter();
  const params = useParams();
  const loadId = params.id as string;

  const [load, setLoad] = useState<Load | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    origin: '', destination: '', loadType: '', driverCompensation: '',
    pickupDate: '', estimatedDeliveryDate: '', trailerType: '',
    cdlClassRequired: [] as string[], endorsementsRequired: [] as string[],
    additionalDetails: '',
  });

  useEffect(() => {
    async function fetchLoad() {
      try {
        const response = await fetch(`/api/loads/${loadId}`);
        if (!response.ok) throw new Error('Failed to load');
        const result = await response.json();
        const data = result.data || result;
        setLoad(data);
        setFormData({
          origin: data.origin || '', destination: data.destination || '',
          loadType: data.loadType || data.cargo || '',
          driverCompensation: String(data.driverCompensation || data.price || ''),
          pickupDate: data.pickupDate || '', estimatedDeliveryDate: data.estimatedDeliveryDate || '',
          trailerType: data.trailerType || '',
          cdlClassRequired: data.cdlClassRequired || [], endorsementsRequired: data.endorsementsRequired || [],
          additionalDetails: data.additionalDetails || '',
        });
      } catch { setError('Failed to load this freight load'); showError('Failed to load freight load details'); }
      finally { setLoading(false); }
    }
    if (loadId) fetchLoad();
  }, [loadId]);

  const status = (load?.status || 'live') as string;
  const fullyEditable = isFullyEditable(status as any);
  const limitedEditable = isLimitedEditable(status as any);
  const canEdit = fullyEditable || limitedEditable;
  const isFieldDisabled = !fullyEditable;

  const handleInputChange = (field: string, value: string) => setFormData(prev => ({ ...prev, [field]: value }));
  const handleCdlToggle = (value: string, checked: boolean) => setFormData(prev => ({ ...prev, cdlClassRequired: checked ? [...prev.cdlClassRequired, value] : prev.cdlClassRequired.filter(c => c !== value) }));
  const handleEndorsementToggle = (value: string, checked: boolean) => setFormData(prev => ({ ...prev, endorsementsRequired: checked ? [...prev.endorsementsRequired, value] : prev.endorsementsRequired.filter(e => e !== value) }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: any = { updatedAt: new Date().toISOString() };
      if (fullyEditable) {
        Object.assign(body, { origin: formData.origin, destination: formData.destination, loadType: formData.loadType, driverCompensation: parseFloat(formData.driverCompensation), pickupDate: formData.pickupDate, estimatedDeliveryDate: formData.estimatedDeliveryDate || undefined, trailerType: formData.trailerType || undefined, cdlClassRequired: formData.cdlClassRequired, endorsementsRequired: formData.endorsementsRequired, additionalDetails: formData.additionalDetails });
      } else { body.additionalDetails = formData.additionalDetails; }
      const response = await fetch(`/api/loads/${loadId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) { const d = await response.json().catch(() => ({})); throw new Error(d.error || 'Failed to update load'); }
      showSuccess('Load updated successfully!'); router.push('/dashboard/loads');
    } catch (err) { showError(err instanceof Error ? err.message : 'Failed to update load'); }
    finally { setSaving(false); }
  };

  const handlePublish = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/loads/${loadId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...formData, driverCompensation: parseFloat(formData.driverCompensation), status: 'live' }) });
      if (!response.ok) { const d = await response.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
      showSuccess('Load published!'); router.push('/dashboard/loads');
    } catch (err) { showError(err instanceof Error ? err.message : 'Failed to publish load'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="container max-w-4xl py-8"><Skeleton className="h-10 w-32 mb-6" /><Skeleton className="h-[600px] w-full" /></div>;

  if (error || !load) return (
    <div className="container max-w-4xl py-8">
      <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error || 'Load not found'}</AlertDescription></Alert>
      <Link href="/dashboard/loads"><Button variant="outline" className="mt-4"><ArrowLeft className="h-4 w-4 mr-2" />Back to Loads</Button></Link>
    </div>
  );

  const statusLabel = LOAD_STATUSES.find(s => s.value === status)?.label || status;

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-6"><Link href="/dashboard/loads"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back to Loads</Button></Link></div>

      {!canEdit && <Alert variant="destructive" className="mb-6"><Lock className="h-4 w-4" /><AlertDescription>This load is <strong>{statusLabel}</strong> and cannot be edited.</AlertDescription></Alert>}
      {limitedEditable && <Alert className="mb-6 border-yellow-200 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800"><AlertCircle className="h-4 w-4 text-yellow-600" /><AlertDescription className="text-yellow-900 dark:text-yellow-100">This load has pending matches. Only additional details/notes can be edited.</AlertDescription></Alert>}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-headline">{canEdit ? 'Edit Load' : 'View Load'}</CardTitle>
              <CardDescription>{load.origin} \u2192 {load.destination}</CardDescription>
            </div>
            <Badge variant={status === 'draft' ? 'secondary' : status === 'live' ? 'default' : status === 'cancelled' ? 'destructive' : 'outline'}>{statusLabel}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /><h3 className="text-lg font-semibold">Route Information</h3></div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label>Origin</Label><Input value={formData.origin} onChange={(e) => handleInputChange('origin', e.target.value)} disabled={isFieldDisabled} /></div>
                <div className="space-y-2"><Label>Destination</Label><Input value={formData.destination} onChange={(e) => handleInputChange('destination', e.target.value)} disabled={isFieldDisabled} /></div>
              </div>
              {load.route && <div className="flex gap-4 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg"><span>Distance: <strong>{load.route.distanceText}</strong></span><span>Duration: <strong>{load.route.durationText}</strong></span></div>}
            </div>

            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /><h3 className="text-lg font-semibold">Load Details</h3></div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label>Load Type</Label><Select value={formData.loadType} onValueChange={(v) => handleInputChange('loadType', v)} disabled={isFieldDisabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LOAD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Trailer Type</Label><Select value={formData.trailerType} onValueChange={(v) => handleInputChange('trailerType', v)} disabled={isFieldDisabled}><SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger><SelectContent>{TRAILER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Driver Compensation ($)</Label><Input type="number" value={formData.driverCompensation} onChange={(e) => handleInputChange('driverCompensation', e.target.value)} disabled={isFieldDisabled} /></div>
                <div className="space-y-2"><Label>Pickup Date</Label><Input type="date" value={formData.pickupDate} onChange={(e) => handleInputChange('pickupDate', e.target.value)} disabled={isFieldDisabled} /></div>
                <div className="space-y-2"><Label>Estimated Delivery Date</Label><Input type="date" value={formData.estimatedDeliveryDate} onChange={(e) => handleInputChange('estimatedDeliveryDate', e.target.value)} disabled={isFieldDisabled} /></div>
              </div>
              <div className="space-y-2"><Label>Additional Details</Label><Textarea value={formData.additionalDetails} onChange={(e) => handleInputChange('additionalDetails', e.target.value)} rows={3} disabled={!canEdit} /></div>
            </div>

            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /><h3 className="text-lg font-semibold">Driver Requirements</h3></div>
              <div className="space-y-4">
                <div><Label className="mb-2 block">CDL Class Required</Label><div className="flex flex-wrap gap-4">{CDL_CLASSES.map((cls) => (<div key={cls.value} className="flex items-center space-x-2"><Checkbox id={`edit-cdl-${cls.value}`} checked={formData.cdlClassRequired.includes(cls.value)} onCheckedChange={(c) => handleCdlToggle(cls.value, c as boolean)} disabled={isFieldDisabled} /><label htmlFor={`edit-cdl-${cls.value}`} className="text-sm font-medium cursor-pointer">{cls.label}</label></div>))}</div></div>
                <div><Label className="mb-2 block">Endorsements</Label><div className="flex flex-wrap gap-4">{LOAD_ENDORSEMENTS.map((end) => (<div key={end.value} className="flex items-center space-x-2"><Checkbox id={`edit-end-${end.value}`} checked={formData.endorsementsRequired.includes(end.value)} onCheckedChange={(c) => handleEndorsementToggle(end.value, c as boolean)} disabled={isFieldDisabled} /><label htmlFor={`edit-end-${end.value}`} className="text-sm font-medium cursor-pointer">{end.label}</label></div>))}</div></div>
              </div>
            </div>

            {canEdit && (
              <div className="flex gap-4 pt-4 border-t">
                <Button variant="outline" onClick={() => router.push('/dashboard/loads')} disabled={saving}>Cancel</Button>
                {status === 'draft' && <Button variant="outline" onClick={handlePublish} disabled={saving}><Send className="h-4 w-4 mr-2" />Publish Load</Button>}
                <Button onClick={handleSave} disabled={saving} className="flex-1">{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save Changes</Button>
              </div>
            )}
            {!canEdit && <div className="pt-4 border-t"><Button variant="outline" onClick={() => router.push('/dashboard/loads')}><ArrowLeft className="h-4 w-4 mr-2" />Back to Loads</Button></div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
