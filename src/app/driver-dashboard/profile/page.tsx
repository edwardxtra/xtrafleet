'use client';

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useStorage } from '@/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Loader2, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Edit, 
  X, 
  Save, 
  Upload,
  WifiOff,
  User,
  Mail,
  MapPin,
  Truck
} from 'lucide-react';
import { getComplianceStatusFromItems, type ComplianceItem } from '@/lib/compliance';
import { format, differenceInDays, parseISO } from 'date-fns';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { showSuccess, showError, showWarning } from '@/lib/toast-utils';
import { parseError } from '@/lib/error-utils';
import { ProfileCompletionBanner } from '@/components/profile-completion-banner';
import { TRAILER_TYPES } from '@/lib/trailer-types';
import { MultiSelect, type Option } from '@/components/ui/multi-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Driver {
  id: string;
  name: string;
  email: string;
  location: string;
  vehicleType?: string;
  vehicleTypes?: string[];
  availability: string;
  cdlLicense?: string;
  cdlExpiry?: string;
  cdlLicenseUrl?: string;
  cdlDocumentUrl?: string;
  medicalCardExpiry?: string;
  medicalCardUrl?: string;
  insuranceExpiry?: string;
  insuranceUrl?: string;
  motorVehicleRecordNumber?: string;
  mvrUrl?: string;
  backgroundCheckDate?: string;
  backgroundCheckUrl?: string;
  preEmploymentScreeningDate?: string;
  preEmploymentScreeningUrl?: string;
  drugAndAlcoholScreeningDate?: string;
  drugAndAlcoholScreeningUrl?: string;
}

export default function DriverProfile() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const storage = useStorage();
  const router = useRouter();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedDriver, setEditedDriver] = useState<Driver | null>(null);
  const [saving, setSaving] = useState(false);
  const [ownerId, setOwnerId] = useState<string>('');
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
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
      showWarning('You\'re offline. Some features may not work.');
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
          
          // Migrate legacy vehicleType to vehicleTypes array
          if (driverData.vehicleType && !driverData.vehicleTypes) {
            driverData.vehicleTypes = [driverData.vehicleType];
          }
          
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

    setSaving(true);
    try {
      const driverRef = doc(db, 'owner_operators', ownerId, 'drivers', user.uid);
      
      // Build update object - only include fields that have values
      const updateData: any = {
        updatedAt: new Date().toISOString(),
      };
      
      // Basic fields - allow empty strings
      if (editedDriver.name !== undefined) updateData.name = editedDriver.name;
      if (editedDriver.location !== undefined) updateData.location = editedDriver.location;
      if (editedDriver.availability !== undefined) updateData.availability = editedDriver.availability;
      
      // Vehicle types - multi-select array
      if (editedDriver.vehicleTypes && editedDriver.vehicleTypes.length > 0) {
        updateData.vehicleTypes = editedDriver.vehicleTypes;
        // Keep vehicleType for backward compatibility (first selected type)
        updateData.vehicleType = editedDriver.vehicleTypes[0];
      }
      
      // Optional fields - only add if they have values
      if (editedDriver.cdlLicense) updateData.cdlLicense = editedDriver.cdlLicense;
      if (editedDriver.cdlExpiry) updateData.cdlExpiry = editedDriver.cdlExpiry;
      if (editedDriver.medicalCardExpiry) updateData.medicalCardExpiry = editedDriver.medicalCardExpiry;
      if (editedDriver.insuranceExpiry) updateData.insuranceExpiry = editedDriver.insuranceExpiry;
      if (editedDriver.motorVehicleRecordNumber) updateData.motorVehicleRecordNumber = editedDriver.motorVehicleRecordNumber;
      if (editedDriver.backgroundCheckDate) updateData.backgroundCheckDate = editedDriver.backgroundCheckDate;
      if (editedDriver.preEmploymentScreeningDate) updateData.preEmploymentScreeningDate = editedDriver.preEmploymentScreeningDate;
      if (editedDriver.drugAndAlcoholScreeningDate) updateData.drugAndAlcoholScreeningDate = editedDriver.drugAndAlcoholScreeningDate;

      await updateDoc(driverRef, updateData);

      setDriver(editedDriver);
      setIsEditing(false);
      showSuccess('Your profile has been updated successfully.');
    } catch (error) {
      console.error('Error saving driver data:', error);
      const appError = parseError(error);
      showError(appError.message, 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof Driver, value: string) => {
    if (editedDriver) {
      setEditedDriver({ ...editedDriver, [field]: value });
    }
  };

  const handleVehicleTypesChange = (selected: string[]) => {
    if (editedDriver) {
      setEditedDriver({ ...editedDriver, vehicleTypes: selected });
    }
  };

  const handleFileUpload = async (docType: string, fieldName: keyof Driver) => {
    if (!isOnline) {
      showError('You\'re offline. Please check your connection and try again.');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
  
      if (file.size > 10 * 1024 * 1024) {
        showError('File size must be less than 10MB. Please choose a smaller file.');
        return;
      }

      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(file.type)) {
        showError('Please upload a PDF, JPG, or PNG file.');
        return;
      }

      setUploadingDoc(docType);
      
      try {
        if (!user || !ownerId || !db || !storage) {
          throw new Error('Missing required data');
        }
        
        const fileExtension = file.name.split('.').pop();
        const fileName = `${docType.toLowerCase().replace(/\s+/g, '-')}.${fileExtension}`;
        const storagePath = `driver-documents/${ownerId}/${user.uid}/${fileName}`;
        
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, file);
        
        const downloadURL = await getDownloadURL(storageRef);
        
        const driverRef = doc(db, 'owner_operators', ownerId, 'drivers', user.uid);
        await updateDoc(driverRef, {
          [fieldName]: downloadURL,
          updatedAt: new Date().toISOString(),
        });
        
        if (editedDriver) {
          setEditedDriver({ ...editedDriver, [fieldName]: downloadURL });
        }
        if (driver) {
          setDriver({ ...driver, [fieldName]: downloadURL });
        }
        
        showSuccess(`${docType} uploaded successfully!`);
        
      } catch (error) {
        console.error('Upload error:', error);
        const appError = parseError(error);
        showError(appError.message, `Failed to upload ${docType}`);
      } finally {
        setUploadingDoc(null);
      }
    };
    
    input.click();
  };

  if (isUserLoading || loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <Skeleton className="h-40 w-full mb-6" />
        <Skeleton className="h-64 w-full mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (loadError && !driver) {
    return (
      <div className="max-w-6xl mx-auto">
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

  const complianceItems: ComplianceItem[] = [
    { label: 'CDL Expiry', value: driver.cdlExpiry, type: 'expiry' },
    { label: 'CDL License Number', value: driver.cdlLicense, type: 'field' },
    { label: 'Medical Card Expiry', value: driver.medicalCardExpiry, type: 'expiry' },
    { label: 'Insurance Expiry', value: driver.insuranceExpiry, type: 'expiry' },
    { label: 'Motor Vehicle Record Number', value: driver.motorVehicleRecordNumber, type: 'field' },
    { label: 'Background Check', value: driver.backgroundCheckDate, type: 'screening' },
    { label: 'Pre-Employment Screening', value: driver.preEmploymentScreeningDate, type: 'field' },
    { label: 'Drug & Alcohol Screening', value: driver.drugAndAlcoholScreeningDate, type: 'screening' },
  ];

  const complianceStatus = getComplianceStatusFromItems(complianceItems);

  const getStatusIcon = (status: 'Green' | 'Yellow' | 'Red') => {
    if (status === 'Green') return <CheckCircle className="h-5 w-5 text-green-600" />;
    if (status === 'Yellow') return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
    return <XCircle className="h-5 w-5 text-red-600" />;
  };

  const getStatusColor = (status: 'Green' | 'Yellow' | 'Red') => {
    if (status === 'Green') return 'bg-green-50 border-green-200';
    if (status === 'Yellow') return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  const getItemStatus = (item: ComplianceItem): 'Green' | 'Yellow' | 'Red' => {
    if (!item.value) return 'Red';

    if (item.type === 'expiry') {
      try {
        const expiryDate = parseISO(item.value);
        const daysUntilExpiry = differenceInDays(expiryDate, new Date());
        if (daysUntilExpiry < 0) return 'Red';
        if (daysUntilExpiry <= 30) return 'Yellow';
        return 'Green';
      } catch {
        return 'Red';
      }
    }

    if (item.type === 'screening') {
      try {
        const screeningDate = parseISO(item.value);
        const validUntil = new Date(screeningDate);
        validUntil.setFullYear(validUntil.getFullYear() + 1);
        const daysUntilExpiry = differenceInDays(validUntil, new Date());
        if (daysUntilExpiry < 0) return 'Red';
        if (daysUntilExpiry <= 30) return 'Yellow';
        return 'Green';
      } catch {
        return 'Red';
      }
    }

    return 'Green';
  };

  // Get vehicle types for display  
  const displayVehicleTypes = () => {
    const types = driver.vehicleTypes || (driver.vehicleType ? [driver.vehicleType] : []);
    if (types.length === 0) return 'Not specified';
    
    return types.map(typeValue => {
      const typeLabel = TRAILER_TYPES.find(t => t.value === typeValue)?.label;
      return typeLabel || typeValue;
    }).join(', ');
  };

  // Convert TRAILER_TYPES to MultiSelect options format
  const vehicleTypeOptions: Option[] = TRAILER_TYPES.map(type => ({
    label: type.label,
    value: type.value
  }));

  return (
    <div className="max-w-6xl mx-auto">
      {!isOnline && (
        <Alert variant="destructive" className="mb-4">
          <WifiOff className="h-4 w-4" />
          <AlertDescription>
            You're currently offline. Some features may not work until you're back online.
          </AlertDescription>
        </Alert>
      )}

      {user?.uid && (
        <ProfileCompletionBanner 
          driver={driver} 
          driverId={user.uid}
          onEditClick={handleEdit}
        />
      )}

      {/* Profile Information Card */}
      <Card className="mb-6" data-document-section>
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
        <CardContent>
          {isEditing && editedDriver ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={editedDriver.name || ''}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  value={editedDriver.email || ''}
                  disabled
                  className="bg-gray-50"
                />
                <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
              </div>
              <div>
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={editedDriver.location || ''}
                  onChange={(e) => handleInputChange('location', e.target.value)}
                  placeholder="City, State"
                />
              </div>
              <div>
                <Label htmlFor="vehicleTypes">Trailer/Vehicle Types</Label>
                <MultiSelect
                  options={vehicleTypeOptions}
                  selected={editedDriver.vehicleTypes || []}
                  onChange={handleVehicleTypesChange}
                  placeholder="Select vehicle types..."
                />
                <p className="text-xs text-muted-foreground mt-1">Select all types you operate</p>
              </div>
              <div>
                <Label htmlFor="availability">Status</Label>
                <Select
                  value={editedDriver.availability || ''}
                  onValueChange={(value) => handleInputChange('availability', value)}
                >
                  <SelectTrigger id="availability">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Available">Available</SelectItem>
                    <SelectItem value="On Assignment">On Assignment</SelectItem>
                    <SelectItem value="Unavailable">Unavailable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <User className="h-4 w-4" />
                  <span>Full Name</span>
                </div>
                <p className="font-medium">{driver.name}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Mail className="h-4 w-4" />
                  <span>Email Address</span>
                </div>
                <p className="font-medium">{driver.email}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <MapPin className="h-4 w-4" />
                  <span>Location</span>
                </div>
                <p className="font-medium">{driver.location}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Truck className="h-4 w-4" />
                  <span>Trailer/Vehicle Types</span>
                </div>
                <p className="font-medium">{displayVehicleTypes()}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <span>Status</span>
                </div>
                <Badge variant={driver.availability === 'Available' ? 'default' : 'secondary'}>
                  {driver.availability}
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {complianceStatus !== 'Green' && (
        <Alert className={`mb-6 ${getStatusColor(complianceStatus)}`}>
          <div className="flex items-start gap-3">
            {getStatusIcon(complianceStatus)}
            <div>
              <h3 className="font-semibold text-lg mb-1">
                {complianceStatus === 'Yellow' && 'Documents Expiring Soon'}
                {complianceStatus === 'Red' && 'Action Required'}
              </h3>
              <AlertDescription>
                {complianceStatus === 'Yellow' && 'Some documents will expire within 30 days. Please update them soon.'}
                {complianceStatus === 'Red' && 'Some documents are expired or missing. Please update them immediately.'}
              </AlertDescription>
            </div>
          </div>
        </Alert>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Compliance Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Overall Status</span>
              <Badge 
                variant={complianceStatus === 'Green' ? 'default' : complianceStatus === 'Yellow' ? 'secondary' : 'destructive'} 
                className={complianceStatus === 'Green' ? 'bg-green-600 hover:bg-green-700' : ''}
              >
                {complianceStatus}
              </Badge>
            </div>
            <div className="border-t pt-3">
              <p className="text-sm text-gray-600 mb-2">Quick Stats</p>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-green-600">
                    {complianceItems.filter(item => getItemStatus(item) === 'Green').length}
                  </p>
                  <p className="text-xs text-gray-600">Valid</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-600">
                    {complianceItems.filter(item => getItemStatus(item) === 'Yellow').length}
                  </p>
                  <p className="text-xs text-gray-600">Expiring</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">
                    {complianceItems.filter(item => getItemStatus(item) === 'Red').length}
                  </p>
                  <p className="text-xs text-gray-600">Issues</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compliance Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing && editedDriver ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cdlLicense">CDL License Number</Label>
                  <div className="flex gap-2">
                    <Input
                      id="cdlLicense"
                      value={editedDriver.cdlLicense || ''}
                      onChange={(e) => handleInputChange('cdlLicense', e.target.value)}
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleFileUpload('CDL License', 'cdlLicenseUrl')}
                      disabled={uploadingDoc === 'CDL License' || !isOnline}
                    >
                      {uploadingDoc === 'CDL License' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="cdlExpiry">CDL Expiry</Label>
                  <div className="flex gap-2">
                    <Input
                      id="cdlExpiry"
                      type="date"
                      value={editedDriver.cdlExpiry || ''}
                      onChange={(e) => handleInputChange('cdlExpiry', e.target.value)}
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleFileUpload('CDL Document', 'cdlDocumentUrl')}
                      disabled={uploadingDoc === 'CDL Document' || !isOnline}
                    >
                      {uploadingDoc === 'CDL Document' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="medicalCardExpiry">Medical Card Expiry</Label>
                  <div className="flex gap-2">
                    <Input
                      id="medicalCardExpiry"
                      type="date"
                      value={editedDriver.medicalCardExpiry || ''}
                      onChange={(e) => handleInputChange('medicalCardExpiry', e.target.value)}
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleFileUpload('Medical Card', 'medicalCardUrl')}
                      disabled={uploadingDoc === 'Medical Card' || !isOnline}
                    >
                      {uploadingDoc === 'Medical Card' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="insuranceExpiry">Insurance Expiry</Label>
                  <div className="flex gap-2">
                    <Input
                      id="insuranceExpiry"
                      type="date"
                      value={editedDriver.insuranceExpiry || ''}
                      onChange={(e) => handleInputChange('insuranceExpiry', e.target.value)}
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleFileUpload('Insurance', 'insuranceUrl')}
                      disabled={uploadingDoc === 'Insurance' || !isOnline}
                    >
                      {uploadingDoc === 'Insurance' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="motorVehicleRecordNumber">Motor Vehicle Record Number</Label>
                  <div className="flex gap-2">
                    <Input
                      id="motorVehicleRecordNumber"
                      value={editedDriver.motorVehicleRecordNumber || ''}
                      onChange={(e) => handleInputChange('motorVehicleRecordNumber', e.target.value)}
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleFileUpload('MVR', 'mvrUrl')}
                      disabled={uploadingDoc === 'MVR' || !isOnline}
                    >
                      {uploadingDoc === 'MVR' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="backgroundCheckDate">Background Check Date</Label>
                  <div className="flex gap-2">
                    <Input
                      id="backgroundCheckDate"
                      type="date"
                      value={editedDriver.backgroundCheckDate || ''}
                      onChange={(e) => handleInputChange('backgroundCheckDate', e.target.value)}
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleFileUpload('Background Check', 'backgroundCheckUrl')}
                      disabled={uploadingDoc === 'Background Check' || !isOnline}
                    >
                      {uploadingDoc === 'Background Check' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="preEmploymentScreeningDate">Pre-Employment Screening Date</Label>
                  <div className="flex gap-2">
                    <Input
                      id="preEmploymentScreeningDate"
                      type="date"
                      value={editedDriver.preEmploymentScreeningDate || ''}
                      onChange={(e) => handleInputChange('preEmploymentScreeningDate', e.target.value)}
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleFileUpload('Pre-Employment Screening', 'preEmploymentScreeningUrl')}
                      disabled={uploadingDoc === 'Pre-Employment Screening' || !isOnline}
                    >
                      {uploadingDoc === 'Pre-Employment Screening' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="drugAndAlcoholScreeningDate">Drug & Alcohol Screening Date</Label>
                  <div className="flex gap-2">
                    <Input
                      id="drugAndAlcoholScreeningDate"
                      type="date"
                      value={editedDriver.drugAndAlcoholScreeningDate || ''}
                      onChange={(e) => handleInputChange('drugAndAlcoholScreeningDate', e.target.value)}
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleFileUpload('Drug & Alcohol Screening', 'drugAndAlcoholScreeningUrl')}
                      disabled={uploadingDoc === 'Drug & Alcohol Screening' || !isOnline}
                    >
                      {uploadingDoc === 'Drug & Alcohol Screening' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {complianceItems.map((item, index) => {
                const status = getItemStatus(item);
                return (
                  <div key={index} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3 flex-1">
                      {getStatusIcon(status)}
                      <div className="flex-1">
                        <p className="font-medium">{item.label}</p>
                        {item.value && item.type === 'expiry' && (
                          <p className="text-sm text-gray-600">
                            Expires: {format(parseISO(item.value), 'MMM dd, yyyy')}
                          </p>
                        )}
                        {item.value && item.type === 'screening' && (
                          <p className="text-sm text-gray-600">
                            Completed: {format(parseISO(item.value), 'MMM dd, yyyy')}
                          </p>
                        )}
                        {item.value && item.type === 'field' && (
                          <p className="text-sm text-gray-600">Provided</p>
                        )}
                        {!item.value && (
                          <p className="text-sm text-red-600">Missing</p>
                        )}
                      </div>
                    </div>
                    <Badge 
                      variant={status === 'Green' ? 'default' : status === 'Yellow' ? 'secondary' : 'destructive'}
                      className={status === 'Green' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
                    >
                      {status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
