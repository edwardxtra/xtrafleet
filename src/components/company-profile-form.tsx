"use client";

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createCompanyProfile } from "@/lib/actions";
import { useTransition } from "react";
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore, useAuth } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useRef } from "react";
import { US_STATES } from "@/lib/us-states";
import { X, Search, ChevronDown, CheckCircle2, XCircle, Loader2 as SpinnerIcon, AlertCircle, AlertTriangle, ExternalLink } from "lucide-react";
import { COIUploadSection, type COIData } from "@/components/coi-upload-section";
import type { FMCSACarrier } from "@/lib/fmcsa";

const profileFormSchema = z.object({
  legalName: z.string().min(1, "Legal name is required"),
  phone: z.string().optional(),
  dotNumber: z.string().optional(),
  mcNumber: z.string().optional(),
  hqStreet: z.string().optional(),
  hqCity: z.string().optional(),
  hqState: z.string().optional(),
  hqZip: z.string().optional(),
  operatingStates: z.array(z.string()),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;
type VerificationState = 'idle' | 'typing' | 'loading' | 'verified' | 'verified_safer_discrepancy' | 'verified_inactive' | 'error';

interface FMCSAVerification {
  state: VerificationState;
  carrier?: FMCSACarrier;
  errorMessage?: string;
}

const DOT_MIN_DIGITS = 5;
const SAFER_SNAPSHOT_URL = 'https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=';

export function CompanyProfileForm() {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const { user } = useUser();
  const auth = useAuth();
  const db = useFirestore();
  const [stateSearch, setStateSearch] = useState("");
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [coiData, setCoiData] = useState<COIData>({});
  const [fmcsa, setFmcsa] = useState<FMCSAVerification>({ state: 'idle' });
  const dotDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    mode: "onChange",
    defaultValues: {
      legalName: "", phone: "", dotNumber: "", mcNumber: "",
      hqStreet: "", hqCity: "", hqState: "", hqZip: "",
      operatingStates: [],
    },
  });

  const selectedStates = form.watch("operatingStates") || [];

  useEffect(() => {
    async function loadExistingData() {
      if (!user || !db) return;
      try {
        const ownerDoc = await getDoc(doc(db, 'owner_operators', user.uid));
        if (ownerDoc.exists()) {
          const data = ownerDoc.data();
          const name = data.legalName || data.companyName || '';
          if (name) form.setValue('legalName', name);
          if (data.phone) form.setValue('phone', data.phone);
          if (data.dotNumber) form.setValue('dotNumber', data.dotNumber);
          if (data.mcNumber) form.setValue('mcNumber', data.mcNumber);
          if (data.hqStreet) form.setValue('hqStreet', data.hqStreet);
          if (data.hqCity) form.setValue('hqCity', data.hqCity);
          if (data.hqState) form.setValue('hqState', data.hqState);
          if (data.hqZip) form.setValue('hqZip', data.hqZip);
          if (!data.hqStreet && data.hqAddress) form.setValue('hqStreet', data.hqAddress);
          if (data.operatingStates?.length) form.setValue('operatingStates', data.operatingStates);
          if (data.coi) setCoiData(data.coi);
          if (data.fmcsaVerified) {
            const carrier = data.fmcsaData as FMCSACarrier | undefined;
            const state: VerificationState = !carrier
              ? 'verified'
              : !carrier.allowedToOperate
                ? 'verified_inactive'
                : carrier.saferDiscrepancy
                  ? 'verified_safer_discrepancy'
                  : 'verified';
            setFmcsa({ state, carrier });
          }
        }
      } catch (error) { console.error('Failed to load existing data:', error); }
    }
    loadExistingData();
  }, [user, db, form]);

  const verifyDOT = useCallback(async (dotNumber: string) => {
    const cleaned = dotNumber.replace(/\D/g, '');
    if (cleaned.length < DOT_MIN_DIGITS) { setFmcsa({ state: 'idle' }); return; }
    setFmcsa({ state: 'loading' });
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch(`/api/fmcsa-lookup?dot=${cleaned}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFmcsa({ state: 'error', errorMessage: body.error || 'DOT number not found in FMCSA records' });
        return;
      }
      const { carrier } = await res.json() as { carrier: FMCSACarrier };

      if (carrier.legalName) form.setValue('legalName', carrier.legalName, { shouldValidate: true });
      if (carrier.mcNumber) form.setValue('mcNumber', carrier.mcNumber, { shouldValidate: true });
      if (carrier.phone) form.setValue('phone', carrier.phone, { shouldValidate: true });
      if (carrier.hqAddress) form.setValue('hqStreet', carrier.hqAddress, { shouldValidate: true });
      if (carrier.hqCity) form.setValue('hqCity', carrier.hqCity, { shouldValidate: true });
      if (carrier.hqState) form.setValue('hqState', carrier.hqState, { shouldValidate: true });
      if (carrier.hqZip) form.setValue('hqZip', carrier.hqZip, { shouldValidate: true });

      if (!carrier.allowedToOperate) {
        setFmcsa({ state: 'verified_inactive', carrier });
      } else if (carrier.saferDiscrepancy) {
        setFmcsa({ state: 'verified_safer_discrepancy', carrier });
      } else {
        setFmcsa({ state: 'verified', carrier });
      }
    } catch {
      setFmcsa({ state: 'error', errorMessage: 'Could not reach FMCSA. Check your connection.' });
    }
  }, [auth, form]);

  const handleDOTChange = useCallback((value: string) => {
    const numbersOnly = value.replace(/\D/g, '');
    form.setValue('dotNumber', numbersOnly, { shouldValidate: true });
    if (dotDebounceRef.current) clearTimeout(dotDebounceRef.current);
    if (numbersOnly.length === 0) { setFmcsa({ state: 'idle' }); return; }
    if (numbersOnly.length < DOT_MIN_DIGITS) { setFmcsa({ state: 'idle' }); return; }
    setFmcsa(prev =>
      prev.state !== 'loading' && prev.state !== 'verified' && prev.state !== 'verified_inactive' && prev.state !== 'verified_safer_discrepancy'
        ? { state: 'typing' } : prev
    );
    dotDebounceRef.current = setTimeout(() => verifyDOT(numbersOnly), 800);
  }, [form, verifyDOT]);

  const toggleState = (stateValue: string) => {
    const current = form.getValues("operatingStates");
    if (current.includes(stateValue)) form.setValue("operatingStates", current.filter(s => s !== stateValue), { shouldValidate: true });
    else form.setValue("operatingStates", [...current, stateValue], { shouldValidate: true });
  };

  const removeState = (stateValue: string) => {
    const current = form.getValues("operatingStates");
    form.setValue("operatingStates", current.filter(s => s !== stateValue), { shouldValidate: true });
  };

  const filteredStates = US_STATES.filter(state =>
    state.label.toLowerCase().includes(stateSearch.toLowerCase()) || state.value.toLowerCase().includes(stateSearch.toLowerCase())
  );

  const onSubmit = (values: ProfileFormValues) => {
    const hasCoiData = !!(coiData.fileUrl || (coiData.insurerName && coiData.policyNumber && coiData.expiryDate));
    const hasAddress = !!(values.hqStreet && values.hqCity && values.hqState);
    const missingFields: string[] = [];
    if (!values.dotNumber) missingFields.push('DOT #');
    if (!values.mcNumber) missingFields.push('MC #');
    if (!hasAddress) missingFields.push('HQ Address');
    if (!values.operatingStates?.length) missingFields.push('Operating States');
    if (!hasCoiData) missingFields.push('Certificate of Insurance');
    if (missingFields.length > 0) {
      toast({ title: "Incomplete Profile", description: `Missing: ${missingFields.join(', ')}. Your progress has been saved — complete these fields to unlock all features.`, variant: "default" });
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.append('legalName', values.legalName);
      formData.append('phone', values.phone || '');
      formData.append('dotNumber', values.dotNumber || '');
      formData.append('mcNumber', values.mcNumber || '');
      formData.append('hqStreet', values.hqStreet || '');
      formData.append('hqCity', values.hqCity || '');
      formData.append('hqState', values.hqState || '');
      formData.append('hqZip', values.hqZip || '');
      const hqAddress = [values.hqStreet, values.hqCity, values.hqState, values.hqZip].filter(Boolean).join(', ');
      formData.append('hqAddress', hqAddress);
      formData.append('operatingStates', JSON.stringify(values.operatingStates || []));
      formData.append('coiData', JSON.stringify(coiData));
      formData.append('fmcsaVerified', String(fmcsa.state === 'verified'));
      if (fmcsa.carrier) formData.append('fmcsaData', JSON.stringify(fmcsa.carrier));
      const isComplete = !!(values.dotNumber && values.mcNumber && hasAddress && values.operatingStates?.length && hasCoiData);
      formData.append('isProfileComplete', String(isComplete));
      try {
        await createCompanyProfile(formData);
      } catch (error: unknown) {
        if ((error as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw error;
        console.error("Failed to create profile:", error);
        toast({ title: "Save Failed", description: (error as Error)?.message || "An unexpected error occurred.", variant: "destructive" });
      }
    });
  };

  const showSpinner = fmcsa.state === 'typing' || fmcsa.state === 'loading';
  const isVerifiedActive = fmcsa.state === 'verified' || fmcsa.state === 'verified_safer_discrepancy';

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

        {/* DOT first */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FormField control={form.control} name="dotNumber" render={({ field }) => (
            <FormItem>
              <FormLabel>DOT Number *</FormLabel>
              <div className="relative">
                <FormControl>
                  <Input placeholder="e.g., 1234567" {...field} inputMode="numeric" onChange={(e) => handleDOTChange(e.target.value)} className="pr-9" />
                </FormControl>
                <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
                  {showSpinner && <SpinnerIcon className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {isVerifiedActive && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  {fmcsa.state === 'verified_inactive' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                  {fmcsa.state === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Enter your USDOT number — fields below auto-fill from FMCSA</p>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="mcNumber" render={({ field }) => (
            <FormItem><FormLabel>MC Number *</FormLabel><FormControl><Input placeholder="e.g., MC-987654" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>

        {/* FMCSA banners */}
        {fmcsa.state === 'verified' && fmcsa.carrier && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-green-800 dark:text-green-300">FMCSA Verified — save to lock</p>
                <p className="text-green-700 dark:text-green-400">
                  {fmcsa.carrier.legalName}
                  {fmcsa.carrier.safetyRating && fmcsa.carrier.safetyRating !== 'Not Rated' && <span className="ml-2 text-xs">· Safety: {fmcsa.carrier.safetyRating}</span>}
                  <span className="ml-2 text-xs">· Authority: {fmcsa.carrier.authorityStatus || 'Active'}</span>
                  {fmcsa.carrier.insuranceOnFile && <span className="ml-2 text-xs">· Insurance on file</span>}
                </p>
              </div>
            </div>
          </div>
        )}
        {fmcsa.state === 'verified_safer_discrepancy' && fmcsa.carrier && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-300">FMCSA Found — Authority Status Mismatch</p>
                <p className="text-amber-700 dark:text-amber-400">
                  {fmcsa.carrier.legalName} is authorized to operate per QCMobile, but the SAFER database shows this DOT as inactive.
                  This usually means authority was recently reinstated and SAFER hasn&apos;t synced yet.{' '}
                  <a href={`${SAFER_SNAPSHOT_URL}${encodeURIComponent(fmcsa.carrier.dotNumber)}`} target="_blank" rel="noopener noreferrer" className="underline font-medium hover:text-amber-900 inline-flex items-center gap-1">
                    View your SAFER record <ExternalLink className="h-3 w-3" />
                  </a>
                  {' '}or{' '}
                  <a href="https://www.fmcsa.dot.gov/registration/dataqs" target="_blank" rel="noopener noreferrer" className="underline font-medium hover:text-amber-900">dispute via FMCSA DataQs</a>.
                </p>
              </div>
            </div>
          </div>
        )}
        {fmcsa.state === 'verified_inactive' && fmcsa.carrier && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-300">FMCSA Found — Authority Inactive</p>
                <p className="text-amber-700 dark:text-amber-400">
                  {fmcsa.carrier.legalName} was found in FMCSA records but is not currently authorized to operate.
                  Your profile has been pre-filled.{' '}
                  <a href={`${SAFER_SNAPSHOT_URL}${encodeURIComponent(fmcsa.carrier.dotNumber)}`} target="_blank" rel="noopener noreferrer" className="underline font-medium hover:text-amber-900 inline-flex items-center gap-1">
                    View your SAFER record <ExternalLink className="h-3 w-3" />
                  </a>
                  {' '}and update your authority at{' '}
                  <a href="https://www.fmcsa.dot.gov" target="_blank" rel="noopener noreferrer" className="underline font-medium hover:text-amber-900">fmcsa.dot.gov</a>.
                </p>
              </div>
            </div>
          </div>
        )}
        {fmcsa.state === 'error' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-300">Could not verify DOT number</p>
                <p className="text-amber-700 dark:text-amber-400">{fmcsa.errorMessage}</p>
              </div>
            </div>
          </div>
        )}

        <FormField control={form.control} name="legalName" render={({ field }) => (
          <FormItem><FormLabel>Legal Name</FormLabel><FormControl><Input placeholder="Your company legal name" {...field} /></FormControl><FormMessage /></FormItem>
        )} />

        <FormField control={form.control} name="phone" render={({ field }) => (
          <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input type="tel" placeholder="e.g., (555) 123-4567" {...field} /></FormControl><FormMessage /></FormItem>
        )} />

        {/* Split address with labels */}
        <div>
          <p className="text-sm font-medium mb-2">HQ Address *</p>
          <div className="space-y-3">
            <FormField control={form.control} name="hqStreet" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-muted-foreground">Street</FormLabel>
                <FormControl><Input placeholder="e.g., 115 Wood Rail Ln" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <FormField control={form.control} name="hqCity" render={({ field }) => (
                <FormItem className="col-span-2 md:col-span-2">
                  <FormLabel className="text-xs text-muted-foreground">City</FormLabel>
                  <FormControl><Input placeholder="e.g., Van" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="hqState" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">State</FormLabel>
                  <FormControl><Input placeholder="WV" maxLength={2} {...field} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="hqZip" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">ZIP</FormLabel>
                  <FormControl><Input placeholder="25206" maxLength={10} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </div>
        </div>

        <FormField control={form.control} name="operatingStates" render={() => (
          <FormItem>
            <FormLabel>Operating States *</FormLabel>
            <p className="text-sm text-muted-foreground mb-2">Select all states where you operate</p>
            {selectedStates.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedStates.map(stateVal => {
                  const state = US_STATES.find(s => s.value === stateVal);
                  return <Badge key={stateVal} variant="secondary" className="pl-2 pr-1 py-1 gap-1">{state?.label || stateVal}<button type="button" onClick={() => removeState(stateVal)} className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"><X className="h-3 w-3" /></button></Badge>;
                })}
              </div>
            )}
            <div className="relative">
              <button type="button" onClick={() => setStateDropdownOpen(!stateDropdownOpen)} className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                <span className="text-muted-foreground">{selectedStates.length === 0 ? "Select states..." : `${selectedStates.length} state${selectedStates.length === 1 ? '' : 's'} selected`}</span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </button>
              {stateDropdownOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
                  <div className="flex items-center border-b px-3 py-2"><Search className="h-4 w-4 text-muted-foreground mr-2" /><input type="text" placeholder="Search states..." value={stateSearch} onChange={(e) => setStateSearch(e.target.value)} className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" autoFocus /></div>
                  <div className="flex justify-between px-3 py-1.5 border-b text-xs">
                    <button type="button" onClick={() => form.setValue("operatingStates", US_STATES.map(s => s.value), { shouldValidate: true })} className="text-primary hover:underline">Select All</button>
                    <button type="button" onClick={() => form.setValue("operatingStates", [], { shouldValidate: true })} className="text-muted-foreground hover:underline">Clear All</button>
                  </div>
                  <div className="max-h-60 overflow-y-auto p-1">
                    {filteredStates.map(state => (
                      <button key={state.value} type="button" onClick={() => toggleState(state.value)} className={`flex w-full items-center gap-2 rounded px-3 py-1.5 text-sm hover:bg-accent ${selectedStates.includes(state.value) ? 'bg-accent/50 font-medium' : ''}`}>
                        <div className={`h-4 w-4 rounded border flex items-center justify-center ${selectedStates.includes(state.value) ? 'bg-primary border-primary text-primary-foreground' : 'border-input'}`}>
                          {selectedStates.includes(state.value) && <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </div>
                        <span>{state.label}</span><span className="ml-auto text-xs text-muted-foreground">{state.value}</span>
                      </button>
                    ))}
                    {filteredStates.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No states found</p>}
                  </div>
                  <div className="border-t p-2"><Button type="button" size="sm" className="w-full" onClick={() => { setStateDropdownOpen(false); setStateSearch(""); }}>Done</Button></div>
                </div>
              )}
            </div>
            <FormMessage />
          </FormItem>
        )} />

        <COIUploadSection onCoiChange={setCoiData} initialData={coiData} />

        <p className="text-xs text-muted-foreground">* Required for full activation. You can save partial progress and return later.</p>

        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save and Continue"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
