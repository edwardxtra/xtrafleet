'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useFirestore } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Search, Link2, RefreshCw, ArrowRight } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import type { Match, MatchStatus } from '@/lib/data';

export default function AdminMatchesPage() {
  const firestore = useFirestore();
  const [matches, setMatches] = useState<Match[]>([]);
  const [filteredMatches, setFilteredMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  const fetchMatches = async () => {
    if (!firestore) return;
    setIsLoading(true);
    
    try {
      const matchesSnap = await getDocs(collection(firestore, 'matches'));
      const matchesData = matchesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Match[];
      // Sort by created date descending
      matchesData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setMatches(matchesData);
      setFilteredMatches(matchesData);
    } catch (error) {
      console.error('Error fetching matches:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, [firestore]);

  useEffect(() => {
    let filtered = matches;

    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(match => 
        match.loadSnapshot?.origin?.toLowerCase().includes(query) ||
        match.loadSnapshot?.destination?.toLowerCase().includes(query) ||
        match.driverSnapshot?.name?.toLowerCase().includes(query) ||
        match.loadOwnerName?.toLowerCase().includes(query) ||
        match.driverOwnerName?.toLowerCase().includes(query)
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(match => match.status === statusFilter);
    }

    setFilteredMatches(filtered);
  }, [searchQuery, statusFilter, matches]);

  const getStatusBadgeVariant = (status: MatchStatus) => {
    switch (status) {
      case 'pending': return 'secondary';
      case 'accepted': case 'tla_signed': case 'completed': return 'default';
      case 'declined': case 'expired': case 'cancelled': return 'destructive';
      case 'countered': case 'tla_pending': case 'in_progress': return 'outline';
      default: return 'secondary';
    }
  };

  const TableSkeleton = () => (
    <>
      {[1,2,3,4,5].map(i => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-6 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        </TableRow>
      ))}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-headline">Match Management</h1>
          <p className="text-muted-foreground">View all matches across the platform</p>
        </div>
        <Button variant="outline" onClick={fetchMatches} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
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
                <Input
                  placeholder="Search matches..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
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
              {isLoading ? (
                <TableSkeleton />
              ) : filteredMatches.length > 0 ? (
                filteredMatches.map(match => (
                  <TableRow key={match.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedMatch(match)}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1">
                        {match.loadSnapshot?.origin}
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        {match.loadSnapshot?.destination}
                      </div>
                    </TableCell>
                    <TableCell>{match.driverSnapshot?.name || match.driverName || '-'}</TableCell>
                    <TableCell>{match.loadOwnerName || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(match.status)}>
                        {match.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{match.matchScore}/100</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {match.createdAt ? formatDistanceToNow(new Date(match.createdAt), { addSuffix: true }) : '-'}
                    </TableCell>
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
            <DialogDescription>
              {selectedMatch?.loadSnapshot?.origin} → {selectedMatch?.loadSnapshot?.destination}
            </DialogDescription>
          </DialogHeader>
          {selectedMatch && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant={getStatusBadgeVariant(selectedMatch.status)}>
                  {selectedMatch.status.replace('_', ' ')}
                </Badge>
                <span className="text-sm text-muted-foreground">Score: {selectedMatch.matchScore}/100</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Load Owner</p>
                  <p className="font-medium">{selectedMatch.loadOwnerName || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Driver Owner</p>
                  <p className="font-medium">{selectedMatch.driverOwnerName || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Driver</p>
                  <p className="font-medium">{selectedMatch.driverSnapshot?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Vehicle</p>
                  <p className="font-medium">{selectedMatch.driverSnapshot?.vehicleType || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Cargo</p>
                  <p className="font-medium">{selectedMatch.loadSnapshot?.cargo || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Weight</p>
                  <p className="font-medium">{selectedMatch.loadSnapshot?.weight?.toLocaleString() || '-'} lbs</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Rate</p>
                  <p className="font-medium">${selectedMatch.originalTerms?.rate?.toLocaleString() || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-medium">{selectedMatch.createdAt ? format(new Date(selectedMatch.createdAt), 'PPp') : '-'}</p>
                </div>
              </div>

              {selectedMatch.declineReason && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">Decline Reason</p>
                  <p className="text-sm">{selectedMatch.declineReason}</p>
                </div>
              )}

              {selectedMatch.tlaId && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">TLA ID</p>
                  <p className="font-mono text-sm">{selectedMatch.tlaId}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
