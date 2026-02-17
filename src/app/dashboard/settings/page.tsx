'use client';

import { useEffect, useState } from 'react';
import { useUser, useFirestore, useAuth } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, Eye, EyeOff, WifiOff, Lock, CreditCard, Crown, Clock, AlertCircle, ExternalLink } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast-utils';
import { parseError } from '@/lib/error-utils';
import { useSubscription } from '@/hooks/use-subscription';
import { format, parseISO } from 'date-fns';

export default function SettingsPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const auth = useAuth();
  const { subscription, isLoading: subLoading } = useSubscription();

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

  // Billing state
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  // Network state
  const [isOnline, setIsOnline] = useState(true);

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

  // Validate password form
  const validatePasswordForm = (): boolean => {
    const errors: typeof passwordErrors = {};
    if (!currentPassword) errors.currentPassword = 'Current password is required';
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
      const credential = EmailAuthProvider.credential(user.email!, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
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

  // Manage billing portal
  const handleManageBilling = async () => {
    if (!user) return;
    setIsOpeningPortal(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/stripe/customer-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to open billing portal');
      const { url } = await response.json();
      window.location.href = url;
    } catch (error: any) {
      console.error('Error opening portal:', error);
      showError('Failed to open billing portal');
    } finally {
      setIsOpeningPortal(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    try { return format(parseISO(dateString), 'MMM d, yyyy'); } catch { return dateString; }
  };

  const getPlanDisplayName = (planType: string | null) => {
    if (!planType) return 'No Plan';
    const planNames: Record<string, string> = {
      monthly: 'Monthly', 'Monthly Plan': 'Monthly',
      six_month: '6-Month', '6-Month Plan': '6-Month',
      annual: 'Annual', 'Yearly Plan': 'Annual',
    };
    return planNames[planType] || planType;
  };

  const getStatusBadge = () => {
    if (subscription.isInTrial) return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">Free Trial</Badge>;
    if (subscription.subscriptionStatus === 'active') return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">Active</Badge>;
    if (subscription.isPastDue) return <Badge variant="destructive">Past Due</Badge>;
    if (subscription.isCanceled) return <Badge variant="secondary">Canceled</Badge>;
    return <Badge variant="secondary">No Subscription</Badge>;
  };

  if (isUserLoading || subLoading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div><Skeleton className="h-8 w-48 mb-2" /><Skeleton className="h-4 w-64" /></div>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Offline Banner */}
      {!isOnline && (
        <Alert variant="destructive">
          <WifiOff className="h-4 w-4" />
          <AlertDescription>You&apos;re currently offline. Changes cannot be saved.</AlertDescription>
        </Alert>
      )}

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and billing</p>
      </div>

      {/* Account Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>Account</CardTitle>
              <CardDescription>Your login credentials</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email Display */}
          <div>
            <Label className="text-xs text-muted-foreground">Email Address</Label>
            <p className="text-sm font-medium mt-1">{user?.email || '—'}</p>
            <p className="text-xs text-muted-foreground mt-1">Contact support to change your email address.</p>
          </div>

          <Separator />

          {/* Password Change */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Change Password</h3>
            <div>
              <Label htmlFor="currentPassword">Current Password</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); setPasswordErrors({ ...passwordErrors, currentPassword: undefined }); }}
                  placeholder="Enter current password"
                  disabled={!isOnline}
                  className={passwordErrors.currentPassword ? 'border-red-500' : ''}
                />
                <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowCurrentPassword(!showCurrentPassword)}>
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {passwordErrors.currentPassword && <p className="text-sm text-red-500 mt-1">{passwordErrors.currentPassword}</p>}
            </div>

            <div>
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPasswordErrors({ ...passwordErrors, newPassword: undefined }); }}
                  placeholder="Enter new password"
                  disabled={!isOnline}
                  className={passwordErrors.newPassword ? 'border-red-500' : ''}
                />
                <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowNewPassword(!showNewPassword)}>
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {passwordErrors.newPassword && <p className="text-sm text-red-500 mt-1">{passwordErrors.newPassword}</p>}
              <p className="text-xs text-muted-foreground mt-1">Must be at least 6 characters</p>
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPasswordErrors({ ...passwordErrors, confirmPassword: undefined }); }}
                  placeholder="Confirm new password"
                  disabled={!isOnline}
                  className={passwordErrors.confirmPassword ? 'border-red-500' : ''}
                />
                <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {passwordErrors.confirmPassword && <p className="text-sm text-red-500 mt-1">{passwordErrors.confirmPassword}</p>}
            </div>

            <div className="pt-2">
              <Button onClick={handleChangePassword} disabled={savingPassword || !isOnline || (!currentPassword && !newPassword && !confirmPassword)}>
                {savingPassword ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Changing Password...</>) : 'Change Password'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Billing Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>Billing</CardTitle>
              <CardDescription>Your subscription and payment information</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Past Due Warning */}
          {subscription.isPastDue && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Payment failed.</strong> Please update your payment method to avoid service interruption.
              </AlertDescription>
            </Alert>
          )}

          {/* Trial Warning */}
          {subscription.isInTrial && subscription.daysUntilTrialEnd !== null && subscription.daysUntilTrialEnd <= 7 && (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                Your trial ends in <strong>{subscription.daysUntilTrialEnd} days</strong> ({formatDate(subscription.trialEndsAt)}).
              </AlertDescription>
            </Alert>
          )}

          {/* Subscription Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Plan</Label>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm font-medium">{getPlanDisplayName(subscription.planType)}</p>
                {getStatusBadge()}
              </div>
            </div>
            {subscription.isInTrial && subscription.trialEndsAt && (
              <div>
                <Label className="text-xs text-muted-foreground">Trial Ends</Label>
                <p className="text-sm font-medium mt-1">{formatDate(subscription.trialEndsAt)}</p>
              </div>
            )}
            {!subscription.isInTrial && subscription.subscriptionPeriodEnd && (
              <div>
                <Label className="text-xs text-muted-foreground">Next Billing Date</Label>
                <p className="text-sm font-medium mt-1">{formatDate(subscription.subscriptionPeriodEnd)}</p>
              </div>
            )}
          </div>

          <Separator />

          {/* Manage Billing Button */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Payment Method & Invoices</p>
              <p className="text-xs text-muted-foreground">Update your card, view invoices, or change your plan</p>
            </div>
            <Button variant="outline" onClick={handleManageBilling} disabled={isOpeningPortal || !subscription.stripeCustomerId}>
              {isOpeningPortal ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}
              Manage Billing
            </Button>
          </div>

          {!subscription.hasActiveSubscription && !subscription.isCanceled && (
            <>
              <Separator />
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-3">No active subscription.</p>
                <Button asChild>
                  <a href="/dashboard/billing">View Plans & Subscribe</a>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
