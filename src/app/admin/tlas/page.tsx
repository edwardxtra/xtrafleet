'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { Search, FileText, RefreshCw, ArrowRight, CheckCircle, XCircle, Ban, Download, Loader2 } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import type { TLA } from '@/lib/data';
import { logAuditAction } from '@/lib/audit';
import { showSuccess, showError } from '@/lib/toast-utils';

export default function AdminTLAsPage() {
  const firestore = useFirestore();
  const { user: adminUser } = useUser();
  const [tlas, setTLAs] = useState<TLA[]>([]);
  const [filteredTLAs, setFilteredTLAs] = useState<TLA[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedTLA, setSelectedTLA] = useState<TLA | null>(null);
  const [voidingTLA, setVoidingTLA] = useState<TLA | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchTLAs = async () => {
    if (!firestore) return;
    setIsLoading(true);
    try {
      const tlasSnap = await getDocs(collection(firestore, 'tlas'));
      const tlasData = tlasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as TLA[];
      tlasData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTLAs(tlasData);
      setFilteredTLAs(tlasData);
    } catch (error) {
      console.error('Error fetching TLAs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchTLAs(); }, [firestore]);

  useEffect(() => {
    let filtered = tlas;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(tla => 
        tla.trip?.origin?.toLowerCase().includes(q) ||
        tla.trip?.destination?.toLowerCase().includes(q) ||
        tla.driver?.name?.toLowerCase().includes(q) ||
        tla.lessor?.legalName?.toLowerCase().includes(q) ||
        tla.lessee?.legalName?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter(tla => tla.status === statusFilter);
    }
    setFilteredTLAs(filtered);
  }, [searchQuery, statusFilter, tlas]);

  const handleVoidTLA = async () => {
    if (!firestore || !voidingTLA || !adminUser) return;
    setIsProcessing(true);
    try {
      await updateDoc(doc(firestore, 'tlas', voidingTLA.id), {
        status: 'voided',
        voidedAt: new Date().toISOString(),
        voidedBy: adminUser.uid,
        voidedReason: voidReason,
      });

      await logAuditAction(firestore, {
        action: 'tla_voided',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || '',
        targetType: 'tla',
        targetId: voidingTLA.id,
        targetName: `${voidingTLA.trip?.origin} → ${voidingTLA.trip?.destination}`,
        reason: voidReason,
        details: {
          lessor: voidingTLA.lessor?.legalName,
          lessee: voidingTLA.lessee?.legalName,
          driver: voidingTLA.driver?.name,
          amount: voidingTLA.payment?.amount,
        },
      });

      showSuccess('TLA voided successfully');
      setVoidingTLA(null);
      setVoidReason('');
      setSelectedTLA(null);
      fetchTLAs();
    } catch (error: any) {
      showError(error.message || 'Failed to void TLA');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = () => {
    const headers = ['Route', 'Driver', 'Lessor', 'Lessee', 'Status', 'Amount', 'Created'];
    const csvContent = [
      headers.join(','),
      ...filteredTLAs.map(tla => [
        `"${tla.trip?.origin} → ${tla.trip?.destination}"`,
        `"${tla.driver?.name || ''}"`,
        `"${tla.lessor?.legalName || ''}"`,
        `"${tla.lessee?.legalName || ''}"`,
        `"${tla.status}"`,
        tla.payment?.amount || 0,
        `"${tla.createdAt || ''}"`,
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `tlas-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    if (firestore && adminUser) {
      logAuditAction(firestore, {
        action: 'data_exported',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || '',
        targetType: 'system',
        targetId: 'tlas',
        targetName: 'TLAs Export',
        details: { count: filteredTLAs.length },
      });
    }
  };

  const getStatusBadgeVariant = (status: TLA['status']) => {
    switch (status) {
      case 'signed': case 'completed': return 'default';
      case 'voided': return 'destructive';
      case 'draft': case 'pending_lessor': case 'pending_lessee': return 'secondary';
      case 'in_progress': return 'outline';
      default: return 'secondary';
    }
  };

  const canVoidTLA = (tla: TLA) => {
    return !['voided', 'completed'].includes(tla.status);
  };

  const TableSkeleton = () => (
    <>{[1,2,3,4,5].map(i => (
      <TableRow key={i}>
        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        <TableCell><Skeleton className="h-6 w-20" /></TableCell>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      </TableRow>
    ))}</>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-headline">TLA Management</h1>
          <p className="text-muted-foreground">View and manage Trip Lease Agreements</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={filteredTLAs.length === 0}>
            <Download className="h-4 w-4 mr-2" />Export CSV
          </Button>
          <Button variant="outline" onClick={fetchTLAs} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <CardTitle className="font-headline">All TLAs</CardTitle>
              <CardDescription>{filteredTLAs.length} total agreements</CardDescription>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search TLAs..." className="pl-8" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending_lessor">Pending Lessor</SelectItem>
                  <SelectItem value="pending_lessee">Pending Lessee</SelectItem>
                  <SelectItem value="signed">Signed</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="voided">Voided</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Route</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Lessor</TableHead>
                <TableHead>Lessee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? <TableSkeleton /> : filteredTLAs.length > 0 ? (
                filteredTLAs.map(tla => (
                  <TableRow key={tla.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedTLA(tla)}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1">{tla.trip?.origin}<ArrowRight className="h-3 w-3 text-muted-foreground" />{tla.trip?.destination}</div>
                    </TableCell>
                    <TableCell>{tla.driver?.name || '-'}</TableCell>
                    <TableCell>{tla.lessor?.legalName || '-'}</TableCell>
                    <TableCell>{tla.lessee?.legalName || '-'}</TableCell>
                    <TableCell><Badge variant={getStatusBadgeVariant(tla.status)}>{tla.status.replace('_', ' ')}</Badge></TableCell>
                    <TableCell>${tla.payment?.amount?.toLocaleString() || '-'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{tla.createdAt ? formatDistanceToNow(new Date(tla.createdAt), { addSuffix: true }) : '-'}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No TLAs found</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* TLA Details Dialog */}
      <Dialog open={!!selectedTLA} onOpenChange={(open) => !open && setSelectedTLA(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-headline">Trip Lease Agreement</DialogTitle>
            <DialogDescription>{selectedTLA?.trip?.origin} → {selectedTLA?.trip?.destination}</DialogDescription>
          </DialogHeader>
          {selectedTLA && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={getStatusBadgeVariant(selectedTLA.status)}>{selectedTLA.status.replace('_', ' ')}</Badge>
                  <span className="text-sm text-muted-foreground">Version {selectedTLA.version}</span>
                </div>
                {canVoidTLA(selectedTLA) && (
                  <Button variant="destructive" size="sm" onClick={() => setVoidingTLA(selectedTLA)}>
                    <Ban className="h-4 w-4 mr-2" />Void TLA
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="p-4 rounded-lg bg-muted/50">
                  <h4 className="font-semibold mb-2">Lessor (Driver Provider)</h4>
                  <p className="text-sm">{selectedTLA.lessor?.legalName}</p>
                  <p className="text-xs text-muted-foreground">{selectedTLA.lessor?.contactEmail}</p>
                  {selectedTLA.lessor?.dotNumber && <p className="text-xs text-muted-foreground">DOT: {selectedTLA.lessor.dotNumber}</p>}
                  <div className="mt-2 flex items-center gap-1">
                    {selectedTLA.lessorSignature ? (<><CheckCircle className="h-4 w-4 text-green-500" /><span className="text-xs text-green-600">Signed</span></>) : (<><XCircle className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Not signed</span></>)}
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <h4 className="font-semibold mb-2">Lessee (Hiring Carrier)</h4>
                  <p className="text-sm">{selectedTLA.lessee?.legalName}</p>
                  <p className="text-xs text-muted-foreground">{selectedTLA.lessee?.contactEmail}</p>
                  {selectedTLA.lessee?.dotNumber && <p className="text-xs text-muted-foreground">DOT: {selectedTLA.lessee.dotNumber}</p>}
                  <div className="mt-2 flex items-center gap-1">
                    {selectedTLA.lesseeSignature ? (<><CheckCircle className="h-4 w-4 text-green-500" /><span className="text-xs text-green-600">Signed</span></>) : (<><XCircle className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Not signed</span></>)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-sm text-muted-foreground">Driver</p><p className="font-medium">{selectedTLA.driver?.name || '-'}</p>{selectedTLA.driver?.cdlNumber && <p className="text-xs text-muted-foreground">CDL: {selectedTLA.driver.cdlNumber}</p>}</div>
                <div><p className="text-sm text-muted-foreground">Payment Amount</p><p className="font-medium">${selectedTLA.payment?.amount?.toLocaleString() || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Cargo</p><p className="font-medium">{selectedTLA.trip?.cargo || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Weight</p><p className="font-medium">{selectedTLA.trip?.weight?.toLocaleString() || '-'} lbs</p></div>
                <div><p className="text-sm text-muted-foreground">Start Date</p><p className="font-medium">{selectedTLA.trip?.startDate ? format(new Date(selectedTLA.trip.startDate), 'PPP') : '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Insurance</p><p className="font-medium">{selectedTLA.insurance?.option?.replace('_', ' ') || 'Not selected'}</p></div>
              </div>

              {selectedTLA.tripTracking && (
                <div className="pt-4 border-t">
                  <h4 className="font-semibold mb-2">Trip Tracking</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedTLA.tripTracking.startedAt && (<div><p className="text-sm text-muted-foreground">Started</p><p className="font-medium">{format(new Date(selectedTLA.tripTracking.startedAt), 'PPp')}</p><p className="text-xs text-muted-foreground">by {selectedTLA.tripTracking.startedByName}</p></div>)}
                    {selectedTLA.tripTracking.endedAt && (<div><p className="text-sm text-muted-foreground">Ended</p><p className="font-medium">{format(new Date(selectedTLA.tripTracking.endedAt), 'PPp')}</p><p className="text-xs text-muted-foreground">by {selectedTLA.tripTracking.endedByName}</p></div>)}
                  </div>
                </div>
              )}

              {selectedTLA.status === 'voided' && selectedTLA.voidedReason && (
                <div className="pt-4 border-t bg-red-50 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2 text-destructive">Voided</h4>
                  <p className="text-sm">{selectedTLA.voidedReason}</p>
                  {selectedTLA.voidedAt && <p className="text-xs text-muted-foreground mt-1">Voided on {format(new Date(selectedTLA.voidedAt), 'PPp')}</p>}
                </div>
              )}

              <div className="pt-4 border-t text-xs text-muted-foreground">
                <p>Created: {selectedTLA.createdAt ? format(new Date(selectedTLA.createdAt), 'PPp') : '-'}</p>
                {selectedTLA.signedAt && <p>Signed: {format(new Date(selectedTLA.signedAt), 'PPp')}</p>}
                {selectedTLA.updatedAt && <p>Last Updated: {format(new Date(selectedTLA.updatedAt), 'PPp')}</p>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Void TLA Dialog */}
      <AlertDialog open={!!voidingTLA} onOpenChange={(open) => { if (!open) { setVoidingTLA(null); setVoidReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void Trip Lease Agreement</AlertDialogTitle>
            <AlertDialogDescription>
              This will void the TLA for <strong>{voidingTLA?.trip?.origin} → {voidingTLA?.trip?.destination}</strong>. 
              This action cannot be undone and will affect both parties.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="void-reason">Reason for voiding</Label>
            <Textarea
              id="void-reason"
              placeholder="Enter the reason for voiding this agreement..."
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleVoidTLA} disabled={isProcessing || !voidReason.trim()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Voiding...</> : 'Void TLA'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
