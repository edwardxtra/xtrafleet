'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useUser, useFirestore, useStorage, useAuth } from '@/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import Link from 'next/link';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { US_STATES } from '@/lib/us-states';
import { validateFile } from '@/lib/file-validation';
import {
  Loader2, Building2, MapPin, FileText, Shield, Check, X, Upload,
  ExternalLink, Save, WifiOff, Clock, ArrowRight, Search, ChevronDown, ChevronUp,
  AlertTriangle, UploadCloud, Info, CheckCircle2, RefreshCw, XCircle, Lock,
} from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast-utils';
import { parseError } from '@/lib/error-utils';
import { format, parseISO } from 'date-fns';
import type { FMCSACarrier } from '@/lib/fmcsa';
import { ATTESTATIONS, type AttestationEntry } from '@/lib/attestations';

interface COIInfo {
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  uploadedAt?: string;
  updatedAt?: string;
  insurerName?: string;
  policyNumber?: string;
  expiryDate?: string;
}

interface OnboardingStatus {
  profileComplete?: boolean;
  fmcsaDesignated?: boolean | string;
  fmcsaDesignatedAt?: string;
  completedAt?: string | null;
}

interface FmcsaClearinghouse {
  alreadyDesignated?: boolean;
  acknowledgment?: boolean;
  submittedAt?: string;
}

interface OwnerProfile {
  legalName?: string;
  companyName?: string;
  contactEmail?: string;
  phone?: string;
  dotNumber?: string;
  mcNumber?: string;
  // Split address fields
  hqStreet?: string;
  hqCity?: string;
  hqState?: string;
  hqZip?: string;
  // Legacy single-line address (kept for backward compat)
  hqAddress?: string;
  operatingStates?: string[];
  coi?: COIInfo;
  onboardingStatus?: OnboardingStatus;
  profileCompletedAt?: string;
  clearinghouseCompletedAt?: string;
  fmcsaClearinghouse?: FmcsaClearinghouse;
  fmcsaVerified?: boolean;
  fmcsaData?: FMCSACarrier;
  // DEV-154 unified attestations array (replaces the old complianceAttestations
  // shape and the consents.{userAgreement,esignAgreement} fields).
  attestations?: AttestationEntry[];
}


const DOT_MIN_DIGITS = 5;
const SAFER_SNAPSHOT_URL = 'https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=';

type VerificationState = 'idle' | 'typing' | 'loading' | 'verified' | 'verified_safer_discrepancy' | 'verified_inactive' | 'error';
interface FMCSAVerification {
  state: VerificationState;
  carrier?: FMCSACarrier;
  errorMessage?: string;
}

function stateForCarrier(c: FMCSACarrier): VerificationState {
  if (!c.allowedToOperate) return 'verified_inactive';
  if (c.saferDiscrepancy) return 'verified_safer_discrepancy';
  return 'verified';
}

export default function ProfilePage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const storage = useStorage();
  const auth = useAuth();
  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [editedProfile, setEditedProfile] = useState<OwnerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const [fmcsa, setFmcsa] = useState<FMCSAVerification>({ state: 'idle' });
  const dotDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const [coiInsurerName, setCoiInsurerName] = useState('');
  const [coiPolicyNumber, setCoiPolicyNumber] = useState('');
  const [coiExpiryDate, setCoiExpiryDate] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [stateSearch, setStateSearch] = useState('');
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);

  const [attestationsExpanded, setAttestationsExpanded] = useState(false);
  const [clearinghouseExpanded, setClearinghouseExpanded] = useState(false);
  const [liInsuranceExpanded, setLiInsuranceExpanded] = useState(false);

  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    async function loadProfile() {
      if (!user || !db) return;
      try {
        const ownerDoc = await getDoc(doc(db, 'owner_operators', user.uid));
        if (ownerDoc.exists()) {
          const data = ownerDoc.data() as OwnerProfile;
          // Migrate legacy hqAddress into split fields if needed
          if (!data.hqStreet && data.hqAddress) {
            data.hqStreet = data.hqAddress;
          }
          setProfile(data);
          setEditedProfile(data);
          if (data.coi) {
            setCoiInsurerName(data.coi.insurerName || '');
            setCoiPolicyNumber(data.coi.policyNumber || '');
            setCoiExpiryDate(data.coi.expiryDate || '');
          }
          if (data.fmcsaVerified && data.fmcsaData) {
            setFmcsa({ state: stateForCarrier(data.fmcsaData), carrier: data.fmcsaData });
          }
        }
      } catch (error) {
        console.error('Failed to load profile:', error);
        showError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    }
    if (user && db) loadProfile();
  }, [user, db]);

  // Read lock state from the edited profile so the "Change DOT" action
  // (which sets editedProfile.fmcsaVerified = false) immediately unlocks
  // the UI without waiting for a Firestore round-trip.
  const fmcsaLocked = editedProfile?.fmcsaVerified === true;

  // Unified carrier view: prefer the most recent fresh lookup, fall back to
  // the saved FMCSA snapshot from Firestore.
  const fmcsaCarrier = fmcsa.carrier ?? profile?.fmcsaData;
  // True once we have a completed lookup (fresh or hydrated from saved data).
  // Used to decide when to show "not on file with FMCSA" empty states vs
  // hiding fields before the user has run a lookup yet.
  const fmcsaLookupComplete =
    fmcsa.state === 'verified' ||
    fmcsa.state === 'verified_safer_discrepancy' ||
    fmcsa.state === 'verified_inactive' ||
    fmcsaLocked;

  const verifyDOT = useCallback(async (dotNumber: string, opts: { force?: boolean } = {}) => {
    if (fmcsaLocked && !opts.force) return;
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

      // Fresh lookup: DOT may have changed from a previous verification, so
      // overwrite all dependent fields with the new carrier's values — empty
      // strings included — to prevent stale values from persisting.
      // Re-verify of a locked record: DOT/MC/Legal Name are immutable; only
      // refresh phone and address from the fresh snapshot.
      setEditedProfile(prev => {
        if (!prev) return prev;
        if (opts.force) {
          return {
            ...prev,
            phone: carrier.phone || prev.phone,
            hqStreet: carrier.hqAddress || prev.hqStreet,
            hqCity: carrier.hqCity || prev.hqCity,
            hqState: carrier.hqState || prev.hqState,
            hqZip: carrier.hqZip || prev.hqZip,
          };
        }
        return {
          ...prev,
          legalName: carrier.legalName || '',
          mcNumber: carrier.mcNumber || '',
          phone: carrier.phone || '',
          hqStreet: carrier.hqAddress || '',
          hqCity: carrier.hqCity || '',
          hqState: carrier.hqState || '',
          hqZip: carrier.hqZip || '',
        };
      });

      setFmcsa({ state: stateForCarrier(carrier), carrier });
    } catch {
      setFmcsa({ state: 'error', errorMessage: 'Could not reach FMCSA. Check your connection.' });
    }
  }, [fmcsaLocked, auth]);

  const reVerify = useCallback(() => {
    const dot = editedProfile?.dotNumber || profile?.dotNumber;
    if (!dot) return;
    verifyDOT(dot, { force: true });
  }, [editedProfile?.dotNumber, profile?.dotNumber, verifyDOT]);

  // Change DOT: clear FMCSA verification locally so DOT/MC/Legal Name become
  // editable. The user must re-verify before saving re-locks the record.
  // The change is only persisted to Firestore on save.
  const unlockFMCSA = useCallback(() => {
    const ok = window.confirm(
      'Change DOT number?\n\nYour FMCSA verification will be cleared. You\'ll need to enter a new DOT and re-verify before saving.'
    );
    if (!ok) return;
    setFmcsa({ state: 'idle' });
    setEditedProfile(prev => prev ? { ...prev, fmcsaVerified: false } : prev);
  }, []);

  // Copy the primary L&I policy (BIPD/Primary when available) into the user's
  // COI fields. Does not touch the expiry date — L&I has no real expiry field
  // (only cancl_effective_date for cancelled policies), so the user must
  // still set it themselves from their certificate.
  const fillCoiFromFmcsa = useCallback(() => {
    const summary = fmcsa.carrier?.liInsuranceSummary ?? profile?.fmcsaData?.liInsuranceSummary;
    if (!summary) return;
    if (summary.primaryInsurer) setCoiInsurerName(summary.primaryInsurer);
    if (summary.primaryPolicyNumber) setCoiPolicyNumber(summary.primaryPolicyNumber);
    showSuccess('Filled from FMCSA L&I — set expiry date and upload your certificate to complete.');
  }, [fmcsa.carrier, profile?.fmcsaData]);

  const handleDOTChange = useCallback((value: string) => {
    if (fmcsaLocked) return;
    const numbersOnly = value.replace(/\D/g, '');
    setEditedProfile(prev => prev ? { ...prev, dotNumber: numbersOnly } : prev);
    if (dotDebounceRef.current) clearTimeout(dotDebounceRef.current);
    if (numbersOnly.length === 0) { setFmcsa({ state: 'idle' }); return; }
    if (numbersOnly.length < DOT_MIN_DIGITS) { setFmcsa({ state: 'idle' }); return; }
    setFmcsa(prev =>
      prev.state !== 'loading' && prev.state !== 'verified' && prev.state !== 'verified_inactive' && prev.state !== 'verified_safer_discrepancy'
        ? { state: 'typing' } : prev
    );
    dotDebounceRef.current = setTimeout(() => verifyDOT(numbersOnly), 800);
  }, [fmcsaLocked, verifyDOT]);

  const handleChange = (field: keyof OwnerProfile, value: string) => {
    if (editedProfile) setEditedProfile({ ...editedProfile, [field]: value });
  };

  const toggleState = (stateValue: string) => {
    if (!editedProfile) return;
    const current = editedProfile.operatingStates || [];
    if (current.includes(stateValue)) setEditedProfile({ ...editedProfile, operatingStates: current.filter(s => s !== stateValue) });
    else setEditedProfile({ ...editedProfile, operatingStates: [...current, stateValue] });
  };

  const removeState = (stateValue: string) => {
    if (!editedProfile) return;
    setEditedProfile({ ...editedProfile, operatingStates: (editedProfile.operatingStates || []).filter(s => s !== stateValue) });
  };

  const filteredStates = US_STATES.filter(state =>
    state.label.toLowerCase().includes(stateSearch.toLowerCase()) ||
    state.value.toLowerCase().includes(stateSearch.toLowerCase())
  );

  const selectedStates = editedProfile?.operatingStates || [];

  const handleCoiUpload = async (file: File) => {
    if (!user || !storage || !db) return;
    const validation = validateFile(file);
    if (!validation.valid) { showError(validation.error || 'Invalid file'); return; }
    setUploading(true);
    setUploadProgress(0);
    try {
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `documents/${user.uid}/coi/${timestamp}_${sanitizedName}`;
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file);
      uploadTask.on('state_changed',
        (snapshot) => setUploadProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
        (error) => { console.error('Upload error:', error); showError('Failed to upload file.'); setUploading(false); },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          await updateDoc(doc(db, 'owner_operators', user.uid), {
            'coi.fileUrl': url, 'coi.fileName': file.name, 'coi.fileSize': file.size,
            'coi.uploadedAt': new Date().toISOString(), 'coi.updatedAt': new Date().toISOString(),
          });
          setProfile(prev => prev ? { ...prev, coi: { ...prev.coi, fileUrl: url, fileName: file.name, fileSize: file.size } } : prev);
          setEditedProfile(prev => prev ? { ...prev, coi: { ...prev.coi, fileUrl: url, fileName: file.name, fileSize: file.size } } : prev);
          setUploading(false);
          showSuccess('COI uploaded successfully!');
        }
      );
    } catch { showError('Upload failed.'); setUploading(false); }
  };

  const isCoiExpired = coiExpiryDate ? new Date(coiExpiryDate) < new Date() : false;
  const isCoiExpiringSoon = coiExpiryDate ? (() => {
    const expiry = new Date(coiExpiryDate);
    const now = new Date();
    const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days >= 0 && days <= 30;
  })() : false;

  const handleResetClearinghouse = async () => {
    if (!db || !user) return;
    setResetting(true);
    try {
      await updateDoc(doc(db, 'owner_operators', user.uid), {
        'onboardingStatus.fmcsaDesignated': false, 'onboardingStatus.fmcsaDesignatedAt': null,
        clearinghouseCompletedAt: null, fmcsaClearinghouse: null,
      });
      setProfile(prev => prev ? {
        ...prev,
        onboardingStatus: { ...prev.onboardingStatus, fmcsaDesignated: false, fmcsaDesignatedAt: undefined },
        clearinghouseCompletedAt: undefined, fmcsaClearinghouse: undefined,
      } : prev);
      setClearinghouseExpanded(false);
      setShowResetDialog(false);
      showSuccess('Clearinghouse designation has been reset.');
    } catch (error) {
      console.error('Error resetting clearinghouse:', error);
      showError('Failed to reset. Please try again.');
    } finally { setResetting(false); }
  };

  const handleSave = async () => {
    if (!editedProfile || !db || !user) return;
    if (!isOnline) { showError('You\'re offline. Please check your connection.'); return; }
    setSaving(true);
    try {
      const hasCoiData = !!(editedProfile.coi?.fileUrl || (coiInsurerName && coiPolicyNumber && coiExpiryDate));
      const hasAddress = !!(editedProfile.hqStreet && editedProfile.hqCity && editedProfile.hqState);
      const isComplete = !!(editedProfile.legalName && editedProfile.dotNumber && editedProfile.mcNumber && hasAddress && editedProfile.operatingStates?.length && hasCoiData);

      // Compose legacy hqAddress for any consumers still reading it
      const hqAddress = [editedProfile.hqStreet, editedProfile.hqCity, editedProfile.hqState, editedProfile.hqZip]
        .filter(Boolean).join(', ');

      const updateData: Record<string, unknown> = {
        legalName: editedProfile.legalName || '',
        phone: editedProfile.phone || '',
        dotNumber: editedProfile.dotNumber || '',
        mcNumber: editedProfile.mcNumber || '',
        hqStreet: editedProfile.hqStreet || '',
        hqCity: editedProfile.hqCity || '',
        hqState: editedProfile.hqState || '',
        hqZip: editedProfile.hqZip || '',
        hqAddress,
        operatingStates: editedProfile.operatingStates || [],
        'coi.insurerName': coiInsurerName,
        'coi.policyNumber': coiPolicyNumber,
        'coi.expiryDate': coiExpiryDate,
        'coi.updatedAt': new Date().toISOString(),
        'onboardingStatus.profileComplete': isComplete,
        updatedAt: new Date().toISOString(),
      };

      const isVerifiedState =
        fmcsa.state === 'verified' ||
        fmcsa.state === 'verified_safer_discrepancy' ||
        fmcsa.state === 'verified_inactive';
      // QCMobile is authoritative: both fully-verified and SAFER-discrepancy
      // carriers are legally active and should lock. verified_inactive does
      // NOT lock — carrier isn't authorized to operate yet.
      const canLock =
        fmcsa.state === 'verified' || fmcsa.state === 'verified_safer_discrepancy';
      const userUnlocked = profile?.fmcsaVerified === true && editedProfile.fmcsaVerified === false;

      if (isVerifiedState && fmcsa.carrier) {
        updateData.fmcsaData = fmcsa.carrier;
      }
      // Final fmcsaVerified for Firestore. A successful verify always locks
      // (even after an explicit unlock, since they've just re-verified).
      // Explicit unlock with no successful re-verify yet → persist false.
      if (canLock && fmcsa.carrier) {
        updateData.fmcsaVerified = true;
        updateData.fmcsaVerifiedAt = new Date().toISOString();
      } else if (userUnlocked) {
        updateData.fmcsaVerified = false;
      }
      if (isComplete && !profile?.profileCompletedAt) {
        updateData.profileCompletedAt = new Date().toISOString();
      }

      await updateDoc(doc(db, 'owner_operators', user.uid), updateData);

      const newProfile = {
        ...editedProfile,
        hqAddress,
        coi: { ...editedProfile.coi, insurerName: coiInsurerName, policyNumber: coiPolicyNumber, expiryDate: coiExpiryDate },
        onboardingStatus: { ...editedProfile.onboardingStatus, profileComplete: isComplete },
        profileCompletedAt: isComplete && !profile?.profileCompletedAt ? new Date().toISOString() : profile?.profileCompletedAt,
        ...(isVerifiedState && fmcsa.carrier ? { fmcsaData: fmcsa.carrier } : {}),
        ...(canLock && fmcsa.carrier ? { fmcsaVerified: true } : {}),
        ...(!canLock && userUnlocked ? { fmcsaVerified: false } : {}),
      };
      setProfile(newProfile);

      if (!isComplete) {
        const missing: string[] = [];
        if (!editedProfile.legalName) missing.push('Legal Name');
        if (!editedProfile.dotNumber) missing.push('DOT #');
        if (!editedProfile.mcNumber) missing.push('MC #');
        if (!hasAddress) missing.push('HQ Address');
        if (!editedProfile.operatingStates?.length) missing.push('Operating States');
        if (!hasCoiData) missing.push('Certificate of Insurance');
        showSuccess(`Profile saved. Still missing: ${missing.join(', ')}`);
      } else if (fmcsa.state === 'verified_safer_discrepancy' && canLock && fmcsa.carrier) {
        showSuccess('Profile verified and saved. Note: SAFER still shows this DOT as inactive — view your SAFER record or dispute via DataQs.');
      } else {
        showSuccess('Profile saved successfully!');
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      const appError = parseError(error);
      showError(appError.message, 'Failed to save profile');
    } finally { setSaving(false); }
  };

  const hasChanges = JSON.stringify(profile) !== JSON.stringify(editedProfile)
    || coiInsurerName !== (profile?.coi?.insurerName || '')
    || coiPolicyNumber !== (profile?.coi?.policyNumber || '')
    || coiExpiryDate !== (profile?.coi?.expiryDate || '')
    || (fmcsa.state === 'verified' && !profile?.fmcsaVerified)
    || (!!fmcsa.carrier && JSON.stringify(fmcsa.carrier) !== JSON.stringify(profile?.fmcsaData));

  const formatTimestamp = (ts?: string) => {
    if (!ts) return null;
    try { return format(parseISO(ts), "MMM d, yyyy 'at' h:mm a"); } catch { return ts; }
  };

  const showSpinner = fmcsa.state === 'typing' || fmcsa.state === 'loading';

  if (isUserLoading || loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!profile) return <p className="text-center text-muted-foreground py-12">No profile found.</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      {!isOnline && (
        <Alert variant="destructive"><WifiOff className="h-4 w-4" /><AlertDescription>You&apos;re currently offline. Changes cannot be saved.</AlertDescription></Alert>
      )}

      <div>
        <h1 className="text-2xl font-bold">Company Profile</h1>
        <p className="text-muted-foreground">View and manage your company information, insurance, and compliance status.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Company Information</CardTitle>
          <CardDescription>Your business details on XtraFleet</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Verified — active */}
          {fmcsa.state === 'verified' && fmcsa.carrier && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <div className="text-sm flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-green-800 dark:text-green-300">
                      {fmcsaLocked ? 'FMCSA Verified' : 'FMCSA Verified — save to lock'}
                    </p>
                    {fmcsaLocked && (
                      <div className="flex items-center gap-1.5">
                        <Button type="button" variant="outline" size="sm" onClick={reVerify} disabled={showSpinner} className="h-7 text-xs">
                          <RefreshCw className={`h-3 w-3 mr-1 ${showSpinner ? 'animate-spin' : ''}`} /> Re-verify
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={unlockFMCSA} disabled={showSpinner} className="h-7 text-xs text-muted-foreground">
                          Change DOT
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-green-700 dark:text-green-400">
                    {fmcsa.carrier.legalName}
                    {fmcsa.carrier.safetyRating && fmcsa.carrier.safetyRating !== 'Not Rated' && <span className="ml-2 text-xs">· Safety: {fmcsa.carrier.safetyRating}</span>}
                    <span className="ml-2 text-xs">· Authority: {fmcsa.carrier.authorityStatus || 'Active'}</span>
                    {fmcsa.carrier.insuranceOnFile && <span className="ml-2 text-xs">· Insurance on file</span>}
                  </p>
                  {fmcsaLocked && (
                    <p className="text-xs text-green-600 dark:text-green-500 mt-1 flex items-center gap-1">
                      <Lock className="h-3 w-3" /> DOT #, MC #, and Legal Name are locked after FMCSA verification. Contact support to make changes.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Verified — SAFER discrepancy (QCMobile active, SAFER inactive) */}
          {fmcsa.state === 'verified_safer_discrepancy' && fmcsa.carrier && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-amber-800 dark:text-amber-300">SAFER shows this DOT as INACTIVE</p>
                    {fmcsaLocked && (
                      <div className="flex items-center gap-1.5">
                        <Button type="button" variant="outline" size="sm" onClick={reVerify} disabled={showSpinner} className="h-7 text-xs">
                          <RefreshCw className={`h-3 w-3 mr-1 ${showSpinner ? 'animate-spin' : ''}`} /> Re-verify
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={unlockFMCSA} disabled={showSpinner} className="h-7 text-xs text-muted-foreground">
                          Change DOT
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-amber-700 dark:text-amber-400">
                    {fmcsa.carrier.legalName} is authorized to operate per QCMobile, but the SAFER database shows this DOT as inactive.
                    This usually means authority was recently reinstated and SAFER hasn&apos;t synced yet.{' '}
                    <a href={`${SAFER_SNAPSHOT_URL}${encodeURIComponent(fmcsa.carrier.dotNumber)}`} target="_blank" rel="noopener noreferrer" className="underline font-medium hover:text-amber-900 dark:hover:text-amber-200 inline-flex items-center gap-1">
                      View your SAFER record <ExternalLink className="h-3 w-3" />
                    </a>
                    {' '}or{' '}
                    <a href="https://www.fmcsa.dot.gov/registration/dataqs" target="_blank" rel="noopener noreferrer" className="underline font-medium hover:text-amber-900 dark:hover:text-amber-200">
                      dispute via FMCSA DataQs
                    </a>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Verified — authority inactive */}
          {fmcsa.state === 'verified_inactive' && fmcsa.carrier && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-amber-800 dark:text-amber-300">FMCSA Found — Authority Inactive</p>
                    {fmcsaLocked && (
                      <div className="flex items-center gap-1.5">
                        <Button type="button" variant="outline" size="sm" onClick={reVerify} disabled={showSpinner} className="h-7 text-xs">
                          <RefreshCw className={`h-3 w-3 mr-1 ${showSpinner ? 'animate-spin' : ''}`} /> Re-verify
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={unlockFMCSA} disabled={showSpinner} className="h-7 text-xs text-muted-foreground">
                          Change DOT
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-amber-700 dark:text-amber-400">
                    {fmcsa.carrier.legalName} was found in FMCSA records but is not currently authorized to operate.
                    Your profile information has been pre-filled.{' '}
                    <a href={`${SAFER_SNAPSHOT_URL}${encodeURIComponent(fmcsa.carrier.dotNumber)}`} target="_blank" rel="noopener noreferrer" className="underline font-medium hover:text-amber-900 dark:hover:text-amber-200 inline-flex items-center gap-1">
                      View your SAFER record <ExternalLink className="h-3 w-3" />
                    </a>
                    {' '}and update your operating authority at{' '}
                    <a href="https://www.fmcsa.dot.gov" target="_blank" rel="noopener noreferrer" className="underline font-medium hover:text-amber-900 dark:hover:text-amber-200">fmcsa.dot.gov</a>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {fmcsa.state === 'error' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-300">Could not verify DOT number</p>
                  <p className="text-amber-700 dark:text-amber-400">{fmcsa.errorMessage}</p>
                </div>
              </div>
            </div>
          )}

          {/* DOT first */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="dotNumber">DOT Number {fmcsaLocked && <Lock className="inline h-3 w-3 ml-1 text-muted-foreground" />}</Label>
              <div className="relative">
                <Input id="dotNumber" value={editedProfile?.dotNumber || ''} onChange={(e) => handleDOTChange(e.target.value)} placeholder="e.g., 1234567" inputMode="numeric" disabled={!isOnline || fmcsaLocked} className={`pr-9 ${fmcsaLocked ? 'bg-muted cursor-not-allowed' : ''}`} />
                <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
                  {showSpinner && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {!showSpinner && fmcsa.state === 'verified' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  {!showSpinner && (fmcsa.state === 'verified_inactive' || fmcsa.state === 'verified_safer_discrepancy') && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                  {!showSpinner && fmcsa.state === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Enter your USDOT number — fields below auto-fill from FMCSA</p>
            </div>
            <div>
              <Label htmlFor="mcNumber">MC Number {fmcsaLocked && <Lock className="inline h-3 w-3 ml-1 text-muted-foreground" />}</Label>
              <Input id="mcNumber" value={editedProfile?.mcNumber || ''} onChange={(e) => !fmcsaLocked && handleChange('mcNumber', e.target.value)} placeholder="MC-123456" disabled={!isOnline || fmcsaLocked} className={fmcsaLocked ? 'bg-muted cursor-not-allowed' : ''} />
              {fmcsaLookupComplete && !editedProfile?.mcNumber && (
                <p className="text-xs text-muted-foreground mt-1">No MC number on file with FMCSA.</p>
              )}
            </div>
            <div>
              <Label htmlFor="legalName">Legal Name {fmcsaLocked && <Lock className="inline h-3 w-3 ml-1 text-muted-foreground" />}</Label>
              <Input id="legalName" value={editedProfile?.legalName || ''} onChange={(e) => !fmcsaLocked && handleChange('legalName', e.target.value)} placeholder="Your company legal name" disabled={!isOnline || fmcsaLocked} className={fmcsaLocked ? 'bg-muted cursor-not-allowed' : ''} />
            </div>
            <div>
              <Label htmlFor="contactEmail">Email</Label>
              <Input id="contactEmail" value={editedProfile?.contactEmail || user?.email || ''} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground mt-1">Change email in Settings</p>
            </div>
            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" type="tel" value={editedProfile?.phone || ''} onChange={(e) => handleChange('phone', e.target.value)} placeholder="(555) 123-4567" disabled={!isOnline} />
            </div>
          </div>

          {/* Split address fields */}
          <div>
            <Label className="mb-2 block">HQ Address</Label>
            <div className="space-y-2">
              <Input
                id="hqStreet"
                value={editedProfile?.hqStreet || ''}
                onChange={(e) => handleChange('hqStreet', e.target.value)}
                placeholder="Street address"
                disabled={!isOnline}
              />
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Input
                  className="col-span-2 md:col-span-2"
                  value={editedProfile?.hqCity || ''}
                  onChange={(e) => handleChange('hqCity', e.target.value)}
                  placeholder="City"
                  disabled={!isOnline}
                />
                <Input
                  value={editedProfile?.hqState || ''}
                  onChange={(e) => handleChange('hqState', e.target.value.toUpperCase())}
                  placeholder="State"
                  maxLength={2}
                  disabled={!isOnline}
                />
                <Input
                  value={editedProfile?.hqZip || ''}
                  onChange={(e) => handleChange('hqZip', e.target.value)}
                  placeholder="ZIP"
                  maxLength={10}
                  disabled={!isOnline}
                />
              </div>
            </div>
          </div>

        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /> Operating States</CardTitle>
          <CardDescription>Select all states where you operate</CardDescription>
        </CardHeader>
        <CardContent>
          {selectedStates.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {selectedStates.map(code => {
                const state = US_STATES.find(s => s.value === code);
                return (
                  <Badge key={code} variant="secondary" className="pl-2 pr-1 py-1 gap-1">
                    {state?.label || code}
                    <button type="button" onClick={() => removeState(code)} className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"><X className="h-3 w-3" /></button>
                  </Badge>
                );
              })}
            </div>
          )}
          <div className="relative">
            <button type="button" onClick={() => setStateDropdownOpen(!stateDropdownOpen)} className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
              <span className="text-muted-foreground">{selectedStates.length === 0 ? 'Select states...' : `${selectedStates.length} state${selectedStates.length === 1 ? '' : 's'} selected`}</span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </button>
            {stateDropdownOpen && (
              <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
                <div className="flex items-center border-b px-3 py-2"><Search className="h-4 w-4 text-muted-foreground mr-2" /><input type="text" placeholder="Search states..." value={stateSearch} onChange={(e) => setStateSearch(e.target.value)} className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" autoFocus /></div>
                <div className="flex justify-between px-3 py-1.5 border-b text-xs">
                  <button type="button" onClick={() => setEditedProfile(prev => prev ? { ...prev, operatingStates: US_STATES.map(s => s.value) } : prev)} className="text-primary hover:underline">Select All</button>
                  <button type="button" onClick={() => setEditedProfile(prev => prev ? { ...prev, operatingStates: [] } : prev)} className="text-muted-foreground hover:underline">Clear All</button>
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
                <div className="border-t p-2"><Button type="button" size="sm" className="w-full" onClick={() => { setStateDropdownOpen(false); setStateSearch(''); }}>Done</Button></div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Insurance on File with FMCSA (from Socrata L&I dataset, read-only) */}
      {(() => {
        const li = (fmcsa.carrier?.liInsurance ?? profile?.fmcsaData?.liInsurance) || [];
        const summary = fmcsa.carrier?.liInsuranceSummary ?? profile?.fmcsaData?.liInsuranceSummary;
        // Hide the card only before a lookup has ever run. Once we know FMCSA
        // has nothing on file, show the card with an explicit empty state so
        // the user doesn't wonder whether the lookup silently failed.
        if (!fmcsaLookupComplete) return null;
        const hasData = li.length > 0;
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" /> Insurance on File with FMCSA
              </CardTitle>
              <CardDescription>
                Reported to FMCSA&apos;s Licensing & Insurance program. This is separate from the COI you upload below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm flex-1">
                  {hasData && summary ? (
                    <>
                      <p className="font-medium">
                        {summary.primaryInsurer || 'Policy on file'}
                      </p>
                      <p className="text-muted-foreground text-xs mt-0.5">
                        {summary.primaryPolicyNumber && <>Policy {summary.primaryPolicyNumber} · </>}
                        {summary.primaryEffectiveDate && <>Effective {summary.primaryEffectiveDate} · </>}
                        {summary.primaryMaxCoverage && <>Coverage ${summary.primaryMaxCoverage}k · </>}
                        {summary.policyCount} {summary.policyCount === 1 ? 'policy' : 'policies'} on file
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 flex gap-3">
                        {summary.hasBIPD && <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-green-600" /> BIPD</span>}
                        {summary.hasCargo && <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-green-600" /> Cargo</span>}
                        {summary.hasSurety && <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-green-600" /> Surety</span>}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No active insurance policies found in FMCSA L&I records.</p>
                  )}
                </div>
                {hasData && (
                  <button
                    type="button"
                    onClick={() => setLiInsuranceExpanded(v => !v)}
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    aria-label={liInsuranceExpanded ? 'Collapse insurance details' : 'Expand insurance details'}
                  >
                    {liInsuranceExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                )}
              </div>

              {hasData && liInsuranceExpanded && (
                <div className="mt-4 space-y-2">
                  {li.map((p, idx) => (
                    <div key={`${p.docketNumber}-${p.formCode}-${p.policyNumber}-${idx}`} className="rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm">
                          <p className="font-medium">{p.insurer}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {p.insuranceType} · Form {p.formCode} · {p.docketNumber}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {p.maxCoverage ? `$${p.maxCoverage}k` : ''}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Policy {p.policyNumber || '—'}
                        {p.effectiveDate && <> · Effective {p.effectiveDate}</>}
                        {p.cancellationDate && <> · Cancelled {p.cancellationDate}</>}
                      </p>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground italic mt-2">
                    Source: FMCSA Licensing &amp; Insurance (data.transportation.gov). Updates can lag actual policy changes by several days.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Certificate of Insurance (COI)</CardTitle>
          <CardDescription>Upload your COI and enter policy details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isCoiExpired && (<Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Your insurance policy has expired. Please update your information.</AlertDescription></Alert>)}
          {!isCoiExpired && isCoiExpiringSoon && (<Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>Your insurance policy is expiring within 30 days.</AlertDescription></Alert>)}
          {editedProfile?.coi?.fileUrl ? (
            <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm">{editedProfile.coi.fileName || 'COI Document'}</span>
                <Check className="h-4 w-4 text-green-600" />
              </div>
              <a href={editedProfile.coi.fileUrl} target="_blank" rel="noopener noreferrer"><Button variant="ghost" size="sm"><ExternalLink className="h-4 w-4" /></Button></a>
            </div>
          ) : (
            <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors" onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const file = e.dataTransfer.files[0]; if (file) handleCoiUpload(file); }} onClick={() => document.getElementById('coi-file-input')?.click()}>
              {uploading ? (
                <div className="space-y-2"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /><p className="text-sm text-muted-foreground">Uploading... {uploadProgress}%</p><div className="w-full bg-muted rounded-full h-2 max-w-xs mx-auto"><div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} /></div></div>
              ) : (<><UploadCloud className="h-8 w-8 mx-auto text-muted-foreground mb-2" /><p className="text-sm font-medium">Drop your COI here or click to browse</p><p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG, or WEBP (max 10MB)</p></>)}
            </div>
          )}
          <input id="coi-file-input" type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleCoiUpload(file); e.target.value = ''; }} />
          {editedProfile?.coi?.fileUrl && (
            <div>
              <Label htmlFor="coi-reupload" className="cursor-pointer"><Button variant="outline" size="sm" asChild><span><Upload className="h-4 w-4 mr-1" /> Upload New COI</span></Button></Label>
              <input id="coi-reupload" type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleCoiUpload(file); e.target.value = ''; }} />
            </div>
          )}
          <Separator />
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium">Policy Details</h4>
              {(fmcsaCarrier?.liInsuranceSummary?.primaryInsurer || fmcsaCarrier?.liInsuranceSummary?.primaryPolicyNumber) && (
                <Button type="button" variant="outline" size="sm" onClick={fillCoiFromFmcsa} disabled={!isOnline} className="h-7 text-xs">
                  <RefreshCw className="h-3 w-3 mr-1" /> Fill from FMCSA
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label htmlFor="coiInsurer">Insurance Company Name</Label><Input id="coiInsurer" value={coiInsurerName} onChange={(e) => setCoiInsurerName(e.target.value)} placeholder="e.g., Progressive Commercial" disabled={!isOnline} /></div>
              <div><Label htmlFor="coiPolicy">Policy Number</Label><Input id="coiPolicy" value={coiPolicyNumber} onChange={(e) => setCoiPolicyNumber(e.target.value)} placeholder="e.g., COM-12345678" disabled={!isOnline} /></div>
              <div><Label htmlFor="coiExpiry">Expiry Date</Label><Input id="coiExpiry" type="date" value={coiExpiryDate} onChange={(e) => setCoiExpiryDate(e.target.value)} disabled={!isOnline} className={isCoiExpired ? 'border-red-500' : isCoiExpiringSoon ? 'border-yellow-500' : ''} /></div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Compliance Status</CardTitle>
          <CardDescription>Your onboarding completion and compliance checks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm">Company Profile</span>
              {profile.profileCompletedAt && (<p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Clock className="h-3 w-3" /> Completed: {formatTimestamp(profile.profileCompletedAt)}</p>)}
            </div>
            {profile.onboardingStatus?.profileComplete ? <Badge variant="default" className="bg-green-600">Complete</Badge> : <div className="flex items-center gap-1.5"><Info className="h-3.5 w-3.5 text-amber-500" /><span className="text-xs text-amber-600 dark:text-amber-400">Incomplete &mdash; fill in the fields above and save</span></div>}
          </div>
          <Separator />
          <div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm">Attestations on File</span>
                {profile.attestations && profile.attestations.length > 0 && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" />
                    {profile.attestations.length} on file
                    {profile.attestations[profile.attestations.length - 1]?.acceptedAt && (
                      <> · last {formatTimestamp(profile.attestations[profile.attestations.length - 1].acceptedAt)}</>
                    )}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {profile.attestations && profile.attestations.length > 0 ? (
                  <>
                    <Badge variant="default" className="bg-green-600">{profile.attestations.length}</Badge>
                    <button type="button" onClick={() => setAttestationsExpanded(!attestationsExpanded)} className="text-muted-foreground hover:text-foreground transition-colors">
                      {attestationsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">None recorded</span>
                )}
              </div>
            </div>
            {attestationsExpanded && profile.attestations && profile.attestations.length > 0 && (
              <div className="mt-3 space-y-2 pl-1">
                {profile.attestations.map((entry, idx) => {
                  const def = ATTESTATIONS[entry.type];
                  const stale = def && entry.version < def.v;
                  return (
                    <div key={`${entry.type}-${entry.acceptedAt}-${idx}`} className="rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className={`h-4 w-4 mt-0.5 shrink-0 ${stale ? 'text-amber-500' : 'text-green-600'}`} />
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {entry.type}
                            <span className="ml-2 text-xs text-muted-foreground font-normal">
                              v{entry.version}{stale && ` (current: v${def.v})`}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">{entry.text}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Accepted: {formatTimestamp(entry.acceptedAt)}
                            {entry.context?.matchId && <> · match {entry.context.matchId}</>}
                            {entry.context?.driverId && <> · driver {entry.context.driverId}</>}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <Separator />
          <div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm">FMCSA Clearinghouse</span>
                {profile.clearinghouseCompletedAt && (<p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Clock className="h-3 w-3" /> Completed: {formatTimestamp(profile.clearinghouseCompletedAt)}</p>)}
              </div>
              <div className="flex items-center gap-2">
                {profile.onboardingStatus?.fmcsaDesignated === true ? (<><Badge variant="default" className="bg-green-600">Designated</Badge><button type="button" onClick={() => setClearinghouseExpanded(!clearinghouseExpanded)} className="text-muted-foreground hover:text-foreground transition-colors">{clearinghouseExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button></>) : profile.onboardingStatus?.fmcsaDesignated === 'pending' ? (<><Badge variant="outline" className="text-amber-600 border-amber-600">Pending</Badge><button type="button" onClick={() => setClearinghouseExpanded(!clearinghouseExpanded)} className="text-muted-foreground hover:text-foreground transition-colors">{clearinghouseExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button></>) : (<Button asChild size="sm" variant="outline"><Link href="/onboarding/fmcsa-clearinghouse">{profile.onboardingStatus?.fmcsaDesignated === 'skipped' ? 'Complete' : 'Start'} <ArrowRight className="h-3 w-3 ml-1" /></Link></Button>)}
              </div>
            </div>
            {clearinghouseExpanded && (profile.onboardingStatus?.fmcsaDesignated === true || profile.onboardingStatus?.fmcsaDesignated === 'pending') && (
              <div className="mt-3 space-y-3 pl-1">
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  {profile.fmcsaClearinghouse?.alreadyDesignated ? (<div className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" /><div><p className="text-sm font-medium">Already Designated</p><p className="text-xs text-muted-foreground mt-0.5">You confirmed that XtraFleet Technologies Inc. has been designated as your Designated Agent in the FMCSA Clearinghouse.</p></div></div>) : profile.fmcsaClearinghouse?.acknowledgment ? (<div className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" /><div><p className="text-sm font-medium">Acknowledged (Pending Designation)</p><p className="text-xs text-muted-foreground mt-0.5">You acknowledged that XtraFleet Technologies Inc. must be designated as a Clearinghouse Designated Agent to facilitate eligibility checks. Designation is still pending.</p></div></div>) : (<p className="text-sm text-muted-foreground">Clearinghouse designation was submitted.</p>)}
                  {profile.fmcsaClearinghouse?.submittedAt && (<p className="text-xs text-muted-foreground">Submitted: {formatTimestamp(profile.fmcsaClearinghouse.submittedAt)}</p>)}
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowResetDialog(true)} className="text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Change Designation</Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end pb-6">
        <Button onClick={handleSave} disabled={saving || !hasChanges || !isOnline} size="lg">
          {saving ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>) : (<><Save className="h-4 w-4 mr-2" />Save Profile</>)}
        </Button>
      </div>

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Clearinghouse Designation?</AlertDialogTitle>
            <AlertDialogDescription>This will reset your FMCSA Clearinghouse designation status. You will need to re-submit your designation through the onboarding flow. Driver matching may be limited until the designation is confirmed again.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetClearinghouse} disabled={resetting} className="bg-amber-600 hover:bg-amber-700">{resetting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Resetting...</> : 'Yes, Reset Designation'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
