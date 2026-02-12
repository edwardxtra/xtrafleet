'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlusCircle, Truck, AlertCircle, Edit, Trash2, XCircle, Loader2 } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast-utils';
import { LOAD_TYPES, LOAD_STATUSES, isFullyEditable, isLimitedEditable, canDelete, canCancel } from '@/lib/load-types';
import { TRAILER_TYPES } from '@/lib/trailer-types';
import type { Load } from '@/lib/data';
import { format, parseISO } from 'date-fns';

type StatusFilter = 'all' | 'draft' | 'live' | 'completed' | 'cancelled';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'live', label: 'Live' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'live': case 'driver_matched': case 'in_progress': return 'default';
    case 'draft': case 'completed': return 'secondary';
    case 'cancelled': return 'destructive';
    default: return 'outline';
  }
}

function getStatusLabel(status: string): string {
  return LOAD_STATUSES.find(s => s.value === status)?.label || status;
}

function getTrailerTypeLabel(value: string): string {
  return TRAILER_TYPES.find(t => t.value === value)?.label || value;
}

export default function LoadsPage() {
  const router = useRouter();
  const [loads, setLoads] = useState<Load[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StatusFilter>('all');
  const [deleteTarget, setDeleteTarget] = useState<Load | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => { fetchLoads(); }, []);

  const fetchLoads = async () => {
    try {
      setIsLoading(true); setError(null);
      const response = await fetch('/api/loads');
      if (!response.ok) throw new Error('Failed to fetch loads');
      const data = await response.json();
      setLoads(Array.isArray(data) ? data : data.data || []);
    } catch {
      setError('Failed to load your freight loads');
      showError('Failed to load freight loads');
    } finally { setIsLoading(false); }
  };

  const filteredLoads = activeTab === 'all' ? loads : loads.filter(l => (l.status || 'live') === activeTab);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/loads/${deleteTarget.id}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 204) {
        const d = await response.json().catch(() => ({}));
        throw new Error(d.error || 'Failed');
      }
      const s = (deleteTarget.status || 'live') as string;
      if (s === 'draft') {
        setLoads(prev => prev.filter(l => l.id !== deleteTarget.id));
        showSuccess('Draft deleted');
      } else {
        setLoads(prev => prev.map(l => l.id === deleteTarget.id ? { ...l, status: 'cancelled' as any } : l));
        showSuccess('Load cancelled');
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed');
    } finally { setIsDeleting(false); setDeleteTarget(null); }
  };

  const getDeleteText = (load: Load) => {
    const s = (load.status || 'live') as string;
    return s === 'draft'
      ? { title: 'Delete Draft?', desc: 'This draft will be permanently deleted. This action cannot be undone.' }
      : { title: 'Cancel Load?', desc: 'This load will be marked as cancelled and will no longer be visible for matching.' };
  };

  const statusCounts = loads.reduce((acc, l) => { const s = (l.status || 'live') as string; acc[s] = (acc[s] || 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="container py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-headline">Freight Loads</h1>
          <p className="text-muted-foreground mt-1">Manage your posted freight loads and track their status</p>
        </div>
        <Link href="/dashboard/loads/new"><Button><PlusCircle className="h-4 w-4 mr-2" />Post New Load</Button></Link>
      </div>

      {error && <Alert variant="destructive" className="mb-6"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as StatusFilter)} className="mb-6">
        <TabsList>
          {STATUS_TABS.map((tab) => {
            const count = tab.value === 'all' ? loads.length : (statusCounts[tab.value] || 0);
            return (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
                {tab.label}
                {count > 0 && <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">{count}</span>}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {isLoading && <Card><CardContent className="p-6"><div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div></CardContent></Card>}

      {!isLoading && !error && filteredLoads.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Truck className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">{activeTab === 'all' ? 'No loads posted yet' : `No ${getStatusLabel(activeTab).toLowerCase()} loads`}</h3>
            <p className="text-muted-foreground text-center mb-6">{activeTab === 'all' ? 'Get started by posting your first freight load' : 'Loads with this status will appear here'}</p>
            {activeTab === 'all' && <Link href="/dashboard/loads/new"><Button><PlusCircle className="h-4 w-4 mr-2" />Post Your First Load</Button></Link>}
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && filteredLoads.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Load Type</TableHead>
                  <TableHead>Equipment</TableHead>
                  <TableHead className="text-right">Compensation</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLoads.map((load) => {
                  const status = (load.status || 'live') as string;
                  const editable = isFullyEditable(status as any) || isLimitedEditable(status as any);
                  const deletable = canDelete(status as any) || canCancel(status as any);
                  const compensation = load.driverCompensation || load.price || 0;
                  const loadType = load.loadType || load.cargo || '';
                  return (
                    <TableRow key={load.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/dashboard/loads/${load.id}/edit`)}>
                      <TableCell>
                        <div className="font-medium">{load.origin}</div>
                        <div className="text-sm text-muted-foreground">{`\u2192 ${load.destination}`}</div>
                      </TableCell>
                      <TableCell className="text-sm">{load.pickupDate ? format(parseISO(load.pickupDate), 'MMM d, yyyy') : 'N/A'}</TableCell>
                      <TableCell className="text-sm">{LOAD_TYPES.find(t => t.value === loadType)?.label || loadType || 'N/A'}</TableCell>
                      <TableCell className="text-sm">{load.trailerType ? getTrailerTypeLabel(load.trailerType) : 'N/A'}</TableCell>
                      <TableCell className="text-right font-medium">{compensation > 0 ? `$${compensation.toLocaleString()}` : 'N/A'}</TableCell>
                      <TableCell><Badge variant={getStatusBadgeVariant(status)}>{getStatusLabel(status)}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {editable && <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/loads/${load.id}/edit`)}><Edit className="h-4 w-4" /></Button>}
                          {deletable && <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(load)}>{status === 'draft' ? <Trash2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}</Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTarget && getDeleteText(deleteTarget).title}</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget && getDeleteText(deleteTarget).desc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Go Back</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {deleteTarget && ((deleteTarget.status || 'live') === 'draft') ? 'Delete' : 'Cancel Load'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
