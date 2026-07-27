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
import { useFirestore } from '@/firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { ClipboardList, RefreshCw, Search, Download } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { AuditLogEntry, getActionLabel, getActionColor } from '@/lib/audit';

export default function AdminAuditPage() {
  const firestore = useFirestore();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [actorFilter, setActorFilter] = useState<string>('all');

  const fetchLogs = async () => {
    if (!firestore) return;
    setIsLoading(true);
    
    try {
      const logsQuery = query(
        collection(firestore, 'audit_logs'),
        orderBy('createdAt', 'desc'),
        limit(200)
      );
      const logsSnap = await getDocs(logsQuery);
      const logsData = logsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AuditLogEntry[];
      setLogs(logsData);
      setFilteredLogs(logsData);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [firestore]);

  useEffect(() => {
    let filtered = logs;

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(log => 
        log.adminEmail?.toLowerCase().includes(q) ||
        log.targetName?.toLowerCase().includes(q) ||
        log.targetId?.toLowerCase().includes(q) ||
        log.reason?.toLowerCase().includes(q)
      );
    }

    if (actionFilter !== 'all') {
      filtered = filtered.filter(log => log.action === actionFilter);
    }

    if (actorFilter !== 'all') {
      filtered = filtered.filter(log => log.adminId === actorFilter);
    }

    if (fromDate) {
      const fromMs = new Date(fromDate).getTime();
      filtered = filtered.filter(log => !log.createdAt || new Date(log.createdAt).getTime() >= fromMs);
    }
    if (toDate) {
      // End of selected day, inclusive.
      const toMs = new Date(toDate).getTime() + 24 * 60 * 60 * 1000 - 1;
      filtered = filtered.filter(log => !log.createdAt || new Date(log.createdAt).getTime() <= toMs);
    }

    setFilteredLogs(filtered);
  }, [searchQuery, actionFilter, actorFilter, fromDate, toDate, logs]);

  const acttingAdmins = Array.from(
    new Map(
      logs
        .filter(l => l.adminId)
        .map(l => [l.adminId as string, { id: l.adminId as string, email: l.adminEmail || l.adminId }])
    ).values()
  ).sort((a, b) => a.email.localeCompare(b.email));

  const handleExport = () => {
    const headers = ['Timestamp', 'Action', 'Admin', 'Target Type', 'Target', 'Reason'];
    const csvContent = [
      headers.join(','),
      ...filteredLogs.map(log => [
        `"${log.createdAt || ''}"`,
        `"${getActionLabel(log.action)}"`,
        `"${log.adminEmail || ''}"`,
        `"${log.targetType || ''}"`,
        `"${log.targetName || log.targetId || ''}"`,
        `"${log.reason || ''}"`,
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const TableSkeleton = () => (
    <>
      {[1,2,3,4,5].map(i => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
        </TableRow>
      ))}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-headline">Audit Log</h1>
          <p className="text-muted-foreground">Track all administrative actions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={filteredLogs.length === 0}>
            <Download className="h-4 w-4 mr-2" />Export CSV
          </Button>
          <Button variant="outline" onClick={fetchLogs} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <CardTitle className="font-headline">Activity Log</CardTitle>
              <CardDescription>{filteredLogs.length} entries</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-36"
                aria-label="From date"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-36"
                aria-label="To date"
              />
              <Select value={actorFilter} onValueChange={setActorFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Acting admin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All admins</SelectItem>
                  {acttingAdmins.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="user_suspended">User Suspended</SelectItem>
                  <SelectItem value="user_reactivated">User Reactivated</SelectItem>
                  <SelectItem value="user_updated">User Updated</SelectItem>
                  <SelectItem value="user_activation_resent">Activation Email Sent</SelectItem>
                  <SelectItem value="password_reset_sent">Password Reset Sent</SelectItem>
                  <SelectItem value="driver_updated">Driver Updated</SelectItem>
                  <SelectItem value="load_updated">Load Updated</SelectItem>
                  <SelectItem value="match_updated">Match Updated</SelectItem>
                  <SelectItem value="match_cancelled">Match Cancelled</SelectItem>
                  <SelectItem value="tla_voided">TLA Voided</SelectItem>
                  <SelectItem value="tla_updated">TLA Updated</SelectItem>
                  <SelectItem value="billing_refunded">Payment Refunded</SelectItem>
                  <SelectItem value="attestation_voided">Attestation Voided</SelectItem>
                  <SelectItem value="message_deleted">Message Deleted</SelectItem>
                  <SelectItem value="data_exported">Data Exported</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Reason/Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton />
              ) : filteredLogs.length > 0 ? (
                filteredLogs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      <div>{log.createdAt ? format(new Date(log.createdAt), 'MMM d, yyyy') : '-'}</div>
                      <div className="text-xs text-muted-foreground">
                        {log.createdAt ? format(new Date(log.createdAt), 'h:mm a') : ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getActionColor(log.action)}>
                        {getActionLabel(log.action)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{log.adminEmail || '-'}</TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{log.targetName || '-'}</div>
                      <div className="text-xs text-muted-foreground">{log.targetType}: {log.targetId?.slice(0, 8)}...</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {log.reason || '-'}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <ClipboardList className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No audit logs found</p>
                    <p className="text-xs text-muted-foreground mt-1">Admin actions will appear here</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
