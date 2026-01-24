'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { collectionGroup, getDocs, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { Search, Package, RefreshCw, ArrowRight, Building2, Download, Trash2, Loader2 } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast-utils';
import { useAdminRole } from '../layout';
import { format, formatDistanceToNow } from 'date-fns';
import type { Load } from '@/lib/data';
import { logAuditAction } from '@/lib/audit';

type LoadWithOwner = Load & {
  ownerId?: string;
  ownerCompanyName?: string;
};

export default function AdminLoadsPage() {
  const firestore = useFirestore();
  const { user: adminUser } = useUser();
  const { hasPermission } = useAdminRole();
  const [loads, setLoads] = useState<LoadWithOwner[]>([]);
  const [filteredLoads, setFilteredLoads] = useState<LoadWithOwner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedLoad, setSelectedLoad] = useState<LoadWithOwner | null>(null);
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const [selectedLoadIds, setSelectedLoadIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const canDelete = hasPermission('loads:delete');

  const fetchLoads = async () => {
    if (!firestore) return;
    setIsLoading(true);
    try {
      const loadsSnap = await getDocs(collectionGroup(firestore, 'loads'));
      const loadsData: LoadWithOwner[] = [];
      const ownerIds = new Set<string>();

      loadsSnap.docs.forEach(docSnap => {
        const data = docSnap.data() as Load;
        const pathParts = docSnap.ref.path.split('/');
        const ownerId = pathParts[1];
        ownerIds.add(ownerId);
        loadsData.push({ ...data, id: docSnap.id, ownerId });
      });

      // Fetch owner names
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

      // Add owner names to loads
      const loadsWithOwners = loadsData.map(l => ({
        ...l,
        ownerCompanyName: l.ownerId ? names[l.ownerId] : undefined,
      }));

      // Sort by created date descending
      loadsWithOwners.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });

      setLoads(loadsWithOwners);
      setFilteredLoads(loadsWithOwners);
    } catch (error) {
      console.error('Error fetching loads:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchLoads(); }, [firestore]);

  useEffect(() => {
    let filtered = loads;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(load =>
        load.origin?.toLowerCase().includes(q) ||
        load.destination?.toLowerCase().includes(q) ||
        load.cargo?.toLowerCase().includes(q) ||
        load.ownerCompanyName?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter(load => load.status === statusFilter);
    }
    setFilteredLoads(filtered);
  }, [searchQuery, statusFilter, loads]);

  const handleBulkDelete = async () => {
    if (!firestore || !adminUser || selectedLoadIds.size === 0) return;

    setIsProcessing(true);
    try {
      const loadsToDelete = filteredLoads.filter(l => selectedLoadIds.has(l.id));
      let deletedCount = 0;

      for (const load of loadsToDelete) {
        if (!load.ownerId) continue;
        const loadRef = doc(firestore, `owner_operators/${load.ownerId}/loads`, load.id);
        await deleteDoc(loadRef);
        deletedCount++;
      }

      await logAuditAction(firestore, {
        action: 'load_deleted',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || '',
        targetType: 'load',
        targetId: 'bulk',
        targetName: `${deletedCount} loads`,
        reason: 'Bulk deleted via admin console',
        details: { count: deletedCount, loadIds: Array.from(selectedLoadIds) },
      });

      showSuccess(`${deletedCount} loads deleted successfully`);
      setSelectedLoadIds(new Set());
      setShowBulkDeleteDialog(false);
      fetchLoads();
    } catch (error: any) {
      showError(error.message || 'Failed to delete loads');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedLoadIds.size === filteredLoads.length) {
      setSelectedLoadIds(new Set());
    } else {
      setSelectedLoadIds(new Set(filteredLoads.map(l => l.id)));
    }
  };

  const toggleSelectLoad = (loadId: string) => {
    const newSelected = new Set(selectedLoadIds);
    if (newSelected.has(loadId)) {
      newSelected.delete(loadId);
    } else {
      newSelected.add(loadId);
    }
    setSelectedLoadIds(newSelected);
  };

  const handleExport = () => {
    const headers = ['Origin', 'Destination', 'Cargo', 'Weight', 'Price', 'Status', 'Owner', 'Created'];
    const csvContent = [
      headers.join(','),
      ...filteredLoads.map(load => [
        `"${load.origin || ''}"`,
        `"${load.destination || ''}"`,
        `"${load.cargo || ''}"`,
        load.weight || 0,
        load.price || 0,
        `"${load.status || ''}"`,
        `"${load.ownerCompanyName || ''}"`,
        `"${load.createdAt || ''}"`,
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `loads-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    if (firestore && adminUser) {
      logAuditAction(firestore, {
        action: 'data_exported',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || '',
        targetType: 'system',
        targetId: 'loads',
        targetName: 'Loads Export',
        details: { count: filteredLoads.length },
      });
    }
  };

  const getStatusBadgeVariant = (status?: string) => {
    switch (status) {
      case 'Pending': return 'secondary';
      case 'In Transit': return 'default';
      case 'Delivered': return 'outline';
      case 'Cancelled': return 'destructive';
      default: return 'secondary';
    }
  };

  const TableSkeleton = () => (
    <>{[1,2,3,4,5].map(i => (
      <TableRow key={i}>
        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
        <TableCell><Skeleton className="h-6 w-16" /></TableCell>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      </TableRow>
    ))}</>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline">All Loads</h1>
          <p className="text-muted-foreground">View loads across all fleets</p>
        </div>
        <div className="flex gap-2">
          {canDelete && selectedLoadIds.size > 0 && (
            <Button variant="destructive" onClick={() => setShowBulkDeleteDialog(true)}>
              <Trash2 className="h-4 w-4 mr-2" />Delete ({selectedLoadIds.size})
            </Button>
          )}
          <Button variant="outline" onClick={handleExport} disabled={filteredLoads.length === 0}>
            <Download className="h-4 w-4 mr-2" />Export CSV
          </Button>
          <Button variant="outline" onClick={fetchLoads} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <CardTitle className="font-headline">Loads</CardTitle>
              <CardDescription>{filteredLoads.length} total loads</CardDescription>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search loads..." className="pl-8" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="In Transit">In Transit</SelectItem>
                  <SelectItem value="Delivered">Delivered</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
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
                      checked={filteredLoads.length > 0 && selectedLoadIds.size === filteredLoads.length}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                )}
                <TableHead>Route</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? <TableSkeleton /> : filteredLoads.length > 0 ? (
                filteredLoads.map(load => (
                  <TableRow key={load.id} className="cursor-pointer hover:bg-muted/50">
                    {canDelete && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedLoadIds.has(load.id)}
                          onCheckedChange={() => toggleSelectLoad(load.id)}
                          aria-label={`Select load ${load.origin} to ${load.destination}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium" onClick={() => setSelectedLoad(load)}>
                      <div className="flex items-center gap-1">{load.origin}<ArrowRight className="h-3 w-3 text-muted-foreground" />{load.destination}</div>
                    </TableCell>
                    <TableCell onClick={() => setSelectedLoad(load)}>{load.cargo || '-'}</TableCell>
                    <TableCell onClick={() => setSelectedLoad(load)}>{load.weight?.toLocaleString() || '-'} lbs</TableCell>
                    <TableCell onClick={() => setSelectedLoad(load)} className="text-green-600 font-medium">${load.price?.toLocaleString() || '-'}</TableCell>
                    <TableCell onClick={() => setSelectedLoad(load)}><Badge variant={getStatusBadgeVariant(load.status)}>{load.status || 'Unknown'}</Badge></TableCell>
                    <TableCell onClick={() => setSelectedLoad(load)}>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Building2 className="h-3 w-3" />{load.ownerCompanyName || 'Unknown'}
                      </div>
                    </TableCell>
                    <TableCell onClick={() => setSelectedLoad(load)} className="text-muted-foreground text-sm">{load.createdAt ? formatDistanceToNow(new Date(load.createdAt), { addSuffix: true }) : '-'}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={canDelete ? 8 : 7} className="h-24 text-center">
                    <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No loads found</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Load Details Dialog */}
      <Dialog open={!!selectedLoad} onOpenChange={(open) => !open && setSelectedLoad(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-headline">Load Details</DialogTitle>
            <DialogDescription>{selectedLoad?.origin} → {selectedLoad?.destination}</DialogDescription>
          </DialogHeader>
          {selectedLoad && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant={getStatusBadgeVariant(selectedLoad.status)}>{selectedLoad.status || 'Unknown'}</Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-sm text-muted-foreground">Origin</p><p className="font-medium">{selectedLoad.origin || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Destination</p><p className="font-medium">{selectedLoad.destination || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Cargo</p><p className="font-medium">{selectedLoad.cargo || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Weight</p><p className="font-medium">{selectedLoad.weight?.toLocaleString() || '-'} lbs</p></div>
                <div><p className="text-sm text-muted-foreground">Price</p><p className="font-medium text-green-600">${selectedLoad.price?.toLocaleString() || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Vehicle Required</p><p className="font-medium">{selectedLoad.vehicleRequired || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Owner</p><p className="font-medium">{selectedLoad.ownerCompanyName || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Pickup Date</p><p className="font-medium">{selectedLoad.pickupDate ? format(new Date(selectedLoad.pickupDate), 'PPP') : '-'}</p></div>
                <div className="col-span-2"><p className="text-sm text-muted-foreground">Created</p><p className="font-medium">{selectedLoad.createdAt ? format(new Date(selectedLoad.createdAt), 'PPp') : '-'}</p></div>
              </div>

              {selectedLoad.notes && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="text-sm">{selectedLoad.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedLoadIds.size} Loads</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{selectedLoadIds.size} selected loads</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={isProcessing} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</> : `Delete ${selectedLoadIds.size} Loads`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
