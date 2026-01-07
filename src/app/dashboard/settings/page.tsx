'use client';

import { useEffect, useState } from 'react';
import { useUser, useFirestore, useAuth } from '@/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, Eye, EyeOff, WifiOff, Building2, Lock } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast-utils';
import { parseError } from '@/lib/error-utils';

interface CompanyProfile {
  companyName?: string;
  contactEmail?: string;
  phone?: string;
  dotNumber?: string;
  mcNumber?: string;
  legalName?: string;
  dba?: string;
  ein?: string;
  hqAddress?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export default function SettingsPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const auth = useAuth();
  
  // Company profile state
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [editedProfile, setEditedProfile] = useState<CompanyProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  
  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});
  
  // Network state
  const [isOnline, setIsOnline] = useState(true);

  // Network status detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showSuccess('You\'re back online!');
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load company profile
  useEffect(() => {
    async function loadProfile() {
      if (!user || !db) return;

      try {
        const profileDoc = await getDoc(doc(db, 'owner_operators', user.uid));
        if (profileDoc.exists()) {
          const data = profileDoc.data() as CompanyProfile;
          setProfile(data);
          setEditedProfile(data);
        } else {
          // Initialize empty profile if none exists
          const emptyProfile: CompanyProfile = {
            legalName: '',
            dba: '',
            contactEmail: user.email || '',
            phone: '',
            dotNumber: '',
            mcNumber: '',
            ein: '',
            hqAddress: '',
          };
          setProfile(emptyProfile);
          setEditedProfile(emptyProfile);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
        showError('Failed to load profile settings');
      } finally {
        setLoadingProfile(false);
      }
    }

    if (user && db) {
      loadProfile();
    }
  }, [user, db]);

  // Handle profile input change
  const handleProfileChange = (field: keyof CompanyProfile, value: string) => {
    if (editedProfile) {
      setEditedProfile({ ...editedProfile, [field]: value });
    }
  };

  // Save company profile
  const handleSaveProfile = async () => {
    if (!editedProfile || !db || !user) return;

    if (!isOnline) {
      showError('You\'re offline. Please check your connection.');
      return;
    }

    setSavingProfile(true);
    try {
      const profileRef = doc(db, 'owner_operators', user.uid);
      await updateDoc(profileRef, {
        legalName: editedProfile.legalName || '',
        dba: editedProfile.dba || '',
        contactEmail: editedProfile.contactEmail || '',
        phone: editedProfile.phone || '',
        dotNumber: editedProfile.dotNumber || '',
        mcNumber: editedProfile.mcNumber || '',
        ein: editedProfile.ein || '',
        hqAddress: editedProfile.hqAddress || '',
        updatedAt: new Date().toISOString(),
      });

      setProfile(editedProfile);
      showSuccess('Company profile updated successfully!');
    } catch (error) {
      console.error('Error saving profile:', error);
      const appError = parseError(error);
      showError(appError.message, 'Failed to save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  // Validate password form
  const validatePasswordForm = (): boolean => {
    const errors: typeof passwordErrors = {};

    if (!currentPassword) {
      errors.currentPassword = 'Current password is required';
    }

    if (!newPassword) {
      errors.newPassword = 'New password is required';
    } else if (newPassword.length < 6) {
      errors.newPassword = 'Password must be at least 6 characters';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your new password';
    } else if (newPassword !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setPasswordErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle password change
  const handleChangePassword = async () => {
    if (!validatePasswordForm()) return;
    if (!user || !auth.currentUser) return;

    if (!isOnline) {
      showError('You\'re offline. Please check your connection.');
      return;
    }

    setSavingPassword(true);
    try {
      // Re-authenticate user
      const credential = EmailAuthProvider.credential(
        user.email!,
        currentPassword
      );
      await reauthenticateWithCredential(auth.currentUser, credential);

      // Update password
      await updatePassword(auth.currentUser, newPassword);

      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordErrors({});

      showSuccess('Password changed successfully!');
    } catch (error: unknown) {
      console.error('Error changing password:', error);
      const errorCode = (error as { code?: string })?.code;
      
      if (errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-credential') {
        setPasswordErrors({ currentPassword: 'Current password is incorrect' });
        showError('Current password is incorrect');
      } else if (errorCode === 'auth/weak-password') {
        setPasswordErrors({ newPassword: 'Password is too weak. Please choose a stronger password.' });
        showError('Password is too weak');
      } else if (errorCode === 'auth/requires-recent-login') {
        showError('Please log out and log back in, then try again.');
      } else {
        const appError = parseError(error);
        showError(appError.message, 'Failed to change password');
      }
    } finally {
      setSavingPassword(false);
    }
  };

  // Check if profile has changes
  const hasProfileChanges = JSON.stringify(profile) !== JSON.stringify(editedProfile);

  // Loading skeleton
  if (isUserLoading || loadingProfile) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Offline Banner */}
      {!isOnline && (
        <Alert variant="destructive">
          <WifiOff className="h-4 w-4" />
          <AlertDescription>
            You&apos;re currently offline. Changes cannot be saved.
          </AlertDescription>
        </Alert>
      )}

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and company settings</p>
      </div>

      {/* Company Profile Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>Company Profile</CardTitle>
              <CardDescription>Update your company information</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {editedProfile ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="legalName">Legal Name</Label>
                  <Input
                    id="legalName"
                    value={editedProfile.legalName || ''}
                    onChange={(e) => handleProfileChange('legalName', e.target.value)}
                    placeholder="Your Company LLC"
                    disabled={!isOnline}
                  />
                </div>
                <div>
                  <Label htmlFor="dba">DBA (Doing Business As)</Label>
                  <Input
                    id="dba"
                    value={editedProfile.dba || ''}
                    onChange={(e) => handleProfileChange('dba', e.target.value)}
                    placeholder="Trade name"
                    disabled={!isOnline}
                  />
                </div>
                <div>
                  <Label htmlFor="contactEmail">Contact Email</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    value={editedProfile.contactEmail || ''}
                    onChange={(e) => handleProfileChange('contactEmail', e.target.value)}
                    placeholder="contact@company.com"
                    disabled={!isOnline}
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={editedProfile.phone || ''}
                    onChange={(e) => handleProfileChange('phone', e.target.value)}
                    placeholder="(555) 123-4567"
                    disabled={!isOnline}
                  />
                </div>
                <div>
                  <Label htmlFor="dotNumber">DOT Number</Label>
                  <Input
                    id="dotNumber"
                    value={editedProfile.dotNumber || ''}
                    onChange={(e) => handleProfileChange('dotNumber', e.target.value)}
                    placeholder="1234567"
                    disabled={!isOnline}
                  />
                </div>
                <div>
                  <Label htmlFor="mcNumber">MC Number</Label>
                  <Input
                    id="mcNumber"
                    value={editedProfile.mcNumber || ''}
                    onChange={(e) => handleProfileChange('mcNumber', e.target.value)}
                    placeholder="MC-123456"
                    disabled={!isOnline}
                  />
                </div>
                <div>
                  <Label htmlFor="ein">EIN</Label>
                  <Input
                    id="ein"
                    value={editedProfile.ein || ''}
                    onChange={(e) => handleProfileChange('ein', e.target.value)}
                    placeholder="XX-XXXXXXX"
                    disabled={!isOnline}
                  />
                </div>
                <div>
                  <Label htmlFor="hqAddress">Headquarters Address</Label>
                  <Input
                    id="hqAddress"
                    value={editedProfile.hqAddress || ''}
                    onChange={(e) => handleProfileChange('hqAddress', e.target.value)}
                    placeholder="123 Main St, City, State ZIP"
                    disabled={!isOnline}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button 
                  onClick={handleSaveProfile} 
                  disabled={savingProfile || !hasProfileChanges || !isOnline}
                >
                  {savingProfile ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">No company profile found. Please complete your profile setup.</p>
          )}
        </CardContent>
      </Card>

      {/* Password Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md space-y-4">
            <div>
              <Label htmlFor="currentPassword">Current Password</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    setPasswordErrors({ ...passwordErrors, currentPassword: undefined });
                  }}
                  placeholder="Enter current password"
                  disabled={!isOnline}
                  className={passwordErrors.currentPassword ? 'border-red-500' : ''}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {passwordErrors.currentPassword && (
                <p className="text-sm text-red-500 mt-1">{passwordErrors.currentPassword}</p>
              )}
            </div>

            <div>
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setPasswordErrors({ ...passwordErrors, newPassword: undefined });
                  }}
                  placeholder="Enter new password"
                  disabled={!isOnline}
                  className={passwordErrors.newPassword ? 'border-red-500' : ''}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {passwordErrors.newPassword && (
                <p className="text-sm text-red-500 mt-1">{passwordErrors.newPassword}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">Must be at least 6 characters</p>
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setPasswordErrors({ ...passwordErrors, confirmPassword: undefined });
                  }}
                  placeholder="Confirm new password"
                  disabled={!isOnline}
                  className={passwordErrors.confirmPassword ? 'border-red-500' : ''}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {passwordErrors.confirmPassword && (
                <p className="text-sm text-red-500 mt-1">{passwordErrors.confirmPassword}</p>
              )}
            </div>

            <div className="pt-2">
              <Button 
                onClick={handleChangePassword} 
                disabled={savingPassword || !isOnline || (!currentPassword && !newPassword && !confirmPassword)}
              >
                {savingPassword ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Changing Password...
                  </>
                ) : (
                  'Change Password'
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}