'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { showSuccess, showError } from '@/lib/toast-utils';
import {
  ArrowLeft,
  Loader2,
  MapPin,
  Truck,
  Clock,
  DollarSign,
  AlertCircle,
  CheckCircle,
  FileText,
  Shield,
  ChevronRight,
  ChevronLeft,
  Eye,
  Save,
  Send,
} from 'lucide-react';
import { TRAILER_TYPES } from '@/lib/trailer-types';
import { LOAD_TYPES, CDL_CLASSES, LOAD_ENDORSEMENTS } from '@/lib/load-types';
import Link from 'next/link';

interface RoutePreview {
  distanceMiles: number;
  distanceText: string;
  durationSeconds: number;
  durationText: string;
  costPerMile?: string;
}

type Step = 'form' | 'review';

export default function PostLoadPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('form');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routePreview, setRoutePreview] = useState<RoutePreview | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    origin: '',
    destination: '',
    loadType: '',
    driverCompensation: '',
    pickupDate: '',
    estimatedDeliveryDate: '',
    trailerType: '',
    cdlClassRequired: [] as string[],
    endorsementsRequired: [] as string[],
    additionalDetails: '',
    verificationConsent: false,
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (field === 'origin' || field === 'destination') {
      setRoutePreview(null);
      setRouteError(null);
    }
  };

  const handleCdlToggle = (value: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      cdlClassRequired: checked
        ? [...prev.cdlClassRequired, value]
        : prev.cdlClassRequired.filter(c => c !== value),
    }));
  };

  const handleEndorsementToggle = (value: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      endorsementsRequired: checked
        ? [...prev.endorsementsRequired, value]
        : prev.endorsementsRequired.filter(e => e !== value),
    }));
  };

  const calculateRoute = async () => {
    if (!formData.origin || !formData.destination) { showError('Please enter both origin and destination'); return; }
    setIsCalculatingRoute(true);
    setRouteError(null);
    try {
      const response = await fetch('/api/calculate-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: formData.origin, destination: formData.destination }),
      });
      if (!response.ok) throw new Error('Failed to calculate route');
      const data = await response.json();
      let costPerMile;
      if (formData.driverCompensation) {
        const comp = parseFloat(formData.driverCompensation);
        if (!isNaN(comp) && data.distance.value > 0) {
          costPerMile = `$${(comp / (data.distance.value / 1609.34)).toFixed(2)}/mi`;
        }
      }
      setRoutePreview({
        distanceMiles: Math.round(data.distance.value / 1609.34),
        distanceText: data.distance.text,
        durationSeconds: data.duration.value,
        durationText: data.duration.text,
        costPerMile,
      });
      showSuccess('Route calculated successfully!');
    } catch {
      setRouteError('Could not calculate route. Load will be posted without route information.');
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  const validateForm = (): string | null => {
    if (!formData.origin) return 'Origin is required';
    if (!formData.destination) return 'Destination is required';
    if (!formData.loadType) return 'Load type is required';
    if (!formData.driverCompensation || parseFloat(formData.driverCompensation) <= 0) return 'Valid driver compensation is required';
    if (!formData.pickupDate) return 'Pickup date is required';
    if (formData.cdlClassRequired.length === 0) return 'At least one CDL class is required';
    if (!formData.verificationConsent) return 'Verification authorization is required';
    return null;
  };

  const handleReview = () => {
    const error = validateForm();
    if (error) { showError(error); return; }
    setStep('review');
    window.scrollTo(0, 0);
  };

  const handleSubmit = async (status: 'live' | 'draft') => {
    if (status === 'live') { const error = validateForm(); if (error) { showError(error); return; } }
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/loads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: formData.origin, destination: formData.destination,
          loadType: formData.loadType,
          driverCompensation: parseFloat(formData.driverCompensation),
          pickupDate: formData.pickupDate,
          estimatedDeliveryDate: formData.estimatedDeliveryDate || undefined,
          trailerType: formData.trailerType || undefined,
          cdlClassRequired: formData.cdlClassRequired,
          endorsementsRequired: formData.endorsementsRequired,
          additionalDetails: formData.additionalDetails,
          status,
          verificationConsent: {
            accepted: formData.verificationConsent,
            timestamp: new Date().toISOString(),
            version: '1.0',
            text: 'We authorize XtraFleet to facilitate transaction-based eligibility checks for matched drivers.',
          },
        }),
      });
      if (!response.ok) { const d = await response.json(); throw new Error(d.error || 'Failed to create load'); }
      showSuccess(status === 'draft' ? 'Load saved as draft!' : 'Load published successfully!');
      router.push('/dashboard/loads');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to post load');
    } finally { setIsSubmitting(false); }
  };

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];
  const getLoadTypeLabel = (v: string) => LOAD_TYPES.find(t => t.value === v)?.label || v;
  const getTrailerTypeLabel = (v: string) => TRAILER_TYPES.find(t => t.value === v)?.label || v;

  if (step === 'review') {
    return (
      <div className="container max-w-4xl py-8">
        <div className="mb-6">
          <Button variant="outline" size="sm" onClick={() => setStep('form')}>
            <ChevronLeft className="h-4 w-4 mr-2" />Back to Edit
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-headline flex items-center gap-2">
              <Eye className="h-6 w-6" />Review Load
            </CardTitle>
            <CardDescription>Review your load details before publishing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border bg-muted/30 p-6 space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Route</p>
                <p className="text-lg font-semibold">{formData.origin} &rarr; {formData.destination}</p>
                {routePreview && (
                  <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> {routePreview.distanceText}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {routePreview.durationText}</span>
                    {routePreview.costPerMile && <span className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> {routePreview.costPerMile}</span>}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Pickup Date</p>
                  <p className="font-medium">{new Date(formData.pickupDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
                </div>
                {formData.estimatedDeliveryDate && (
                  <div>
                    <p className="text-sm text-muted-foreground">Est. Delivery</p>
                    <p className="font-medium">{new Date(formData.estimatedDeliveryDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-sm text-muted-foreground">Load Type</p><p className="font-medium">{getLoadTypeLabel(formData.loadType)}</p></div>
                {formData.trailerType && <div><p className="text-sm text-muted-foreground">Trailer Type</p><p className="font-medium">{getTrailerTypeLabel(formData.trailerType)}</p></div>}
                <div><p className="text-sm text-muted-foreground">CDL Class Required</p><p className="font-medium">{formData.cdlClassRequired.map(c => `Class ${c}`).join(', ')}</p></div>
                {formData.endorsementsRequired.length > 0 && (
                  <div><p className="text-sm text-muted-foreground">Endorsements</p><p className="font-medium">{formData.endorsementsRequired.map(e => LOAD_ENDORSEMENTS.find(le => le.value === e)?.label || e).join(', ')}</p></div>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Driver Compensation</p>
                <p className="text-xl font-bold text-green-600 dark:text-green-400">${parseFloat(formData.driverCompensation).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              {formData.additionalDetails && (
                <div><p className="text-sm text-muted-foreground">Additional Details</p><p className="text-sm">{formData.additionalDetails}</p></div>
              )}
            </div>
            <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
              <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <AlertDescription className="text-blue-900 dark:text-blue-100">A match fee will apply only if a driver is successfully matched and accepted.</AlertDescription>
            </Alert>
            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
              <Button onClick={() => handleSubmit('live')} disabled={isSubmitting} className="flex-1">
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}Publish Load
              </Button>
              <Button variant="outline" onClick={() => handleSubmit('draft')} disabled={isSubmitting}>
                <Save className="h-4 w-4 mr-2" />Save as Draft
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-6">
        <Link href="/dashboard/loads"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back to Loads</Button></Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-headline">Post New Load</CardTitle>
          <CardDescription>Create a new freight load. Fill in the details and review before publishing.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /><h3 className="text-lg font-semibold">Route Information</h3></div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="origin">Origin <span className="text-destructive">*</span></Label><Input id="origin" placeholder="e.g., Miami, FL" value={formData.origin} onChange={(e) => handleInputChange('origin', e.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="destination">Destination <span className="text-destructive">*</span></Label><Input id="destination" placeholder="e.g., Atlanta, GA" value={formData.destination} onChange={(e) => handleInputChange('destination', e.target.value)} /></div>
              </div>
              <Button type="button" variant="outline" onClick={calculateRoute} disabled={!formData.origin || !formData.destination || isCalculatingRoute} className="w-full md:w-auto">
                {isCalculatingRoute ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Calculating...</>) : (<><Truck className="h-4 w-4 mr-2" />Calculate Route</>)}
              </Button>
              {routePreview && (
                <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <AlertDescription>
                    <p className="font-semibold text-green-900 dark:text-green-100 mb-1">Route Calculated</p>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <span className="flex items-center gap-1"><Truck className="h-3.5 w-3.5 text-green-600" /> {routePreview.distanceText}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-green-600" /> {routePreview.durationText}</span>
                      {routePreview.costPerMile && <span className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5 text-green-600" /> {routePreview.costPerMile}</span>}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              {routeError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{routeError}</AlertDescription></Alert>}
            </div>

            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /><h3 className="text-lg font-semibold">Load Details</h3></div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="loadType">Load Type <span className="text-destructive">*</span></Label>
                  <Select value={formData.loadType} onValueChange={(v) => handleInputChange('loadType', v)}>
                    <SelectTrigger id="loadType"><SelectValue placeholder="Select load type" /></SelectTrigger>
                    <SelectContent>{LOAD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trailerType">Trailer Type</Label>
                  <Select value={formData.trailerType} onValueChange={(v) => handleInputChange('trailerType', v)}>
                    <SelectTrigger id="trailerType"><SelectValue placeholder="Select trailer type (optional)" /></SelectTrigger>
                    <SelectContent>{TRAILER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label htmlFor="driverCompensation">Driver Compensation ($) <span className="text-destructive">*</span></Label><Input id="driverCompensation" type="number" placeholder="e.g., 1500" value={formData.driverCompensation} onChange={(e) => handleInputChange('driverCompensation', e.target.value)} min="1" step="0.01" /></div>
                <div className="space-y-2"><Label htmlFor="pickupDate">Pickup Date <span className="text-destructive">*</span></Label><Input id="pickupDate" type="date" value={formData.pickupDate} onChange={(e) => handleInputChange('pickupDate', e.target.value)} min={minDate} /></div>
                <div className="space-y-2"><Label htmlFor="estimatedDeliveryDate">Estimated Delivery Date</Label><Input id="estimatedDeliveryDate" type="date" value={formData.estimatedDeliveryDate} onChange={(e) => handleInputChange('estimatedDeliveryDate', e.target.value)} min={formData.pickupDate || minDate} /></div>
              </div>
              <div className="space-y-2"><Label htmlFor="additionalDetails">Additional Details</Label><Textarea id="additionalDetails" placeholder="Any special requirements, handling instructions, or notes..." value={formData.additionalDetails} onChange={(e) => handleInputChange('additionalDetails', e.target.value)} rows={3} /></div>
            </div>

            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /><h3 className="text-lg font-semibold">Driver Requirements</h3></div>
              <p className="text-sm text-muted-foreground">This information is used to identify eligible drivers and equipment. No rates are displayed publicly.</p>
              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block">CDL Class Required <span className="text-destructive">*</span></Label>
                  <div className="flex flex-wrap gap-4">
                    {CDL_CLASSES.map((cls) => (
                      <div key={cls.value} className="flex items-center space-x-2">
                        <Checkbox id={`cdl-${cls.value}`} checked={formData.cdlClassRequired.includes(cls.value)} onCheckedChange={(c) => handleCdlToggle(cls.value, c as boolean)} />
                        <label htmlFor={`cdl-${cls.value}`} className="text-sm font-medium cursor-pointer">{cls.label}</label>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block">Endorsements (if any)</Label>
                  <div className="flex flex-wrap gap-4">
                    {LOAD_ENDORSEMENTS.map((end) => (
                      <div key={end.value} className="flex items-center space-x-2">
                        <Checkbox id={`end-${end.value}`} checked={formData.endorsementsRequired.includes(end.value)} onCheckedChange={(c) => handleEndorsementToggle(end.value, c as boolean)} />
                        <label htmlFor={`end-${end.value}`} className="text-sm font-medium cursor-pointer">{end.label}</label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-start space-x-3 p-4 rounded-lg border bg-muted/30">
                <Checkbox id="verificationConsent" checked={formData.verificationConsent} onCheckedChange={(c) => setFormData(prev => ({ ...prev, verificationConsent: c as boolean }))} className="mt-0.5" />
                <div>
                  <label htmlFor="verificationConsent" className="text-sm font-semibold cursor-pointer">Verification Authorization <span className="text-destructive">*</span></label>
                  <p className="text-sm text-muted-foreground mt-1">We authorize XtraFleet to facilitate transaction-based eligibility checks for matched drivers.</p>
                </div>
              </div>
            </div>

            <div className="flex gap-4 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => router.push('/dashboard/loads')}>Cancel</Button>
              <Button onClick={handleReview} className="flex-1">Review Load<ChevronRight className="h-4 w-4 ml-2" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
