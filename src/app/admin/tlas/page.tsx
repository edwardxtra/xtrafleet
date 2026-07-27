'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { collection, getDocs, doc, updateDoc, deleteDoc, query, where, getDoc, limit } from 'firebase/firestore';
import { Search, FileText, RefreshCw, ArrowRight, CheckCircle, XCircle, Ban, Download, Loader2, Trash2, Edit2, MoreHorizontal, Eye, DollarSign } from 'lucide-react';
import { RefundModal } from '@/components/admin/billing/refund-modal';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAdminRole } from '../layout';
import { format, formatDistanceToNow } from 'date-fns';
import type { TLA } from '@/lib/data';
import { logAuditAction } from '@/lib/audit';
import { showSuccess, showError } from '@/lib/toast-utils';

type EditableTLAFields = {
  paymentAmount: string;
  paymentDueDate: string;
  insuranceOption: '' | 'existing_policy' | 'trip_coverage';
  insuranceConfirmedAt: string;
  tripStartedAt: string;
  tripEndedAt: string;
  lessorLegalName: string;
  lessorAddress: string;
  lessorDotNumber: string;
  lessorMcNumber: string;
  lessorContactEmail: string;
  lessorPhone: string;
  lesseeLegalName: string;
  lesseeAddress: string;
  lesseeDotNumber: string;
  lesseeMcNumber: string;
  lesseeContactEmail: string;
  lesseePhone: string;
};

const EMPTY_TLA_FORM: EditableTLAFields = {
  paymentAmount: '',
  paymentDueDate: '',
  insuranceOption: '',
  insuranceConfirmedAt: '',
  tripStartedAt: '',
  tripEndedAt: '',
  lessorLegalName: '',
  lessorAddress: '',
  lessorDotNumber: '',
  lessorMcNumber: '',
  lessorContactEmail: '',
  lessorPhone: '',
  lesseeLegalName: '',
  lesseeAddress: '',
  lesseeDotNumber: '',
  lesseeMcNumber: '',
  lesseeContactEmail: '',
  lesseePhone: '',
};

export default function AdminTLAsPage() {
  const firestore = useFirestore();
  const { user: adminUser } = useUser();
  const { hasPermission } = useAdminRole();
  const [tlas, setTLAs] = useState<TLA[]>([]);
  const [filteredTLAs, setFilteredTLAs] = useState<TLA[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedTLA, setSelectedTLA] = useState<TLA | null>(null);
  const [voidingTLA, setVoidingTLA] = useState<TLA | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedTLAIds, setSelectedTLAIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [editingTLA, setEditingTLA] = useState<TLA | null>(null);
  const [editForm, setEditForm] = useState<EditableTLAFields>(EMPTY_TLA_FORM);

  const canDelete = hasPermission('tlas:delete');
  const canEditTLA = hasPermission('tlas:void');
  const canRefund = hasPermission('billing:refund');

  const [refundPayment, setRefundPayment] = useState<any | null>(null);
  const [refundOwnerOp, setRefundOwnerOp] = useState<any | null>(null);
  const [isLookingUpRefund, setIsLookingUpRefund] = useState(false);

  const handleOpenRefund = async (tla: TLA) => {
    if (!firestore) return;
    if (!tla.matchId) {
      showError('This TLA has no match — no payment to refund.');
      return;
    }
    setIsLookingUpRefund(true);
    try {
      // Find a refundable payment for this match (succeeded, not yet refunded).
      const paymentsQuery = query(
        collection(firestore, 'payments'),
        where('matchId', '==', tla.matchId),
        where('status', '==', 'succeeded'),
        limit(1)
      );
      const snap = await getDocs(paymentsQuery);
      if (snap.empty) {
        showError('No refundable payment found for this match.');
        return;
      }
      const paymentDoc = snap.docs[0];
      const payment = { id: paymentDoc.id, ...paymentDoc.data() } as any;

      // Load the OwnerOperator that paid (the refund returns to them).
      const ooSnap = await getDoc(doc(firestore, 'owner_operators', payment.ownerOperatorId));
      if (!ooSnap.exists()) {
        showError('Payment owner not found.');
        return;
      }
      const ooData = ooSnap.data() as any;
      setRefundOwnerOp({
        id: ooSnap.id,
        email: ooData?.contactEmail || '',
        companyName: ooData?.companyName || ooData?.legalName || '',
      });
      setRefundPayment(payment);
    } catch (e: any) {
      console.error('[Refund lookup]', e);
      showError('Failed to load refund details.');
    } finally {
      setIsLookingUpRefund(false);
    }
  };

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

  // Prefill the search box from `?q=` so global-search deep links land here.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) setSearchQuery(q);
  }, []);

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

  const handleBulkDelete = async () => {
    if (!firestore || !adminUser || selectedTLAIds.size === 0) return;

    setIsProcessing(true);
    try {
      let deletedCount = 0;

      for (const tlaId of selectedTLAIds) {
        const tlaRef = doc(firestore, 'tlas', tlaId);
        await deleteDoc(tlaRef);
        deletedCount++;
      }

      await logAuditAction(firestore, {
        action: 'tla_deleted',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || '',
        targetType: 'tla',
        targetId: 'bulk',
        targetName: `${deletedCount} TLAs`,
        reason: 'Bulk deleted via admin console',
        details: { count: deletedCount, tlaIds: Array.from(selectedTLAIds) },
      });

      showSuccess(`${deletedCount} TLAs deleted successfully`);
      setSelectedTLAIds(new Set());
      setShowBulkDeleteDialog(false);
      fetchTLAs();
    } catch (error: any) {
      showError(error.message || 'Failed to delete TLAs');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedTLAIds.size === filteredTLAs.length) {
      setSelectedTLAIds(new Set());
    } else {
      setSelectedTLAIds(new Set(filteredTLAs.map(t => t.id)));
    }
  };

  const toggleSelectTLA = (tlaId: string) => {
    const newSelected = new Set(selectedTLAIds);
    if (newSelected.has(tlaId)) {
      newSelected.delete(tlaId);
    } else {
      newSelected.add(tlaId);
    }
    setSelectedTLAIds(newSelected);
  };

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

  const handleOpenEditTLA = (tla: TLA) => {
    setEditForm({
      paymentAmount: tla.payment?.amount != null ? String(tla.payment.amount) : '',
      paymentDueDate: tla.payment?.dueDate || '',
      insuranceOption: (tla.insurance?.option as '' | 'existing_policy' | 'trip_coverage') || '',
      insuranceConfirmedAt: tla.insurance?.confirmedAt || '',
      tripStartedAt: tla.tripTracking?.startedAt || '',
      tripEndedAt: tla.tripTracking?.endedAt || '',
      lessorLegalName: tla.lessor?.legalName || '',
      lessorAddress: tla.lessor?.address || '',
      lessorDotNumber: tla.lessor?.dotNumber || '',
      lessorMcNumber: tla.lessor?.mcNumber || '',
      lessorContactEmail: tla.lessor?.contactEmail || '',
      lessorPhone: tla.lessor?.phone || '',
      lesseeLegalName: tla.lessee?.legalName || '',
      lesseeAddress: tla.lessee?.address || '',
      lesseeDotNumber: tla.lessee?.dotNumber || '',
      lesseeMcNumber: tla.lessee?.mcNumber || '',
      lesseeContactEmail: tla.lessee?.contactEmail || '',
      lesseePhone: tla.lessee?.phone || '',
    });
    setEditingTLA(tla);
    setSelectedTLA(null);
  };

  const handleEditTLA = async () => {
    if (!firestore || !editingTLA || !adminUser) return;
    setIsProcessing(true);
    try {
      const payload: Record<string, any> = {
        updatedAt: new Date().toISOString(),
        updatedBy: adminUser.uid,
        updatedByAdmin: true,
      };
      const setIfPresent = (key: string, val: string) => {
        if (val !== '' && val !== undefined && val !== null) payload[key] = val;
      };

      const amountNum = Number(editForm.paymentAmount);
      if (editForm.paymentAmount !== '' && !Number.isNaN(amountNum)) payload['payment.amount'] = amountNum;
      setIfPresent('payment.dueDate', editForm.paymentDueDate);
      if (editForm.insuranceOption) payload['insurance.option'] = editForm.insuranceOption;
      setIfPresent('insurance.confirmedAt', editForm.insuranceConfirmedAt);
      setIfPresent('tripTracking.startedAt', editForm.tripStartedAt);
      setIfPresent('tripTracking.endedAt', editForm.tripEndedAt);
      setIfPresent('lessor.legalName', editForm.lessorLegalName);
      setIfPresent('lessor.address', editForm.lessorAddress);
      setIfPresent('lessor.dotNumber', editForm.lessorDotNumber);
      setIfPresent('lessor.mcNumber', editForm.lessorMcNumber);
      setIfPresent('lessor.contactEmail', editForm.lessorContactEmail);
      setIfPresent('lessor.phone', editForm.lessorPhone);
      setIfPresent('lessee.legalName', editForm.lesseeLegalName);
      setIfPresent('lessee.address', editForm.lesseeAddress);
      setIfPresent('lessee.dotNumber', editForm.lesseeDotNumber);
      setIfPresent('lessee.mcNumber', editForm.lesseeMcNumber);
      setIfPresent('lessee.contactEmail', editForm.lesseeContactEmail);
      setIfPresent('lessee.phone', editForm.lesseePhone);

      await updateDoc(doc(firestore, 'tlas', editingTLA.id), payload);

      await logAuditAction(firestore, {
        action: 'tla_updated',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || '',
        targetType: 'tla',
        targetId: editingTLA.id,
        targetName: `${editingTLA.trip?.origin || '?'} → ${editingTLA.trip?.destination || '?'}`,
        reason: 'Updated via admin console',
      });

      showSuccess('TLA updated successfully');
      setEditingTLA(null);
      fetchTLAs();
    } catch (error: any) {
      showError(error.message || 'Failed to update TLA');
    } finally {
      setIsProcessing(false);
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline">TLA Management</h1>
          <p className="text-muted-foreground">View and manage Trip Lease Agreements</p>
        </div>
        <div className="flex gap-2">
          {canDelete && selectedTLAIds.size > 0 && (
            <Button variant="destructive" onClick={() => setShowBulkDeleteDialog(true)}>
              <Trash2 className="h-4 w-4 mr-2" />Delete ({selectedTLAIds.size})
            </Button>
          )}
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
                {canDelete && (
                  <TableHead className="w-12">
                    <Checkbox
                      checked={filteredTLAs.length > 0 && selectedTLAIds.size === filteredTLAs.length}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                )}
                <TableHead>Route</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Lessor</TableHead>
                <TableHead>Lessee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? <TableSkeleton /> : filteredTLAs.length > 0 ? (
                filteredTLAs.map(tla => (
                  <TableRow key={tla.id} className="hover:bg-muted/50">
                    {canDelete && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedTLAIds.has(tla.id)}
                          onCheckedChange={() => toggleSelectTLA(tla.id)}
                          aria-label={`Select TLA ${tla.trip?.origin} to ${tla.trip?.destination}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1">{tla.trip?.origin}<ArrowRight className="h-3 w-3 text-muted-foreground" />{tla.trip?.destination}</div>
                    </TableCell>
                    <TableCell>{tla.driver?.name || '-'}</TableCell>
                    <TableCell>{tla.lessor?.legalName || '-'}</TableCell>
                    <TableCell>{tla.lessee?.legalName || '-'}</TableCell>
                    <TableCell><Badge variant={getStatusBadgeVariant(tla.status)}>{tla.status.replace('_', ' ')}</Badge></TableCell>
                    <TableCell>${tla.payment?.amount?.toLocaleString() || '-'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{tla.createdAt ? formatDistanceToNow(new Date(tla.createdAt), { addSuffix: true }) : '-'}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => setSelectedTLA(tla)}>
                            <Eye className="h-4 w-4 mr-2" />View Details
                          </DropdownMenuItem>
                          {canEditTLA && (
                            <DropdownMenuItem onClick={() => handleOpenEditTLA(tla)}>
                              <Edit2 className="h-4 w-4 mr-2" />Edit
                            </DropdownMenuItem>
                          )}
                          {canRefund && tla.matchId && (
                            <DropdownMenuItem onClick={() => handleOpenRefund(tla)} disabled={isLookingUpRefund}>
                              <DollarSign className="h-4 w-4 mr-2" />Process Refund
                            </DropdownMenuItem>
                          )}
                          {canVoidTLA(tla) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setVoidingTLA(tla)} className="text-destructive">
                                <Ban className="h-4 w-4 mr-2" />Void TLA
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={canDelete ? 9 : 8} className="h-24 text-center">
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
                <div />
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

      {/* Edit TLA Dialog */}
      <Dialog open={!!editingTLA} onOpenChange={(open) => !open && setEditingTLA(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="font-headline">Edit TLA</DialogTitle>
            <DialogDescription>
              {editingTLA?.trip?.origin} → {editingTLA?.trip?.destination}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] pr-4">
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-200">
                The bilateral compliance snapshot on this TLA is patent-relevant and cannot be edited.
                Empty fields are left untouched (existing values preserved).
              </div>

              <p className="text-sm font-medium text-muted-foreground">Payment</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-tla-amount">Amount ($)</Label>
                  <Input id="edit-tla-amount" type="number" value={editForm.paymentAmount} onChange={(e) => setEditForm(f => ({ ...f, paymentAmount: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-tla-due">Due Date</Label>
                  <Input id="edit-tla-due" type="date" value={editForm.paymentDueDate} onChange={(e) => setEditForm(f => ({ ...f, paymentDueDate: e.target.value }))} />
                </div>
              </div>

              <div className="pt-4 border-t space-y-4">
                <p className="text-sm font-medium text-muted-foreground">Insurance</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-tla-ins-option">Insurance Option</Label>
                    <Select value={editForm.insuranceOption || 'unchanged'} onValueChange={(v) => setEditForm(f => ({ ...f, insuranceOption: v === 'unchanged' ? '' : (v as '' | 'existing_policy' | 'trip_coverage') }))}>
                      <SelectTrigger id="edit-tla-ins-option"><SelectValue placeholder="Leave unchanged" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unchanged">Leave unchanged</SelectItem>
                        <SelectItem value="existing_policy">Existing policy</SelectItem>
                        <SelectItem value="trip_coverage">Trip coverage</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-tla-ins-confirmed">Confirmed At</Label>
                    <Input id="edit-tla-ins-confirmed" type="datetime-local" value={editForm.insuranceConfirmedAt} onChange={(e) => setEditForm(f => ({ ...f, insuranceConfirmedAt: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t space-y-4">
                <p className="text-sm font-medium text-muted-foreground">Trip Tracking <span className="font-normal">(support corrections only)</span></p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-tla-started">Started At</Label>
                    <Input id="edit-tla-started" type="datetime-local" value={editForm.tripStartedAt} onChange={(e) => setEditForm(f => ({ ...f, tripStartedAt: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-tla-ended">Ended At</Label>
                    <Input id="edit-tla-ended" type="datetime-local" value={editForm.tripEndedAt} onChange={(e) => setEditForm(f => ({ ...f, tripEndedAt: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t space-y-4">
                <p className="text-sm font-medium text-muted-foreground">Lessor (Driver Provider)</p>
                <div className="space-y-2">
                  <Label htmlFor="edit-lessor-legal">Legal Name</Label>
                  <Input id="edit-lessor-legal" value={editForm.lessorLegalName} onChange={(e) => setEditForm(f => ({ ...f, lessorLegalName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-lessor-address">Address</Label>
                  <Input id="edit-lessor-address" value={editForm.lessorAddress} onChange={(e) => setEditForm(f => ({ ...f, lessorAddress: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-lessor-dot">DOT Number</Label>
                    <Input id="edit-lessor-dot" value={editForm.lessorDotNumber} onChange={(e) => setEditForm(f => ({ ...f, lessorDotNumber: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-lessor-mc">MC Number</Label>
                    <Input id="edit-lessor-mc" value={editForm.lessorMcNumber} onChange={(e) => setEditForm(f => ({ ...f, lessorMcNumber: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-lessor-email">Email</Label>
                    <Input id="edit-lessor-email" type="email" value={editForm.lessorContactEmail} onChange={(e) => setEditForm(f => ({ ...f, lessorContactEmail: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-lessor-phone">Phone</Label>
                    <Input id="edit-lessor-phone" value={editForm.lessorPhone} onChange={(e) => setEditForm(f => ({ ...f, lessorPhone: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t space-y-4">
                <p className="text-sm font-medium text-muted-foreground">Lessee (Hiring Carrier)</p>
                <div className="space-y-2">
                  <Label htmlFor="edit-lessee-legal">Legal Name</Label>
                  <Input id="edit-lessee-legal" value={editForm.lesseeLegalName} onChange={(e) => setEditForm(f => ({ ...f, lesseeLegalName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-lessee-address">Address</Label>
                  <Input id="edit-lessee-address" value={editForm.lesseeAddress} onChange={(e) => setEditForm(f => ({ ...f, lesseeAddress: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-lessee-dot">DOT Number</Label>
                    <Input id="edit-lessee-dot" value={editForm.lesseeDotNumber} onChange={(e) => setEditForm(f => ({ ...f, lesseeDotNumber: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-lessee-mc">MC Number</Label>
                    <Input id="edit-lessee-mc" value={editForm.lesseeMcNumber} onChange={(e) => setEditForm(f => ({ ...f, lesseeMcNumber: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-lessee-email">Email</Label>
                    <Input id="edit-lessee-email" type="email" value={editForm.lesseeContactEmail} onChange={(e) => setEditForm(f => ({ ...f, lesseeContactEmail: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-lessee-phone">Phone</Label>
                    <Input id="edit-lessee-phone" value={editForm.lesseePhone} onChange={(e) => setEditForm(f => ({ ...f, lesseePhone: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTLA(null)}>Cancel</Button>
            <Button onClick={handleEditTLA} disabled={isProcessing}>
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund Modal */}
      {refundPayment && refundOwnerOp && (
        <RefundModal
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setRefundPayment(null);
              setRefundOwnerOp(null);
            }
          }}
          payment={refundPayment}
          ownerOperator={refundOwnerOp}
          onRefundComplete={() => {
            setRefundPayment(null);
            setRefundOwnerOp(null);
            fetchTLAs();
          }}
        />
      )}

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

      {/* Bulk Delete Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedTLAIds.size} TLAs</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{selectedTLAIds.size} selected TLAs</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={isProcessing} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</> : `Delete ${selectedTLAIds.size} TLAs`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
