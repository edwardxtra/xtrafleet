'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser, useFirestore, useStorage } from '@/firebase';
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
  AlertTriangle, UploadCloud, Info, CheckCircle2, RefreshCw,
} from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast-utils';
import { parseError } from '@/lib/error-utils';
import { format, parseISO } from 'date-fns';

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
  complianceAttested?: boolean;
  complianceAttestedAt?: string;
  fmcsaDesignated?: boolean | string;
  fmcsaDesignatedAt?: string;
  completedAt?: string | null;
}

interface FmcsaClearinghouse {
  alreadyDesignated?: boolean;
  acknowledgment?: boolean;
  submittedAt?: string;
}

interface ComplianceAttestations {
  employmentCompliance?: { accepted: boolean; acceptedAt: string };
  verificationAuth?: { accepted: boolean; acceptedAt: string };
  noRelianceDisclaimer?: { accepted: boolean; acceptedAt: string };
}

interface OwnerProfile {
  legalName?: string;
  companyName?: string;
  contactEmail?: string;
  phone?: string;
  dotNumber?: string;
  mcNumber?: string;
  hqAddress?: string;
  operatingStates?: string[];
  coi?: COIInfo;
  onboardingStatus?: OnboardingStatus;
  profileCompletedAt?: string;
  clearinghouseCompletedAt?: string;
  complianceAttestations?: ComplianceAttestations;
  fmcsaClearinghouse?: FmcsaClearinghouse;
}

const ATTESTATION_LABELS: Record<string, { title: string; description: string }> = {
  employmentCompliance: {
    title: 'Employment & Compliance Responsibility',
    description: 'We acknowledge that our company retains full responsibility for employment decisions, compliance determinations, and regulatory obligations related to our drivers.',
  },
  verificationAuth: {
    title: 'Verification Use Authorization',
    description: 'We authorize XtraFleet to facilitate limited, transaction-based eligibility verification (e.g., license status, endorsements, Clearinghouse eligibility) on our behalf, subject to driver consent.',
  },
  noRelianceDisclaimer: {
    title: 'No Reliance Disclaimer',
    description: 'We understand that verification results provided through XtraFleet are eligibility signals only and do not replace our independent compliance or safety obligations.',
  },
};

export default function ProfilePage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const storage = useStorage();
  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [editedProfile, setEditedProfile] = useState<OwnerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // COI state
  const [coiInsurerName, setCoiInsurerName] = useState('');
  const [coiPolicyNumber, setCoiPolicyNumber] = useState('');
  const [coiExpiryDate, setCoiExpiryDate] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Operating states dropdown
  const [stateSearch, setStateSearch] = useState('');
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);

  // Compliance review expand/collapse
  const [attestationsExpanded, setAttestationsExpanded] = useState(false);
  const [clearinghouseExpanded, setClearinghouseExpanded] = useState(false);

  // Clearinghouse reset dialog
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Network detection
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

  // Load profile
  useEffect(() => {
    async function loadProfile() {
      if (!user || !db) return;
      try {
        const ownerDoc = await getDoc(doc(db, 'owner_operators', user.uid));
        if (ownerDoc.exists()) {
          const data = ownerDoc.data() as OwnerProfile;
          setProfile(data);
          setEditedProfile(data);
          if (data.coi) {
            setCoiInsurerName(data.coi.insurerName || '');
            setCoiPolicyNumber(data.coi.policyNumber || '');
            setCoiExpiryDate(data.coi.expiryDate || '');
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

  const handleChange = (field: keyof OwnerProfile, value: string) => {
    if (editedProfile) {
      setEditedProfile({ ...editedProfile, [field]: value });
    }
  };

  const toggleState = (stateValue: string) => {
    if (!editedProfile) return;
    const current = editedProfile.operatingStates || [];
    if (current.includes(stateValue)) {
      setEditedProfile({ ...editedProfile, operatingStates: current.filter(s => s !== stateValue) });
    } else {
      setEditedProfile({ ...editedProfile, operatingStates: [...current, stateValue] });
    }
  };

  const removeState = (stateValue: string) => {
    if (!editedProfile) return;
    const current = editedProfile.operatingStates || [];
    setEditedProfile({ ...editedProfile, operatingStates: current.filter(s => s !== stateValue) });
  };

  const filteredStates = US_STATES.filter(state =>
    state.label.toLowerCase().includes(stateSearch.toLowerCase()) ||
    state.value.toLowerCase().includes(stateSearch.toLowerCase())
  );

  const selectedStates = editedProfile?.operatingStates || [];

  // COI file upload
  const handleCoiUpload = async (file: File) => {
    if (!user || !storage || !db) return;
    const validation = validateFile(file);
    if (!validation.valid) {
      showError(validation.error || 'Invalid file');
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    try {
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `documents/${user.uid}/coi/${timestamp}_${sanitizedName}`;
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(Math.round(progress));
        },
        (error) => {
          console.error('Upload error:', error);
          showError('Failed to upload file.');
          setUploading(false);
        },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          await updateDoc(doc(db, 'owner_operators', user.uid), {
            'coi.fileUrl': url,
            'coi.fileName': file.name,
            'coi.fileSize': file.size,
            'coi.uploadedAt': new Date().toISOString(),
            'coi.updatedAt': new Date().toISOString(),
          });
          setProfile(prev => prev ? {
            ...prev,
            coi: { ...prev.coi, fileUrl: url, fileName: file.name, fileSize: file.size }
          } : prev);
          setEditedProfile(prev => prev ? {
            ...prev,
            coi: { ...prev.coi, fileUrl: url, fileName: file.name, fileSize: file.size }
          } : prev);
          setUploading(false);
          showSuccess('COI uploaded successfully!');
        }
      );
    } catch (error) {
      showError('Upload failed.');
      setUploading(false);
    }
  };

  // COI expiry check
  const isCoiExpired = coiExpiryDate ? new Date(coiExpiryDate) < new Date() : false;
  const isCoiExpiringSoon = coiExpiryDate ? (() => {
    const expiry = new Date(coiExpiryDate);
    const now = new Date();
    const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days >= 0 && days <= 30;
  })() : false;

  // Reset clearinghouse designation
  const handleResetClearinghouse = async () => {
    if (!db || !user) return;
    setResetting(true);
    try {
      await updateDoc(doc(db, 'owner_operators', user.uid), {
        'onboardingStatus.fmcsaDesignated': false,
        'onboardingStatus.fmcsaDesignatedAt': null,
        clearinghouseCompletedAt: null,
        fmcsaClearinghouse: null,
      });
      setProfile(prev => prev ? {
        ...prev,
        onboardingStatus: { ...prev.onboardingStatus, fmcsaDesignated: false, fmcsaDesignatedAt: undefined },
        clearinghouseCompletedAt: undefined,
        fmcsaClearinghouse: undefined,
      } : prev);
      setClearinghouseExpanded(false);
      setShowResetDialog(false);
      showSuccess('Clearinghouse designation has been reset. You can re-submit when ready.');
    } catch (error) {
      console.error('Error resetting clearinghouse:', error);
      showError('Failed to reset. Please try again.');
    } finally {
      setResetting(false);
    }
  };

  // Save profile
  const handleSave = async () => {
    if (!editedProfile || !db || !user) return;
    if (!isOnline) {
      showError('You\'re offline. Please check your connection.');
      return;
    }
    setSaving(true);
    try {
      const hasCoiData = !!(editedProfile.coi?.fileUrl || (coiInsurerName && coiPolicyNumber && coiExpiryDate));
      const isComplete = !!(editedProfile.legalName && editedProfile.dotNumber && editedProfile.mcNumber && editedProfile.hqAddress && editedProfile.operatingStates?.length && hasCoiData);

      const updateData: Record<string, any> = {
        legalName: editedProfile.legalName || '',
        phone: editedProfile.phone || '',
        dotNumber: editedProfile.dotNumber || '',
        mcNumber: editedProfile.mcNumber || '',
        hqAddress: editedProfile.hqAddress || '',
        operatingStates: editedProfile.operatingStates || [],
        'coi.insurerName': coiInsurerName,
        'coi.policyNumber': coiPolicyNumber,
        'coi.expiryDate': coiExpiryDate,
        'coi.updatedAt': new Date().toISOString(),
        'onboardingStatus.profileComplete': isComplete,
        updatedAt: new Date().toISOString(),
      };

      if (isComplete && !profile?.profileCompletedAt) {
        updateData.profileCompletedAt = new Date().toISOString();
      }

      await updateDoc(doc(db, 'owner_operators', user.uid), updateData);
      setProfile({
        ...editedProfile,
        coi: {
          ...editedProfile.coi,
          insurerName: coiInsurerName,
          policyNumber: coiPolicyNumber,
          expiryDate: coiExpiryDate,
        },
        onboardingStatus: {
          ...editedProfile.onboardingStatus,
          profileComplete: isComplete,
        },
        profileCompletedAt: isComplete && !profile?.profileCompletedAt
          ? new Date().toISOString()
          : profile?.profileCompletedAt,
      });

      if (!isComplete) {
        const missing: string[] = [];
        if (!editedProfile.legalName) missing.push('Legal Name');
        if (!editedProfile.dotNumber) missing.push('DOT #');
        if (!editedProfile.mcNumber) missing.push('MC #');
        if (!editedProfile.hqAddress) missing.push('HQ Address');
        if (!editedProfile.operatingStates?.length) missing.push('Operating States');
        if (!hasCoiData) missing.push('Certificate of Insurance');
        showSuccess(`Profile saved. Still missing: ${missing.join(', ')}`);
      } else {
        showSuccess('Profile saved successfully!');
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      const appError = parseError(error);
      showError(appError.message, 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = JSON.stringify(profile) !== JSON.stringify(editedProfile)
    || coiInsurerName !== (profile?.coi?.insurerName || '')
    || coiPolicyNumber !== (profile?.coi?.policyNumber || '')
    || coiExpiryDate !== (profile?.coi?.expiryDate || '');

  const formatTimestamp = (ts?: string) => {
    if (!ts) return null;
    try { return format(parseISO(ts), 'MMM d, yyyy \'at\' h:mm a'); } catch { return ts; }
  };

  if (isUserLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return <p className="text-center text-muted-foreground py-12">No profile found.</p>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Offline Banner */}
      {!isOnline && (
        <Alert variant="destructive">
          <WifiOff className="h-4 w-4" />
          <AlertDescription>You&apos;re currently offline. Changes cannot be saved.</AlertDescription>
        </Alert>
      )}

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">Company Profile</h1>
        <p className="text-muted-foreground">View and manage your company information, insurance, and compliance status.</p>
      </div>

      {/* Company Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Company Information</CardTitle>
          <CardDescription>Your business details on XtraFleet</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="legalName">Legal Name</Label>
              <Input id="legalName" value={editedProfile?.legalName || ''} onChange={(e) => handleChange('legalName', e.target.value)} placeholder="Your company legal name" disabled={!isOnline} />
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
            <div>
              <Label htmlFor="hqAddress">HQ Address</Label>
              <Input id="hqAddress" value={editedProfile?.hqAddress || ''} onChange={(e) => handleChange('hqAddress', e.target.value)} placeholder="123 Main St, City, State ZIP" disabled={!isOnline} />
            </div>
            <div>
              <Label htmlFor="dotNumber">DOT Number</Label>
              <Input id="dotNumber" value={editedProfile?.dotNumber || ''} onChange={(e) => handleChange('dotNumber', e.target.value)} placeholder="1234567" disabled={!isOnline} />
            </div>
            <div>
              <Label htmlFor="mcNumber">MC Number</Label>
              <Input id="mcNumber" value={editedProfile?.mcNumber || ''} onChange={(e) => handleChange('mcNumber', e.target.value)} placeholder="MC-123456" disabled={!isOnline} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Operating States */}
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

      {/* Certificate of Insurance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Certificate of Insurance (COI)</CardTitle>
          <CardDescription>Upload your COI and enter policy details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isCoiExpired && (
            <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Your insurance policy has expired. Please update your information.</AlertDescription></Alert>
          )}
          {!isCoiExpired && isCoiExpiringSoon && (
            <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>Your insurance policy is expiring within 30 days.</AlertDescription></Alert>
          )}

          {editedProfile?.coi?.fileUrl ? (
            <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm">{editedProfile.coi.fileName || 'COI Document'}</span>
                <Check className="h-4 w-4 text-green-600" />
              </div>
              <a href={editedProfile.coi.fileUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="sm"><ExternalLink className="h-4 w-4" /></Button>
              </a>
            </div>
          ) : (
            <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const file = e.dataTransfer.files[0]; if (file) handleCoiUpload(file); }}
              onClick={() => document.getElementById('coi-file-input')?.click()}>
              {uploading ? (
                <div className="space-y-2">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                  <p className="text-sm text-muted-foreground">Uploading... {uploadProgress}%</p>
                  <div className="w-full bg-muted rounded-full h-2 max-w-xs mx-auto"><div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} /></div>
                </div>
              ) : (
                <><UploadCloud className="h-8 w-8 mx-auto text-muted-foreground mb-2" /><p className="text-sm font-medium">Drop your COI here or click to browse</p><p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG, or WEBP (max 10MB)</p></>
              )}
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
            <h4 className="text-sm font-medium mb-3">Policy Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label htmlFor="coiInsurer">Insurance Company Name</Label><Input id="coiInsurer" value={coiInsurerName} onChange={(e) => setCoiInsurerName(e.target.value)} placeholder="e.g., Progressive Commercial" disabled={!isOnline} /></div>
              <div><Label htmlFor="coiPolicy">Policy Number</Label><Input id="coiPolicy" value={coiPolicyNumber} onChange={(e) => setCoiPolicyNumber(e.target.value)} placeholder="e.g., COM-12345678" disabled={!isOnline} /></div>
              <div><Label htmlFor="coiExpiry">Expiry Date</Label><Input id="coiExpiry" type="date" value={coiExpiryDate} onChange={(e) => setCoiExpiryDate(e.target.value)} disabled={!isOnline} className={isCoiExpired ? 'border-red-500' : isCoiExpiringSoon ? 'border-yellow-500' : ''} /></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compliance Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Compliance Status</CardTitle>
          <CardDescription>Your onboarding completion and compliance checks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Profile Complete */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm">Company Profile</span>
              {profile.profileCompletedAt && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Clock className="h-3 w-3" /> Completed: {formatTimestamp(profile.profileCompletedAt)}
                </p>
              )}
            </div>
            {profile.onboardingStatus?.profileComplete
              ? <Badge variant="default" className="bg-green-600">Complete</Badge>
              : (
                <div className="flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs text-amber-600 dark:text-amber-400">Incomplete \u2014 fill in the fields above and save</span>
                </div>
              )
            }
          </div>
          <Separator />

          {/* Compliance Attestations */}
          <div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm">Compliance Attestations</span>
                {profile.onboardingStatus?.complianceAttestedAt && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" /> Completed: {formatTimestamp(profile.onboardingStatus.complianceAttestedAt)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {profile.onboardingStatus?.complianceAttested ? (
                  <>
                    <Badge variant="default" className="bg-green-600">Attested</Badge>
                    <button type="button" onClick={() => setAttestationsExpanded(!attestationsExpanded)} className="text-muted-foreground hover:text-foreground transition-colors">
                      {attestationsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </>
                ) : (
                  <Button asChild size="sm" variant="outline">
                    <Link href="/onboarding/compliance">Complete <ArrowRight className="h-3 w-3 ml-1" /></Link>
                  </Button>
                )}
              </div>
            </div>

            {/* Expanded attestation details */}
            {attestationsExpanded && profile.onboardingStatus?.complianceAttested && (
              <div className="mt-3 space-y-2 pl-1">
                {Object.entries(ATTESTATION_LABELS).map(([key, { title, description }]) => {
                  const attestation = profile.complianceAttestations?.[key as keyof ComplianceAttestations];
                  return (
                    <div key={key} className="rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                          {attestation?.acceptedAt && (
                            <p className="text-xs text-muted-foreground mt-1">Accepted: {formatTimestamp(attestation.acceptedAt)}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <Separator />

          {/* FMCSA Clearinghouse */}
          <div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm">FMCSA Clearinghouse</span>
                {profile.clearinghouseCompletedAt && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" /> Completed: {formatTimestamp(profile.clearinghouseCompletedAt)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {profile.onboardingStatus?.fmcsaDesignated === true ? (
                  <>
                    <Badge variant="default" className="bg-green-600">Designated</Badge>
                    <button type="button" onClick={() => setClearinghouseExpanded(!clearinghouseExpanded)} className="text-muted-foreground hover:text-foreground transition-colors">
                      {clearinghouseExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </>
                ) : profile.onboardingStatus?.fmcsaDesignated === 'pending' ? (
                  <>
                    <Badge variant="outline" className="text-amber-600 border-amber-600">Pending</Badge>
                    <button type="button" onClick={() => setClearinghouseExpanded(!clearinghouseExpanded)} className="text-muted-foreground hover:text-foreground transition-colors">
                      {clearinghouseExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </>
                ) : (
                  <Button asChild size="sm" variant="outline">
                    <Link href="/onboarding/fmcsa-clearinghouse">{profile.onboardingStatus?.fmcsaDesignated === 'skipped' ? 'Complete' : 'Start'} <ArrowRight className="h-3 w-3 ml-1" /></Link>
                  </Button>
                )}
              </div>
            </div>

            {/* Expanded clearinghouse details */}
            {clearinghouseExpanded && (profile.onboardingStatus?.fmcsaDesignated === true || profile.onboardingStatus?.fmcsaDesignated === 'pending') && (
              <div className="mt-3 space-y-3 pl-1">
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  {profile.fmcsaClearinghouse?.alreadyDesignated ? (
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Already Designated</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          You confirmed that XtraFleet Technologies Inc. has been designated as your Designated Agent in the FMCSA Clearinghouse.
                        </p>
                      </div>
                    </div>
                  ) : profile.fmcsaClearinghouse?.acknowledgment ? (
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Acknowledged (Pending Designation)</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          You acknowledged that XtraFleet Technologies Inc. must be designated as a Clearinghouse Designated Agent to facilitate eligibility checks. Designation is still pending.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Clearinghouse designation was submitted.</p>
                  )}
                  {profile.fmcsaClearinghouse?.submittedAt && (
                    <p className="text-xs text-muted-foreground">Submitted: {formatTimestamp(profile.fmcsaClearinghouse.submittedAt)}</p>
                  )}
                </div>

                <Button variant="outline" size="sm" onClick={() => setShowResetDialog(true)} className="text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30">
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Change Designation
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end pb-6">
        <Button onClick={handleSave} disabled={saving || !hasChanges || !isOnline} size="lg">
          {saving ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>) : (<><Save className="h-4 w-4 mr-2" />Save Profile</>)}
        </Button>
      </div>

      {/* Reset Clearinghouse Confirmation Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Clearinghouse Designation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reset your FMCSA Clearinghouse designation status. You will need to re-submit your designation through the onboarding flow. Driver matching may be limited until the designation is confirmed again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetClearinghouse} disabled={resetting} className="bg-amber-600 hover:bg-amber-700">
              {resetting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Resetting...</> : 'Yes, Reset Designation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
