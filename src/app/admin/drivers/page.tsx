'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useFirestore, useUser } from '@/firebase';
import { collection, collectionGroup, getDocs, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Search, MoreHorizontal, Truck, Eye, RefreshCw, ShieldCheck, Building2, Download, Edit2, Trash2, Loader2 } from 'lucide-react';
import { getComplianceStatus, ComplianceStatus } from '@/lib/compliance';
import type { Driver } from '@/lib/data';
import { logAuditAction } from '@/lib/audit';
import { showSuccess, showError } from '@/lib/toast-utils';
import { useAdminRole } from '../layout';
import { TRAILER_TYPES } from '@/lib/trailer-types';

type DriverWithOwner = Driver & {
  ownerCompanyName?: string;
};

type EditableDriverFields = {
  name: string;
  email: string;
  phoneNumber: string;
  location: string;
  vehicleType: string;
  availability: string;
  // Trailer types stored as comma-separated string in the form; parsed to
  // string[] on save.
  trailerTypes: string;
  // CDL
  cdlLicense: string;
  cdlState: string;
  cdlClass: string;
  cdlExpiry: string;
  cdlLicenseUrl: string;
  cdlDocumentUrl: string;
  endorsements: string;
  // Medical
  medicalCardExpiry: string;
  medicalCardUrl: string;
  // Insurance
  insuranceExpiry: string;
  insuranceUrl: string;
  insurerName: string;
  insurancePolicyNumber: string;
  // MVR
  motorVehicleRecordNumber: string;
  mvrUrl: string;
  // Background & screenings
  backgroundCheckDate: string;
  backgroundCheckUrl: string;
  preEmploymentScreeningDate: string;
  preEmploymentScreeningUrl: string;
  drugAndAlcoholScreeningDate: string;
  drugAndAlcoholScreeningUrl: string;
  // Compliance / profile
  clearinghouseStatus: string;
  dqfStatus: string;
  profileStatus: string;
  isActive: boolean;
};

export default function AdminDriversPage() {
  const firestore = useFirestore();
  const { user: adminUser } = useUser();
  const { hasPermission } = useAdminRole();
  const [drivers, setDrivers] = useState<DriverWithOwner[]>([]);
  const [filteredDrivers, setFilteredDrivers] = useState<DriverWithOwner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [complianceFilter, setComplianceFilter] = useState<string>('all');
  const [selectedDriver, setSelectedDriver] = useState<DriverWithOwner | null>(null);
  const [editingDriver, setEditingDriver] = useState<DriverWithOwner | null>(null);
  const [deletingDriver, setDeletingDriver] = useState<DriverWithOwner | null>(null);
  const [selectedDriverIds, setSelectedDriverIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  const [editForm, setEditForm] = useState<EditableDriverFields>({
    name: '',
    email: '',
    phoneNumber: '',
    location: '',
    vehicleType: '',
    availability: '',
    trailerTypes: '',
    cdlLicense: '',
    cdlState: '',
    cdlClass: '',
    cdlExpiry: '',
    cdlLicenseUrl: '',
    cdlDocumentUrl: '',
    endorsements: '',
    medicalCardExpiry: '',
    medicalCardUrl: '',
    insuranceExpiry: '',
    insuranceUrl: '',
    insurerName: '',
    insurancePolicyNumber: '',
    motorVehicleRecordNumber: '',
    mvrUrl: '',
    backgroundCheckDate: '',
    backgroundCheckUrl: '',
    preEmploymentScreeningDate: '',
    preEmploymentScreeningUrl: '',
    drugAndAlcoholScreeningDate: '',
    drugAndAlcoholScreeningUrl: '',
    clearinghouseStatus: '',
    dqfStatus: '',
    profileStatus: '',
    isActive: true,
  });

  const canEdit = hasPermission('drivers:edit');
  const canDelete = hasPermission('drivers:delete');

  const fetchDrivers = async () => {
    if (!firestore) return;
    setIsLoading(true);
    try {
      const driversSnap = await getDocs(collectionGroup(firestore, 'drivers'));
      const driversData: DriverWithOwner[] = [];
      const ownerIds = new Set<string>();

      driversSnap.docs.forEach(docSnap => {
        const data = docSnap.data() as Driver;
        const pathParts = docSnap.ref.path.split('/');
        const ownerId = pathParts[1];
        ownerIds.add(ownerId);
        driversData.push({ ...data, id: docSnap.id, ownerId });
      });

      const names: Record<string, string> = {};
      for (const ownerId of ownerIds) {
        try {
          const ownerDoc = await getDoc(doc(firestore, 'owner_operators', ownerId));
          if (ownerDoc.exists()) {
            const ownerData = ownerDoc.data();
            names[ownerId] = ownerData.companyName || ownerData.legalName || 'Unknown';
          }
        } catch (e) { console.error('Error fetching owner:', e); }
      }
      setOwnerNames(names);

      const driversWithOwners = driversData.map(d => ({
        ...d,
        ownerCompanyName: d.ownerId ? names[d.ownerId] : undefined,
      }));

      setDrivers(driversWithOwners);
      setFilteredDrivers(driversWithOwners);
    } catch (error) {
      console.error('Error fetching drivers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchDrivers(); }, [firestore]);

  // Prefill the search box from `?q=` so global-search deep links land here.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) setSearchQuery(q);
  }, []);

  useEffect(() => {
    let filtered = drivers;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(driver =>
        driver.name?.toLowerCase().includes(q) ||
        driver.email?.toLowerCase().includes(q) ||
        driver.location?.toLowerCase().includes(q) ||
        driver.ownerCompanyName?.toLowerCase().includes(q)
      );
    }
    if (complianceFilter !== 'all') {
      filtered = filtered.filter(driver => getComplianceStatus(driver) === complianceFilter);
    }
    setFilteredDrivers(filtered);
  }, [searchQuery, complianceFilter, drivers]);

  const handleOpenEdit = (driver: DriverWithOwner) => {
    const endorsementsValue = Array.isArray(driver.endorsements)
      ? driver.endorsements.join(', ')
      : driver.endorsements || '';
    const trailerTypesValue = Array.isArray(driver.trailerTypes)
      ? driver.trailerTypes.join(', ')
      : '';
    setEditForm({
      name: driver.name || '',
      email: driver.email || '',
      phoneNumber: driver.phoneNumber || driver.phone || '',
      location: driver.location || '',
      vehicleType: driver.vehicleType || '',
      availability: driver.availability || 'Off-duty',
      trailerTypes: trailerTypesValue,
      cdlLicense: driver.cdlLicense || '',
      cdlState: driver.cdlState || '',
      cdlClass: driver.cdlClass || '',
      cdlExpiry: driver.cdlExpiry || '',
      cdlLicenseUrl: driver.cdlLicenseUrl || '',
      cdlDocumentUrl: driver.cdlDocumentUrl || '',
      endorsements: endorsementsValue,
      medicalCardExpiry: driver.medicalCardExpiry || '',
      medicalCardUrl: driver.medicalCardUrl || '',
      insuranceExpiry: driver.insuranceExpiry || '',
      insuranceUrl: driver.insuranceUrl || '',
      insurerName: driver.insurerName || '',
      insurancePolicyNumber: driver.insurancePolicyNumber || '',
      motorVehicleRecordNumber: driver.motorVehicleRecordNumber || '',
      mvrUrl: driver.mvrUrl || '',
      backgroundCheckDate: driver.backgroundCheckDate || '',
      backgroundCheckUrl: driver.backgroundCheckUrl || '',
      preEmploymentScreeningDate: driver.preEmploymentScreeningDate || '',
      preEmploymentScreeningUrl: driver.preEmploymentScreeningUrl || '',
      drugAndAlcoholScreeningDate: driver.drugAndAlcoholScreeningDate || '',
      drugAndAlcoholScreeningUrl: driver.drugAndAlcoholScreeningUrl || '',
      clearinghouseStatus: driver.clearinghouseStatus || '',
      dqfStatus: driver.dqfStatus || '',
      profileStatus: driver.profileStatus || '',
      isActive: driver.isActive !== false,
    });
    setEditingDriver(driver);
  };

  const handleEditDriver = async () => {
    if (!firestore || !editingDriver || !adminUser || !editingDriver.ownerId) return;

    setIsProcessing(true);
    try {
      const driverRef = doc(firestore, `owner_operators/${editingDriver.ownerId}/drivers`, editingDriver.id);
      const { trailerTypes, ...rest } = editForm;
      const payload: Record<string, any> = {
        ...rest,
        updatedAt: new Date().toISOString(),
        updatedBy: adminUser.uid,
        updatedByAdmin: true,
      };
      // trailerTypes is held as a comma-separated string in the form; split
      // back into the string[] the driver doc expects.
      if (trailerTypes.trim()) {
        payload.trailerTypes = trailerTypes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        payload.trailerTypes = [];
      }
      await updateDoc(driverRef, payload);

      await logAuditAction(firestore, {
        action: 'driver_updated',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || '',
        targetType: 'driver',
        targetId: editingDriver.id,
        targetName: editForm.name,
        reason: 'Updated via admin console',
        details: { ownerId: editingDriver.ownerId },
      });

      showSuccess('Driver updated successfully');
      setEditingDriver(null);
      fetchDrivers();
    } catch (error: any) {
      showError(error.message || 'Failed to update driver');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteDriver = async () => {
    if (!firestore || !deletingDriver || !adminUser || !deletingDriver.ownerId) return;

    setIsProcessing(true);
    try {
      const driverRef = doc(firestore, `owner_operators/${deletingDriver.ownerId}/drivers`, deletingDriver.id);
      await deleteDoc(driverRef);

      await logAuditAction(firestore, {
        action: 'driver_deleted',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || '',
        targetType: 'driver',
        targetId: deletingDriver.id,
        targetName: deletingDriver.name || 'Unknown',
        reason: 'Deleted via admin console',
        details: { ownerId: deletingDriver.ownerId, ownerCompany: deletingDriver.ownerCompanyName },
      });

      showSuccess('Driver deleted successfully');
      setDeletingDriver(null);
      fetchDrivers();
    } catch (error: any) {
      showError(error.message || 'Failed to delete driver');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!firestore || !adminUser || selectedDriverIds.size === 0) return;

    setIsProcessing(true);
    try {
      const driversToDelete = filteredDrivers.filter(d => selectedDriverIds.has(d.id));
      let deletedCount = 0;

      for (const driver of driversToDelete) {
        if (!driver.ownerId) continue;
        const driverRef = doc(firestore, `owner_operators/${driver.ownerId}/drivers`, driver.id);
        await deleteDoc(driverRef);
        deletedCount++;
      }

      await logAuditAction(firestore, {
        action: 'driver_deleted',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || '',
        targetType: 'driver',
        targetId: 'bulk',
        targetName: `${deletedCount} drivers`,
        reason: 'Bulk deleted via admin console',
        details: { count: deletedCount, driverIds: Array.from(selectedDriverIds) },
      });

      showSuccess(`${deletedCount} drivers deleted successfully`);
      setSelectedDriverIds(new Set());
      setShowBulkDeleteDialog(false);
      fetchDrivers();
    } catch (error: any) {
      showError(error.message || 'Failed to delete drivers');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedDriverIds.size === filteredDrivers.length) {
      setSelectedDriverIds(new Set());
    } else {
      setSelectedDriverIds(new Set(filteredDrivers.map(d => d.id)));
    }
  };

  const toggleSelectDriver = (driverId: string) => {
    const newSelected = new Set(selectedDriverIds);
    if (newSelected.has(driverId)) {
      newSelected.delete(driverId);
    } else {
      newSelected.add(driverId);
    }
    setSelectedDriverIds(newSelected);
  };

  const handleExport = () => {
    const headers = ['Name', 'Email', 'Fleet', 'Location', 'Vehicle Type', 'Availability', 'Compliance', 'CDL Expiry', 'Medical Card Expiry', 'Status'];
    const csvContent = [
      headers.join(','),
      ...filteredDrivers.map(driver => [
        `"${driver.name || ''}"`,
        `"${driver.email || ''}"`,
        `"${driver.ownerCompanyName || ''}"`,
        `"${driver.location || ''}"`,
        `"${driver.vehicleType || ''}"`,
        `"${driver.availability || ''}"`,
        `"${getComplianceStatus(driver)}"`,
        `"${driver.cdlExpiry || ''}"`,
        `"${driver.medicalCardExpiry || ''}"`,
        driver.isActive === false ? 'Inactive' : 'Active',
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `drivers-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    if (firestore && adminUser) {
      logAuditAction(firestore, {
        action: 'data_exported',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || '',
        targetType: 'system',
        targetId: 'drivers',
        targetName: 'Drivers Export',
        details: { count: filteredDrivers.length },
      });
    }
  };

  const getComplianceBadgeStyle = (status: ComplianceStatus) => {
    switch (status) {
      case 'Green': return 'bg-green-100 text-green-800 border-green-300 dark:bg-green-950 dark:text-green-200 dark:border-green-800';
      case 'Yellow': return 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-200 dark:border-yellow-800';
      case 'Red': return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-200 dark:border-red-800';
      default: return '';
    }
  };

  const TableSkeleton = () => (
    <>{[1,2,3,4,5].map(i => (
      <TableRow key={i}>
        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
        <TableCell><Skeleton className="h-6 w-16" /></TableCell>
        <TableCell><Skeleton className="h-8 w-8" /></TableCell>
      </TableRow>
    ))}</>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline">All Drivers</h1>
          <p className="text-muted-foreground">View and manage drivers across all fleets</p>
        </div>
        <div className="flex gap-2">
          {canDelete && selectedDriverIds.size > 0 && (
            <Button variant="destructive" onClick={() => setShowBulkDeleteDialog(true)}>
              <Trash2 className="h-4 w-4 mr-2" />Delete ({selectedDriverIds.size})
            </Button>
          )}
          <Button variant="outline" onClick={handleExport} disabled={filteredDrivers.length === 0}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
          <Button variant="outline" onClick={fetchDrivers} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <CardTitle className="font-headline">Drivers</CardTitle>
              <CardDescription>{filteredDrivers.length} total drivers</CardDescription>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search drivers..." className="pl-8" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              <Select value={complianceFilter} onValueChange={setComplianceFilter}>
                <SelectTrigger className="w-32"><SelectValue placeholder="Compliance" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="Green">Green</SelectItem>
                  <SelectItem value="Yellow">Yellow</SelectItem>
                  <SelectItem value="Red">Red</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {canDelete && (
                  <TableHead className="w-12">
                    <Checkbox
                      checked={filteredDrivers.length > 0 && selectedDriverIds.size === filteredDrivers.length}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                )}
                <TableHead>Name</TableHead>
                <TableHead>Fleet</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Availability</TableHead>
                <TableHead>Compliance</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? <TableSkeleton /> : filteredDrivers.length > 0 ? (
                filteredDrivers.map(driver => {
                  const compliance = getComplianceStatus(driver);
                  return (
                    <TableRow key={driver.id} className={driver.isActive === false ? 'opacity-50' : ''}>
                      {canDelete && (
                        <TableCell>
                          <Checkbox
                            checked={selectedDriverIds.has(driver.id)}
                            onCheckedChange={() => toggleSelectDriver(driver.id)}
                            aria-label={`Select ${driver.name}`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span className="truncate max-w-[120px]">{driver.name}</span>
                          {driver.isActive === false && <Badge variant="outline">Inactive</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Building2 className="h-3 w-3" />
                          <span className="truncate max-w-[100px]">{driver.ownerCompanyName || 'Unknown'}</span>
                        </div>
                      </TableCell>
                      <TableCell><span className="truncate max-w-[100px] block">{driver.location || '-'}</span></TableCell>
                      <TableCell>{driver.vehicleType || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={driver.availability === 'Available' ? 'default' : 'secondary'}>{driver.availability || 'Off-duty'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getComplianceBadgeStyle(compliance)}><ShieldCheck className="h-3 w-3 mr-1" />{compliance}</Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => setSelectedDriver(driver)}><Eye className="h-4 w-4 mr-2" />View Details</DropdownMenuItem>
                            {canEdit && (
                              <DropdownMenuItem onClick={() => handleOpenEdit(driver)}><Edit2 className="h-4 w-4 mr-2" />Edit Driver</DropdownMenuItem>
                            )}
                            {canDelete && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setDeletingDriver(driver)} className="text-destructive">
                                  <Trash2 className="h-4 w-4 mr-2" />Delete Driver
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <Truck className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No drivers found</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Driver Details Dialog */}
      <Dialog open={!!selectedDriver} onOpenChange={(open) => !open && setSelectedDriver(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-headline">{selectedDriver?.name}</DialogTitle>
            <DialogDescription>Driver Details</DialogDescription>
          </DialogHeader>
          {selectedDriver && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-sm text-muted-foreground">Fleet</p><p className="font-medium">{selectedDriver.ownerCompanyName || '-'}</p></div>
                <div className="min-w-0"><p className="text-sm text-muted-foreground">Email</p><p className="font-medium truncate" title={selectedDriver.email || '-'}>{selectedDriver.email || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Location</p><p className="font-medium">{selectedDriver.location || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Vehicle Type</p><p className="font-medium">{selectedDriver.vehicleType || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">CDL License</p><p className="font-medium">{selectedDriver.cdlLicense || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">CDL Expiry</p><p className="font-medium">{selectedDriver.cdlExpiry || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Medical Card Expiry</p><p className="font-medium">{selectedDriver.medicalCardExpiry || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Insurance Expiry</p><p className="font-medium">{selectedDriver.insuranceExpiry || '-'}</p></div>
              </div>
              <div className="flex items-center gap-4 pt-4 border-t">
                <Badge variant={selectedDriver.availability === 'Available' ? 'default' : 'secondary'}>{selectedDriver.availability || 'Off-duty'}</Badge>
                <Badge className={getComplianceBadgeStyle(getComplianceStatus(selectedDriver))}><ShieldCheck className="h-3 w-3 mr-1" />{getComplianceStatus(selectedDriver)}</Badge>
                {selectedDriver.isActive === false && <Badge variant="outline">Inactive</Badge>}
              </div>
            </div>
          )}
          <DialogFooter>
            {canEdit && (
              <Button variant="outline" onClick={() => { setSelectedDriver(null); handleOpenEdit(selectedDriver!); }}>
                <Edit2 className="h-4 w-4 mr-2" />Edit Driver
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Driver Dialog */}
      <Dialog open={!!editingDriver} onOpenChange={(open) => !open && setEditingDriver(null)}>
        <DialogContent className="max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="font-headline">Edit Driver</DialogTitle>
            <DialogDescription>
              Update driver information for {editingDriver?.name} ({editingDriver?.ownerCompanyName})
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Name</Label>
                  <Input id="edit-name" value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input id="edit-email" type="email" value={editForm.email} onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-location">Location</Label>
                <Input id="edit-location" value={editForm.location} onChange={(e) => setEditForm(f => ({ ...f, location: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-vehicle">Vehicle Type</Label>
                  <Select value={editForm.vehicleType} onValueChange={(val) => setEditForm(f => ({ ...f, vehicleType: val }))}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {TRAILER_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-availability">Availability</Label>
                  <Select value={editForm.availability} onValueChange={(val) => setEditForm(f => ({ ...f, availability: val }))}>
                    <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Available">Available</SelectItem>
                      <SelectItem value="On-trip">On-trip</SelectItem>
                      <SelectItem value="Off-duty">Off-duty</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-cdl">CDL License</Label>
                  <Input id="edit-cdl" value={editForm.cdlLicense} onChange={(e) => setEditForm(f => ({ ...f, cdlLicense: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-cdl-expiry">CDL Expiry</Label>
                  <Input id="edit-cdl-expiry" type="date" value={editForm.cdlExpiry} onChange={(e) => setEditForm(f => ({ ...f, cdlExpiry: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-medical">Medical Card Expiry</Label>
                  <Input id="edit-medical" type="date" value={editForm.medicalCardExpiry} onChange={(e) => setEditForm(f => ({ ...f, medicalCardExpiry: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-insurance">Insurance Expiry</Label>
                  <Input id="edit-insurance" type="date" value={editForm.insuranceExpiry} onChange={(e) => setEditForm(f => ({ ...f, insuranceExpiry: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone-number">Phone</Label>
                <Input id="edit-phone-number" type="tel" value={editForm.phoneNumber} onChange={(e) => setEditForm(f => ({ ...f, phoneNumber: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-trailer-types">Trailer Types <span className="text-xs text-muted-foreground">(comma-separated)</span></Label>
                <Input id="edit-trailer-types" value={editForm.trailerTypes} onChange={(e) => setEditForm(f => ({ ...f, trailerTypes: e.target.value }))} placeholder="e.g. dry-van, reefer, flatbed" />
              </div>

              <div className="pt-4 border-t space-y-4">
                <p className="text-sm font-medium text-muted-foreground">CDL Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-cdl-state">CDL State</Label>
                    <Input id="edit-cdl-state" value={editForm.cdlState} onChange={(e) => setEditForm(f => ({ ...f, cdlState: e.target.value }))} placeholder="e.g. FL" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-cdl-class">CDL Class</Label>
                    <Input id="edit-cdl-class" value={editForm.cdlClass} onChange={(e) => setEditForm(f => ({ ...f, cdlClass: e.target.value }))} placeholder="A, B, or C" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-endorsements">Endorsements</Label>
                  <Input id="edit-endorsements" value={editForm.endorsements} onChange={(e) => setEditForm(f => ({ ...f, endorsements: e.target.value }))} placeholder="e.g. H, N, T" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-cdl-license-url">CDL License URL</Label>
                    <Input id="edit-cdl-license-url" type="url" value={editForm.cdlLicenseUrl} onChange={(e) => setEditForm(f => ({ ...f, cdlLicenseUrl: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-cdl-document-url">CDL Document URL</Label>
                    <Input id="edit-cdl-document-url" type="url" value={editForm.cdlDocumentUrl} onChange={(e) => setEditForm(f => ({ ...f, cdlDocumentUrl: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t space-y-4">
                <p className="text-sm font-medium text-muted-foreground">Medical &amp; Insurance</p>
                <div className="space-y-2">
                  <Label htmlFor="edit-medical-url">Medical Card URL</Label>
                  <Input id="edit-medical-url" type="url" value={editForm.medicalCardUrl} onChange={(e) => setEditForm(f => ({ ...f, medicalCardUrl: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-insurer">Insurer Name</Label>
                    <Input id="edit-insurer" value={editForm.insurerName} onChange={(e) => setEditForm(f => ({ ...f, insurerName: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-policy">Policy Number</Label>
                    <Input id="edit-policy" value={editForm.insurancePolicyNumber} onChange={(e) => setEditForm(f => ({ ...f, insurancePolicyNumber: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-insurance-url">Insurance URL</Label>
                  <Input id="edit-insurance-url" type="url" value={editForm.insuranceUrl} onChange={(e) => setEditForm(f => ({ ...f, insuranceUrl: e.target.value }))} />
                </div>
              </div>

              <div className="pt-4 border-t space-y-4">
                <p className="text-sm font-medium text-muted-foreground">MVR &amp; Screenings</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-mvr-number">MVR Number</Label>
                    <Input id="edit-mvr-number" value={editForm.motorVehicleRecordNumber} onChange={(e) => setEditForm(f => ({ ...f, motorVehicleRecordNumber: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-mvr-url">MVR URL</Label>
                    <Input id="edit-mvr-url" type="url" value={editForm.mvrUrl} onChange={(e) => setEditForm(f => ({ ...f, mvrUrl: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-bg-date">Background Check Date</Label>
                    <Input id="edit-bg-date" type="date" value={editForm.backgroundCheckDate} onChange={(e) => setEditForm(f => ({ ...f, backgroundCheckDate: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-bg-url">Background Check URL</Label>
                    <Input id="edit-bg-url" type="url" value={editForm.backgroundCheckUrl} onChange={(e) => setEditForm(f => ({ ...f, backgroundCheckUrl: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-pes-date">Pre-Employment Date</Label>
                    <Input id="edit-pes-date" type="date" value={editForm.preEmploymentScreeningDate} onChange={(e) => setEditForm(f => ({ ...f, preEmploymentScreeningDate: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-pes-url">Pre-Employment URL</Label>
                    <Input id="edit-pes-url" type="url" value={editForm.preEmploymentScreeningUrl} onChange={(e) => setEditForm(f => ({ ...f, preEmploymentScreeningUrl: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-da-date">Drug &amp; Alcohol Date</Label>
                    <Input id="edit-da-date" type="date" value={editForm.drugAndAlcoholScreeningDate} onChange={(e) => setEditForm(f => ({ ...f, drugAndAlcoholScreeningDate: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-da-url">Drug &amp; Alcohol URL</Label>
                    <Input id="edit-da-url" type="url" value={editForm.drugAndAlcoholScreeningUrl} onChange={(e) => setEditForm(f => ({ ...f, drugAndAlcoholScreeningUrl: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t space-y-4">
                <p className="text-sm font-medium text-muted-foreground">Compliance Status</p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-clearinghouse">Clearinghouse</Label>
                    <Input id="edit-clearinghouse" value={editForm.clearinghouseStatus} onChange={(e) => setEditForm(f => ({ ...f, clearinghouseStatus: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-dqf">DQF Status</Label>
                    <Input id="edit-dqf" value={editForm.dqfStatus} onChange={(e) => setEditForm(f => ({ ...f, dqfStatus: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-profile-status">Profile Status</Label>
                    <Input id="edit-profile-status" value={editForm.profileStatus} onChange={(e) => setEditForm(f => ({ ...f, profileStatus: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Active</Label>
                <Select value={editForm.isActive ? 'active' : 'inactive'} onValueChange={(val) => setEditForm(f => ({ ...f, isActive: val === 'active' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDriver(null)}>Cancel</Button>
            <Button onClick={handleEditDriver} disabled={isProcessing}>
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Driver Dialog */}
      <AlertDialog open={!!deletingDriver} onOpenChange={(open) => !open && setDeletingDriver(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Driver</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deletingDriver?.name}</strong> from{' '}
              <strong>{deletingDriver?.ownerCompanyName}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDriver} disabled={isProcessing} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</> : 'Delete Driver'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedDriverIds.size} Drivers</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{selectedDriverIds.size} selected drivers</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={isProcessing} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</> : `Delete ${selectedDriverIds.size} Drivers`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
