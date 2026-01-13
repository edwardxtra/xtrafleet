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
import { collection, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { Search, Link2, RefreshCw, ArrowRight, Ban, Download, Loader2 } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import type { Match, MatchStatus } from '@/lib/data';
import { logAuditAction } from '@/lib/audit';
import { showSuccess, showError } from '@/lib/toast-utils';

export default function AdminMatchesPage() {
  const firestore = useFirestore();
  const { user: adminUser } = useUser();
  const [matches, setMatches] = useState<Match[]>([]);
  const [filteredMatches, setFilteredMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [cancellingMatch, setCancellingMatch] = useState<Match | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-headline">Match Management</h1>
          <p className="text-muted-foreground">View and manage all matches across the platform</p>
        </div>
        <div className="flex gap-2">
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
                <TableHead>Route</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Load Owner</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? <TableSkeleton /> : filteredMatches.length > 0 ? (
                filteredMatches.map(match => (
                  <TableRow key={match.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedMatch(match)}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1">{match.loadSnapshot?.origin}<ArrowRight className="h-3 w-3 text-muted-foreground" />{match.loadSnapshot?.destination}</div>
                    </TableCell>
                    <TableCell>{match.driverSnapshot?.name || match.driverName || '-'}</TableCell>
                    <TableCell>{match.loadOwnerName || '-'}</TableCell>
                    <TableCell><Badge variant={getStatusBadgeVariant(match.status)}>{match.status.replace('_', ' ')}</Badge></TableCell>
                    <TableCell>{match.matchScore}/100</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{match.createdAt ? formatDistanceToNow(new Date(match.createdAt), { addSuffix: true }) : '-'}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
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
                {canCancelMatch(selectedMatch) && (
                  <Button variant="destructive" size="sm" onClick={() => setCancellingMatch(selectedMatch)}>
                    <Ban className="h-4 w-4 mr-2" />Cancel Match
                  </Button>
                )}
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
    </div>
  );
}
