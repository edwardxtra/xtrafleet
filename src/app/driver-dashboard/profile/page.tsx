'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Edit, X, Save, WifiOff, XCircle } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast-utils';
import { parseError } from '@/lib/error-utils';

interface Driver {
  id: string;
  name: string;
  email: string;
  location: string;
  vehicleType: string;
  availability: string;
}

export default function DriverProfile() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedDriver, setEditedDriver] = useState<Driver | null>(null);
  const [saving, setSaving] = useState(false);
  const [ownerId, setOwnerId] = useState<string>('');
  const [isOnline, setIsOnline] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    async function loadDriverData() {
      if (!user || !db) return;

      try {
        setLoadError(null);
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) {
          throw new Error('User not found');
        }

        const userData = userDoc.data();
        if (userData.role !== 'driver') {
          router.push('/dashboard');
          return;
        }

        const ownerOperatorId = userData.ownerId;
        setOwnerId(ownerOperatorId);

        const driverDoc = await getDoc(doc(db, 'owner_operators', ownerOperatorId, 'drivers', user.uid));
        if (driverDoc.exists()) {
          const driverData = { id: driverDoc.id, ...driverDoc.data() } as Driver;
          setDriver(driverData);
          setEditedDriver(driverData);
        } else {
          setLoadError('Driver profile not found. Please contact your administrator.');
        }
      } catch (error) {
        console.error('Error loading driver data:', error);
        const appError = parseError(error);
        setLoadError(appError.message);
        showError(appError.message, 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    }

    if (user && db) {
      loadDriverData();
    }
  }, [user, db, router]);

  const handleEdit = () => {
    setIsEditing(true);
    setEditedDriver(driver);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedDriver(driver);
  };

  const handleSave = async () => {
    if (!editedDriver || !db || !ownerId || !user) return;

    if (!isOnline) {
      showError('You\'re offline. Please check your connection and try again.');
      return;
    }

    // Validate required fields
    if (!editedDriver.name?.trim()) {
      showError('Please enter your full name.');
      return;
    }
    if (!editedDriver.email?.trim()) {
      showError('Please enter your email address.');
      return;
    }

    setSaving(true);
    try {
      const driverRef = doc(db, 'owner_operators', ownerId, 'drivers', user.uid);
      await updateDoc(driverRef, {
        name: editedDriver.name,
        email: editedDriver.email,
        location: editedDriver.location,
        vehicleType: editedDriver.vehicleType,
        updatedAt: new Date().toISOString(),
      });

      setDriver(editedDriver);
      setIsEditing(false);
      showSuccess('Profile updated successfully!');
    } catch (error) {
      console.error('Error saving driver data:', error);
      const appError = parseError(error);
      showError(appError.message, 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof Driver, value: string) => {
    if (editedDriver) {
      setEditedDriver({ ...editedDriver, [field]: value });
    }
  };

  // Loading skeleton
  if (isUserLoading || loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-5 w-64" />
        </div>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-6 w-full" />
              </div>
              <div>
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-6 w-full" />
              </div>
              <div>
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-6 w-full" />
              </div>
              <div>
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-6 w-full" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (loadError && !driver) {
    return (
      <div className="max-w-4xl mx-auto">
        <Alert variant="destructive" className="mb-6">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
        <Button onClick={() => window.location.reload()}>
          Try Again
        </Button>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Driver profile not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Offline Banner */}
      {!isOnline && (
        <Alert variant="destructive" className="mb-4">
          <WifiOff className="h-4 w-4" />
          <AlertDescription>
            You're currently offline. Some features may not work until you're back online.
          </AlertDescription>
        </Alert>
      )}

      {/* Profile Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">My Profile</h2>
        <p className="text-gray-600">Manage your personal information</p>
      </div>

      {/* Profile Information Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Profile Information</CardTitle>
            {!isEditing && (
              <Button onClick={handleEdit} variant="outline" size="sm" disabled={!isOnline}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Profile
              </Button>
            )}
            {isEditing && (
              <div className="flex gap-2">
                <Button onClick={handleCancel} variant="outline" size="sm" disabled={saving}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button onClick={handleSave} size="sm" disabled={saving || !isOnline}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Changes
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isEditing && editedDriver ? (
            <>
              <div>
                <Label htmlFor="name">Full Name <span className="text-red-500">*</span></Label>
                <Input
                  id="name"
                  value={editedDriver.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="Enter your full name"
                  className={!editedDriver.name?.trim() ? 'border-red-300' : ''}
                />
                {!editedDriver.name?.trim() && (
                  <p className="text-sm text-red-500 mt-1">Full name is required</p>
                )}
              </div>
              <div>
                <Label htmlFor="email">Email Address <span className="text-red-500">*</span></Label>
                <Input
                  id="email"
                  type="email"
                  value={editedDriver.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="your.email@example.com"
                  className={!editedDriver.email?.trim() ? 'border-red-300' : ''}
                />
                {!editedDriver.email?.trim() && (
                  <p className="text-sm text-red-500 mt-1">Email is required</p>
                )}
              </div>
              <div>
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={editedDriver.location}
                  onChange={(e) => handleInputChange('location', e.target.value)}
                  placeholder="City, State"
                />
              </div>
              <div>
                <Label htmlFor="vehicleType">Vehicle Type</Label>
                <Input
                  id="vehicleType"
                  value={editedDriver.vehicleType}
                  onChange={(e) => handleInputChange('vehicleType', e.target.value)}
                  placeholder="e.g., Reefer, Dry Van, Flatbed"
                />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Full Name</p>
                  <p className="font-medium text-lg">{driver.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Email Address</p>
                  <p className="font-medium text-lg">{driver.email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Location</p>
                  <p className="font-medium text-lg">{driver.location || 'Not specified'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Vehicle Type</p>
                  <p className="font-medium text-lg">{driver.vehicleType || 'Not specified'}</p>
                </div>
              </div>
              
              <div className="border-t pt-6">
                <p className="text-sm text-gray-600 mb-2">Status</p>
                <Badge variant={driver.availability === 'Available' ? 'default' : 'secondary'} className="text-sm">
                  {driver.availability}
                </Badge>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}