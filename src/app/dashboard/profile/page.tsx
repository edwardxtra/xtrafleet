'use client';

import { useEffect, useState } from 'react';
import { useUser, useFirestore, useStorage } from '@/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { US_STATES } from '@/lib/us-states';
import { validateFile } from '@/lib/file-validation';
import { Loader2, Building2, MapPin, FileText, Shield, Check, X, Upload, ExternalLink } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast-utils';

interface OwnerProfile {
  legalName?: string;
  companyName?: string;
  contactEmail?: string;
  phone?: string;
  dotNumber?: string;
  mcNumber?: string;
  hqAddress?: string;
  operatingStates?: string[];
  coi?: {
    fileUrl?: string;
    fileName?: string;
    insurerName?: string;
    policyNumber?: string;
    expiryDate?: string;
    updatedAt?: string;
  };
  onboardingStatus?: {
    profileComplete?: boolean;
    complianceAttested?: boolean;
    fmcsaDesignated?: boolean | string;
    completedAt?: string;
  };
  complianceAttestations?: Record<string, { accepted: boolean; acceptedAt: string }>;
  fmcsaClearinghouse?: {
    alreadyDesignated?: boolean;
    submittedAt?: string;
  };
}

export default function ProfilePage() {
  const { user } = useUser();
  const db = useFirestore();
  const storage = useStorage();
  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [phone, setPhone] = useState('');
  const [hqAddress, setHqAddress] = useState('');

  useEffect(() => {
    async function loadProfile() {
      if (!user || !db) return;
      try {
        const ownerDoc = await getDoc(doc(db, 'owner_operators', user.uid));
        if (ownerDoc.exists()) {
          const data = ownerDoc.data() as OwnerProfile;
          setProfile(data);
          setPhone(data.phone || '');
          setHqAddress(data.hqAddress || '');
        }
      } catch (error) {
        console.error('Failed to load profile:', error);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [user, db]);

  const handleSave = async () => {
    if (!user || !db) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'owner_operators', user.uid), {
        phone,
        hqAddress,
      });
      setProfile(prev => prev ? { ...prev, phone, hqAddress } : prev);
      setEditMode(false);
      showSuccess('Profile updated!');
    } catch (error) {
      console.error('Failed to save:', error);
      showError('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleCoiUpload = async (file: File) => {
    if (!user || !storage || !db) return;
    const validation = validateFile(file);
    if (!validation.valid) {
      showError(validation.error || 'Invalid file');
      return;
    }

    try {
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `documents/${user.uid}/coi/${timestamp}_${sanitizedName}`;
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed', null, (error) => {
        showError('Upload failed.');
      }, async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        await updateDoc(doc(db, 'owner_operators', user.uid), {
          'coi.fileUrl': url,
          'coi.fileName': file.name,
          'coi.uploadedAt': new Date().toISOString(),
          'coi.updatedAt': new Date().toISOString(),
        });
        setProfile(prev => prev ? {
          ...prev,
          coi: { ...prev.coi, fileUrl: url, fileName: file.name }
        } : prev);
        showSuccess('COI uploaded!');
      });
    } catch (error) {
      showError('Upload failed.');
    }
  };

  if (loading) {
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
      <div>
        <h1 className="text-2xl font-bold">Company Profile</h1>
        <p className="text-muted-foreground">View and manage your company information, insurance, and compliance status.</p>
      </div>

      {/* Company Info */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Company Information</CardTitle>
            <CardDescription>Your business details on XtraFleet</CardDescription>
          </div>
          {!editMode && (
            <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>Edit</Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Legal Name</Label>
              <p className="text-sm font-medium">{profile.legalName || profile.companyName || '—'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Email</Label>
              <p className="text-sm font-medium">{profile.contactEmail || user?.email || '—'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Phone</Label>
              {editMode ? (
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" />
              ) : (
                <p className="text-sm font-medium">{profile.phone || '—'}</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">HQ Address</Label>
              {editMode ? (
                <Input value={hqAddress} onChange={e => setHqAddress(e.target.value)} placeholder="123 Main St" />
              ) : (
                <p className="text-sm font-medium">{profile.hqAddress || '—'}</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">DOT #</Label>
              <p className="text-sm font-medium">{profile.dotNumber || '—'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">MC #</Label>
              <p className="text-sm font-medium">{profile.mcNumber || '—'}</p>
            </div>
          </div>

          {editMode && (
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Save
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Operating States */}
      {profile.operatingStates && profile.operatingStates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /> Operating States</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {profile.operatingStates.map(code => {
                const state = US_STATES.find(s => s.value === code);
                return <Badge key={code} variant="secondary">{state?.label || code}</Badge>;
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* COI */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Certificate of Insurance</CardTitle>
          <CardDescription>Your current insurance information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {profile.coi?.fileUrl ? (
            <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm">{profile.coi.fileName || 'COI Document'}</span>
                <Check className="h-4 w-4 text-green-600" />
              </div>
              <a href={profile.coi.fileUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="sm"><ExternalLink className="h-4 w-4" /></Button>
              </a>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No COI document uploaded.</div>
          )}
          {(profile.coi?.insurerName || profile.coi?.policyNumber) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Insurer</Label>
                <p className="text-sm">{profile.coi?.insurerName || '—'}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Policy #</Label>
                <p className="text-sm">{profile.coi?.policyNumber || '—'}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Expires</Label>
                <p className="text-sm">{profile.coi?.expiryDate || '—'}</p>
              </div>
            </div>
          )}
          <div>
            <Label htmlFor="coi-reupload" className="cursor-pointer">
              <Button variant="outline" size="sm" asChild>
                <span><Upload className="h-4 w-4 mr-1" /> Upload New COI</span>
              </Button>
            </Label>
            <input
              id="coi-reupload"
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCoiUpload(file);
                e.target.value = '';
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Compliance Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Compliance Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Profile Complete</span>
            {profile.onboardingStatus?.profileComplete
              ? <Badge variant="default" className="bg-green-600">Complete</Badge>
              : <Badge variant="secondary">Incomplete</Badge>
            }
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm">Compliance Attestations</span>
            {profile.onboardingStatus?.complianceAttested
              ? <Badge variant="default" className="bg-green-600">Attested</Badge>
              : <Badge variant="secondary">Pending</Badge>
            }
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm">FMCSA Clearinghouse</span>
            {profile.onboardingStatus?.fmcsaDesignated === true
              ? <Badge variant="default" className="bg-green-600">Designated</Badge>
              : profile.onboardingStatus?.fmcsaDesignated === 'pending'
              ? <Badge variant="outline" className="text-amber-600 border-amber-600">Pending</Badge>
              : profile.onboardingStatus?.fmcsaDesignated === 'skipped'
              ? <Badge variant="secondary">Skipped</Badge>
              : <Badge variant="secondary">Not Started</Badge>
            }
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
