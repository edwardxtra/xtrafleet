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
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { collection, getDocs, doc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { Search, Link2, RefreshCw, ArrowRight, Ban, Download, Loader2, Trash2, Edit2, MoreHorizontal, Eye } from 'lucide-react';
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
import type { Match, MatchStatus } from '@/lib/data';
import { logAuditAction } from '@/lib/audit';
import { showSuccess, showError } from '@/lib/toast-utils';

type EditableMatchFields = {
  originalRate: string;
  originalPickupDate: string;
  originalDeliveryDate: string;
  originalNotes: string;
  hasCounterTerms: boolean;
  counterRate: string;
  counterPickupDate: string;
  counterDeliveryDate: string;
  counterNotes: string;
  status: '' | MatchStatus;
};

export default function AdminMatchesPage() {
  const firestore = useFirestore();
  const { user: adminUser } = useUser();
  const { hasPermission } = useAdminRole();
  const [matches, setMatches] = useState<Match[]>([]);
  const [filteredMatches, setFilteredMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [cancellingMatch, setCancellingMatch] = useState<Match | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [editForm, setEditForm] = useState<EditableMatchFields>({
    originalRate: '',
    originalPickupDate: '',
    originalDeliveryDate: '',
    originalNotes: '',
    hasCounterTerms: false,
    counterRate: '',
    counterPickupDate: '',
    counterDeliveryDate: '',
    counterNotes: '',
    status: '',
  });

  const canDelete = hasPermission('matches:delete');
  const canEditMatch = hasPermission('matches:cancel');
  const canActOnBehalf = hasPermission('users:create');

  const [acceptingOnBehalfMatch, setAcceptingOnBehalfMatch] = useState<Match | null>(null);
  const [isAcceptingOnBehalf, setIsAcceptingOnBehalf] = useState(false);

  const handleAcceptOnBehalf = async (match: Match, actingOnBehalfOf: string) => {
    if (!firestore || !adminUser) return;
    setIsAcceptingOnBehalf(true);
    try {
      const res = await fetch('/api/matches/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: match.id, actingOnBehalfOf }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to accept match on behalf.');
      }
      if (data.complianceWarning && data.complianceMessage) {
        showSuccess(`Match formed with a compliance warning: ${data.complianceMessage}`);
      } else {
        showSuccess('Match accepted on behalf of the selected party.');
      }
      setAcceptingOnBehalfMatch(null);
      fetchMatches();
    } catch (e: any) {
      showError(e?.message || 'Failed to accept match on behalf.');
    } finally {
      setIsAcceptingOnBehalf(false);
    }
  };

  const fetchMatches = async () => {
    if (!firestore) return;
    setIsLoading(true);
    try {
      const matchesSnap = await getDocs(collection(firestore, 'matches'));
      const matchesData = matchesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Match[];
      matchesData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setMatches(matchesData);
      setFilteredMatches(matchesData);
    } catch (error) {
      console.error('Error fetching matches:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchMatches(); }, [firestore]);

  useEffect(() => {
    let filtered = matches;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(match =>
        match.loadSnapshot?.origin?.toLowerCase().includes(q) ||
        match.loadSnapshot?.destination?.toLowerCase().includes(q) ||
        match.driverSnapshot?.name?.toLowerCase().includes(q) ||
        match.loadOwnerName?.toLowerCase().includes(q) ||
        match.driverOwnerName?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter(match => match.status === statusFilter);
    }
    setFilteredMatches(filtered);
  }, [searchQuery, statusFilter, matches]);

  const handleBulkDelete = async () => {
    if (!firestore || !adminUser || selectedMatchIds.size === 0) return;

    setIsProcessing(true);
    try {
      let deletedCount = 0;

      for (const matchId of selectedMatchIds) {
        const matchRef = doc(firestore, 'matches', matchId);
        await deleteDoc(matchRef);
        deletedCount++;
      }

      await logAuditAction(firestore, {
        action: 'match_deleted',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || '',
        targetType: 'match',
        targetId: 'bulk',
        targetName: `${deletedCount} matches`,
        reason: 'Bulk deleted via admin console',
        details: { count: deletedCount, matchIds: Array.from(selectedMatchIds) },
      });

      showSuccess(`${deletedCount} matches deleted successfully`);
      setSelectedMatchIds(new Set());
      setShowBulkDeleteDialog(false);
      fetchMatches();
    } catch (error: any) {
      showError(error.message || 'Failed to delete matches');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedMatchIds.size === filteredMatches.length) {
      setSelectedMatchIds(new Set());
    } else {
      setSelectedMatchIds(new Set(filteredMatches.map(m => m.id)));
    }
  };

  const toggleSelectMatch = (matchId: string) => {
    const newSelected = new Set(selectedMatchIds);
    if (newSelected.has(matchId)) {
      newSelected.delete(matchId);
    } else {
      newSelected.add(matchId);
    }
    setSelectedMatchIds(newSelected);
  };

  const handleCancelMatch = async () => {
    if (!firestore || !cancellingMatch || !adminUser) return;
    setIsProcessing(true);
    try {
      // Update match status
      await updateDoc(doc(firestore, 'matches', cancellingMatch.id), {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledBy: adminUser.uid,
        cancelReason: cancelReason,
      });

      // CRITICAL FIX: Also cancel the associated TLA if it exists
      if (cancellingMatch.tlaId) {
        try {
          const tlaRef = doc(firestore, 'tlas', cancellingMatch.tlaId);
          const tlaDoc = await getDoc(tlaRef);
          
          if (tlaDoc.exists()) {
            await updateDoc(tlaRef, {
              status: 'cancelled',
              cancelledAt: new Date().toISOString(),
              cancelledBy: adminUser.uid,
              cancelReason: `Match cancelled by admin: ${cancelReason}`,
            });
            console.log('✅ TLA cancelled:', cancellingMatch.tlaId);
          }
        } catch (tlaError) {
          console.error('Failed to cancel TLA:', tlaError);
          // Don't fail the whole operation if TLA update fails
        }
      }

      await logAuditAction(firestore, {
        action: 'match_cancelled',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || '',
        targetType: 'match',
        targetId: cancellingMatch.id,
        targetName: `${cancellingMatch.loadSnapshot?.origin} → ${cancellingMatch.loadSnapshot?.destination}`,
        reason: cancelReason,
        details: {
          driver: cancellingMatch.driverSnapshot?.name,
          loadOwner: cancellingMatch.loadOwnerName,
          driverOwner: cancellingMatch.driverOwnerName,
          rate: cancellingMatch.originalTerms?.rate,
          tlaId: cancellingMatch.tlaId,
        },
      });

      showSuccess('Match and associated TLA cancelled successfully');
      setCancellingMatch(null);
      setCancelReason('');
      setSelectedMatch(null);
      fetchMatches();
    } catch (error: any) {
      showError(error.message || 'Failed to cancel match');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = () => {
    const headers = ['Route', 'Driver', 'Load Owner', 'Driver Owner', 'Status', 'Score', 'Rate', 'Created'];
    const csvContent = [
      headers.join(','),
      ...filteredMatches.map(match => [
        `"${match.loadSnapshot?.origin} → ${match.loadSnapshot?.destination}"`,
        `"${match.driverSnapshot?.name || ''}"`,
        `"${match.loadOwnerName || ''}"`,
        `"${match.driverOwnerName || ''}"`,
        `"${match.status}"`,
        match.matchScore,
        match.originalTerms?.rate || 0,
        `"${match.createdAt || ''}"`,
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `matches-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    if (firestore && adminUser) {
      logAuditAction(firestore, {
        action: 'data_exported',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || '',
        targetType: 'system',
        targetId: 'matches',
        targetName: 'Matches Export',
        details: { count: filteredMatches.length },
      });
    }
  };

  const handleOpenEditMatch = (match: Match) => {
    setEditForm({
      originalRate: match.originalTerms?.rate != null ? String(match.originalTerms.rate) : '',
      originalPickupDate: match.originalTerms?.pickupDate || '',
      originalDeliveryDate: match.originalTerms?.deliveryDate || '',
      originalNotes: match.originalTerms?.notes || '',
      hasCounterTerms: !!match.counterTerms,
      counterRate: match.counterTerms?.rate != null ? String(match.counterTerms.rate) : '',
      counterPickupDate: match.counterTerms?.pickupDate || '',
      counterDeliveryDate: match.counterTerms?.deliveryDate || '',
      counterNotes: match.counterTerms?.notes || '',
      status: '',
    });
    setEditingMatch(match);
    setSelectedMatch(null);
  };

  const handleEditMatch = async () => {
    if (!firestore || !editingMatch || !adminUser) return;
    setIsProcessing(true);
    try {
      const originalRateNum = Number(editForm.originalRate);
      const originalTerms: Record<string, any> = {
        rate: Number.isNaN(originalRateNum) ? 0 : originalRateNum,
      };
      if (editForm.originalPickupDate) originalTerms.pickupDate = editForm.originalPickupDate;
      if (editForm.originalDeliveryDate) originalTerms.deliveryDate = editForm.originalDeliveryDate;
      if (editForm.originalNotes) originalTerms.notes = editForm.originalNotes;

      const payload: Record<string, any> = {
        originalTerms,
        updatedAt: new Date().toISOString(),
        updatedBy: adminUser.uid,
        updatedByAdmin: true,
      };

      if (editForm.hasCounterTerms) {
        const counterRateNum = Number(editForm.counterRate);
        const counterTerms: Record<string, any> = {
          rate: Number.isNaN(counterRateNum) ? 0 : counterRateNum,
        };
        if (editForm.counterPickupDate) counterTerms.pickupDate = editForm.counterPickupDate;
        if (editForm.counterDeliveryDate) counterTerms.deliveryDate = editForm.counterDeliveryDate;
        if (editForm.counterNotes) counterTerms.notes = editForm.counterNotes;
        payload.counterTerms = counterTerms;
      }
      if (editForm.status) payload.status = editForm.status;

      await updateDoc(doc(firestore, 'matches', editingMatch.id), payload);

      await logAuditAction(firestore, {
        action: 'match_updated',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || '',
        targetType: 'match',
        targetId: editingMatch.id,
        targetName: `${editingMatch.loadSnapshot?.origin || '?'} → ${editingMatch.loadSnapshot?.destination || '?'}`,
        reason: 'Updated via admin console',
        details: {
          statusChanged: !!editForm.status,
          counterTermsSet: editForm.hasCounterTerms,
        },
      });

      showSuccess('Match updated successfully');
      setEditingMatch(null);
      fetchMatches();
    } catch (error: any) {
      showError(error.message || 'Failed to update match');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadgeVariant = (status: MatchStatus) => {
    switch (status) {
      case 'pending': return 'secondary';
      case 'accepted': case 'tla_signed': case 'completed': return 'default';
      case 'declined': case 'expired': case 'cancelled': return 'destructive';
      case 'countered': case 'tla_pending': case 'in_progress': return 'outline';
      default: return 'secondary';
    }
  };

  const canCancelMatch = (match: Match) => {
    return ['pending', 'accepted', 'countered', 'tla_pending'].includes(match.status);
  };

  const TableSkeleton = () => (
    <>{[1,2,3,4,5].map(i => (
      <TableRow key={i}>
        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        <TableCell><Skeleton className="h-6 w-20" /></TableCell>
        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      </TableRow>
    ))}</>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline">Match Management</h1>
          <p className="text-muted-foreground">View and manage all matches across the platform</p>
        </div>
        <div className="flex gap-2">
          {canDelete && selectedMatchIds.size > 0 && (
            <Button variant="destructive" onClick={() => setShowBulkDeleteDialog(true)}>
              <Trash2 className="h-4 w-4 mr-2" />Delete ({selectedMatchIds.size})
            </Button>
          )}
          <Button variant="outline" onClick={handleExport} disabled={filteredMatches.length === 0}>
            <Download className="h-4 w-4 mr-2" />Export CSV
          </Button>
          <Button variant="outline" onClick={fetchMatches} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <CardTitle className="font-headline">All Matches</CardTitle>
              <CardDescription>{filteredMatches.length} total matches</CardDescription>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search matches..." className="pl-8" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="declined">Declined</SelectItem>
                  <SelectItem value="countered">Countered</SelectItem>
                  <SelectItem value="tla_pending">TLA Pending</SelectItem>
                  <SelectItem value="tla_signed">TLA Signed</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
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
                      checked={filteredMatches.length > 0 && selectedMatchIds.size === filteredMatches.length}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                )}
                <TableHead>Route</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Load Owner</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? <TableSkeleton /> : filteredMatches.length > 0 ? (
                filteredMatches.map(match => (
                  <TableRow key={match.id} className="hover:bg-muted/50">
                    {canDelete && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedMatchIds.has(match.id)}
                          onCheckedChange={() => toggleSelectMatch(match.id)}
                          aria-label={`Select match ${match.loadSnapshot?.origin} to ${match.loadSnapshot?.destination}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1">{match.loadSnapshot?.origin}<ArrowRight className="h-3 w-3 text-muted-foreground" />{match.loadSnapshot?.destination}</div>
                    </TableCell>
                    <TableCell>{match.driverSnapshot?.name || match.driverName || '-'}</TableCell>
                    <TableCell>{match.loadOwnerName || '-'}</TableCell>
                    <TableCell><Badge variant={getStatusBadgeVariant(match.status)}>{match.status.replace('_', ' ')}</Badge></TableCell>
                    <TableCell>{match.matchScore}/100</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{match.createdAt ? formatDistanceToNow(new Date(match.createdAt), { addSuffix: true }) : '-'}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => setSelectedMatch(match)}>
                            <Eye className="h-4 w-4 mr-2" />View Details
                          </DropdownMenuItem>
                          {canEditMatch && (
                            <DropdownMenuItem onClick={() => handleOpenEditMatch(match)}>
                              <Edit2 className="h-4 w-4 mr-2" />Edit
                            </DropdownMenuItem>
                          )}
                          {canActOnBehalf && (match.status === 'pending' || match.status === 'countered') && (
                            <DropdownMenuItem onClick={() => setAcceptingOnBehalfMatch(match)}>
                              <ArrowRight className="h-4 w-4 mr-2" />Accept on behalf of…
                            </DropdownMenuItem>
                          )}
                          {canCancelMatch(match) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setCancellingMatch(match)} className="text-destructive">
                                <Ban className="h-4 w-4 mr-2" />Cancel Match
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
                  <TableCell colSpan={canDelete ? 8 : 7} className="h-24 text-center">
                    <Link2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No matches found</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Match Details Dialog */}
      <Dialog open={!!selectedMatch} onOpenChange={(open) => !open && setSelectedMatch(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-headline">Match Details</DialogTitle>
            <DialogDescription>{selectedMatch?.loadSnapshot?.origin} → {selectedMatch?.loadSnapshot?.destination}</DialogDescription>
          </DialogHeader>
          {selectedMatch && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={getStatusBadgeVariant(selectedMatch.status)}>{selectedMatch.status.replace('_', ' ')}</Badge>
                  <span className="text-sm text-muted-foreground">Score: {selectedMatch.matchScore}/100</span>
                </div>
                <div />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-sm text-muted-foreground">Load Owner</p><p className="font-medium">{selectedMatch.loadOwnerName || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Driver Owner</p><p className="font-medium">{selectedMatch.driverOwnerName || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Driver</p><p className="font-medium">{selectedMatch.driverSnapshot?.name || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Vehicle</p><p className="font-medium">{selectedMatch.driverSnapshot?.vehicleType || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Cargo</p><p className="font-medium">{selectedMatch.loadSnapshot?.cargo || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Weight</p><p className="font-medium">{selectedMatch.loadSnapshot?.weight?.toLocaleString() || '-'} lbs</p></div>
                <div><p className="text-sm text-muted-foreground">Rate</p><p className="font-medium">${selectedMatch.originalTerms?.rate?.toLocaleString() || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Created</p><p className="font-medium">{selectedMatch.createdAt ? format(new Date(selectedMatch.createdAt), 'PPp') : '-'}</p></div>
              </div>

              {selectedMatch.declineReason && (
                <div className="pt-4 border-t"><p className="text-sm text-muted-foreground">Decline Reason</p><p className="text-sm">{selectedMatch.declineReason}</p></div>
              )}

              {(selectedMatch as any).cancelReason && (
                <div className="pt-4 border-t bg-red-50 p-3 rounded-lg">
                  <p className="text-sm font-medium text-red-800">Cancelled by Admin</p>
                  <p className="text-sm text-red-600">{(selectedMatch as any).cancelReason}</p>
                </div>
              )}

              {selectedMatch.tlaId && (
                <div className="pt-4 border-t"><p className="text-sm text-muted-foreground">TLA ID</p><p className="font-mono text-sm">{selectedMatch.tlaId}</p></div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Match Dialog */}
      <AlertDialog open={!!cancellingMatch} onOpenChange={(open) => { if (!open) { setCancellingMatch(null); setCancelReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Match</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the match for <strong>{cancellingMatch?.loadSnapshot?.origin} → {cancellingMatch?.loadSnapshot?.destination}</strong>. 
              Both parties will be notified{cancellingMatch?.tlaId && ' and the associated TLA will be cancelled'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="cancel-reason">Reason for cancellation</Label>
            <Textarea
              id="cancel-reason"
              placeholder="Enter the reason for cancelling this match..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Match</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelMatch} disabled={isProcessing || !cancelReason.trim()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cancelling...</> : 'Cancel Match'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Match Dialog */}
      <Dialog open={!!editingMatch} onOpenChange={(open) => !open && setEditingMatch(null)}>
        <DialogContent className="max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="font-headline">Edit Match</DialogTitle>
            <DialogDescription>
              {editingMatch?.loadSnapshot?.origin} → {editingMatch?.loadSnapshot?.destination}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-200">
                Editing a match bypasses the normal request/accept flow. Both parties will see the new terms next time they refresh.
              </div>

              <p className="text-sm font-medium text-muted-foreground">Original Terms</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-original-rate">Rate ($)</Label>
                  <Input id="edit-original-rate" type="number" value={editForm.originalRate} onChange={(e) => setEditForm(f => ({ ...f, originalRate: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-original-pickup">Pickup Date</Label>
                  <Input id="edit-original-pickup" type="date" value={editForm.originalPickupDate} onChange={(e) => setEditForm(f => ({ ...f, originalPickupDate: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-original-delivery">Delivery Date</Label>
                <Input id="edit-original-delivery" type="date" value={editForm.originalDeliveryDate} onChange={(e) => setEditForm(f => ({ ...f, originalDeliveryDate: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-original-notes">Notes</Label>
                <Textarea id="edit-original-notes" rows={2} value={editForm.originalNotes} onChange={(e) => setEditForm(f => ({ ...f, originalNotes: e.target.value }))} />
              </div>

              <div className="pt-4 border-t space-y-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-has-counter"
                    checked={editForm.hasCounterTerms}
                    onCheckedChange={(v) => setEditForm(f => ({ ...f, hasCounterTerms: v === true }))}
                  />
                  <Label htmlFor="edit-has-counter" className="cursor-pointer text-sm font-medium">Counter terms present</Label>
                </div>
                {editForm.hasCounterTerms && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-counter-rate">Counter Rate ($)</Label>
                        <Input id="edit-counter-rate" type="number" value={editForm.counterRate} onChange={(e) => setEditForm(f => ({ ...f, counterRate: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-counter-pickup">Counter Pickup</Label>
                        <Input id="edit-counter-pickup" type="date" value={editForm.counterPickupDate} onChange={(e) => setEditForm(f => ({ ...f, counterPickupDate: e.target.value }))} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-counter-delivery">Counter Delivery</Label>
                      <Input id="edit-counter-delivery" type="date" value={editForm.counterDeliveryDate} onChange={(e) => setEditForm(f => ({ ...f, counterDeliveryDate: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-counter-notes">Counter Notes</Label>
                      <Textarea id="edit-counter-notes" rows={2} value={editForm.counterNotes} onChange={(e) => setEditForm(f => ({ ...f, counterNotes: e.target.value }))} />
                    </div>
                  </>
                )}
              </div>

              <div className="pt-4 border-t space-y-2">
                <Label htmlFor="edit-status">Status override</Label>
                <Select value={editForm.status || 'unchanged'} onValueChange={(v) => setEditForm(f => ({ ...f, status: v === 'unchanged' ? '' : (v as MatchStatus) }))}>
                  <SelectTrigger id="edit-status"><SelectValue placeholder="Leave unchanged" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unchanged">Leave unchanged</SelectItem>
                    <SelectItem value="pending">pending</SelectItem>
                    <SelectItem value="accepted">accepted</SelectItem>
                    <SelectItem value="countered">countered</SelectItem>
                    <SelectItem value="declined">declined</SelectItem>
                    <SelectItem value="expired">expired</SelectItem>
                    <SelectItem value="cancelled">cancelled</SelectItem>
                    <SelectItem value="tla_pending">tla_pending</SelectItem>
                    <SelectItem value="tla_signed">tla_signed</SelectItem>
                    <SelectItem value="in_progress">in_progress</SelectItem>
                    <SelectItem value="completed">completed</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Manual override — bypasses the normal status transitions.</p>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMatch(null)}>Cancel</Button>
            <Button onClick={handleEditMatch} disabled={isProcessing}>
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Accept on behalf of Dialog */}
      <AlertDialog open={!!acceptingOnBehalfMatch} onOpenChange={(open) => { if (!open) setAcceptingOnBehalfMatch(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Accept on behalf of which party?</AlertDialogTitle>
            <AlertDialogDescription>
              The synchronous compliance gate still fires — there is no admin shortcut.
              Pick which side of the match you are acting for.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {acceptingOnBehalfMatch && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-2">
              <p className="font-medium">{acceptingOnBehalfMatch.loadSnapshot?.origin} → {acceptingOnBehalfMatch.loadSnapshot?.destination}</p>
              <div className="grid gap-2">
                <Button
                  variant="outline"
                  disabled={isAcceptingOnBehalf}
                  onClick={() => handleAcceptOnBehalf(acceptingOnBehalfMatch, acceptingOnBehalfMatch.loadOwnerId)}
                  className="justify-start"
                >
                  <span className="font-medium">Load owner</span>
                  <span className="ml-2 text-xs text-muted-foreground truncate">{acceptingOnBehalfMatch.loadOwnerName || acceptingOnBehalfMatch.loadOwnerId}</span>
                </Button>
                <Button
                  variant="outline"
                  disabled={isAcceptingOnBehalf}
                  onClick={() => handleAcceptOnBehalf(acceptingOnBehalfMatch, acceptingOnBehalfMatch.driverOwnerId)}
                  className="justify-start"
                >
                  <span className="font-medium">Driver owner</span>
                  <span className="ml-2 text-xs text-muted-foreground truncate">{acceptingOnBehalfMatch.driverOwnerName || acceptingOnBehalfMatch.driverOwnerId}</span>
                </Button>
              </div>
              {isAcceptingOnBehalf && (
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Running the compliance gate…</p>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAcceptingOnBehalf}>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedMatchIds.size} Matches</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{selectedMatchIds.size} selected matches</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={isProcessing} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</> : `Delete ${selectedMatchIds.size} Matches`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
