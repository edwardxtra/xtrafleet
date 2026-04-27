'use client';

/**
 * DEV-154 phase 5: admin audit view for the unified attestations array.
 * Flattens every owner_operators/{uid}.attestations[] entry into a single
 * timestamped table so compliance can audit who attested to what and when.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { collection, getDocs } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import { Shield, Search } from 'lucide-react';
import { ATTESTATIONS, type AttestationEntry, type AttestationType } from '@/lib/attestations';

interface FlatAttestation extends AttestationEntry {
  ownerUid: string;
  ownerName: string;
}

const SURFACE_LABELS: Record<string, string> = {
  signup: 'Signup',
  profile: 'Profile',
  driver_add: 'Driver Add',
  match_confirm_borrower: 'Match (Borrower)',
  match_confirm_lender: 'Match (Lender)',
  tla: 'TLA',
  post_trip: 'Post-Trip',
};

export default function AdminAttestationsPage() {
  const firestore = useFirestore();
  const [rows, setRows] = useState<FlatAttestation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [surfaceFilter, setSurfaceFilter] = useState<string>('all');

  useEffect(() => {
    async function load() {
      if (!firestore) return;
      try {
        const snap = await getDocs(collection(firestore, 'owner_operators'));
        const flat: FlatAttestation[] = [];
        snap.forEach(docSnap => {
          const data = docSnap.data() as { legalName?: string; companyName?: string; attestations?: AttestationEntry[] };
          const ownerName = data.legalName || data.companyName || docSnap.id;
          (data.attestations || []).forEach(entry => {
            flat.push({ ...entry, ownerUid: docSnap.id, ownerName });
          });
        });
        flat.sort((a, b) => (b.acceptedAt || '').localeCompare(a.acceptedAt || ''));
        setRows(flat);
      } catch (err) {
        console.error('Failed to load attestations:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [firestore]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      const def = ATTESTATIONS[r.type];
      if (surfaceFilter !== 'all' && def?.surface !== surfaceFilter) return false;
      if (!q) return true;
      return (
        r.ownerName.toLowerCase().includes(q) ||
        r.ownerUid.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        r.text.toLowerCase().includes(q) ||
        r.context?.matchId?.toLowerCase().includes(q) ||
        r.context?.driverId?.toLowerCase().includes(q) ||
        r.context?.driverInvitationEmail?.toLowerCase().includes(q) ||
        r.context?.tlaId?.toLowerCase().includes(q)
      );
    });
  }, [rows, search, typeFilter, surfaceFilter]);

  const allTypes = useMemo(
    () => Array.from(new Set(rows.map(r => r.type))).sort() as AttestationType[],
    [rows],
  );
  const allSurfaces = useMemo(
    () => Array.from(new Set(rows.map(r => ATTESTATIONS[r.type]?.surface).filter(Boolean))).sort() as string[],
    [rows],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6" />
          Attestation Audit
        </h1>
        <p className="text-muted-foreground">All attestation entries across the platform, flattened from each owner&apos;s record.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>{filtered.length} of {rows.length} entries</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Owner, type, match/driver/TLA id, email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={surfaceFilter} onValueChange={setSurfaceFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Surface" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All surfaces</SelectItem>
                {allSurfaces.map(s => (
                  <SelectItem key={s} value={s}>{SURFACE_LABELS[s] || s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {allTypes.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No attestations match the current filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Surface</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r, idx) => {
                  const def = ATTESTATIONS[r.type];
                  const surface = def?.surface;
                  const stale = def && r.version < def.v;
                  return (
                    <TableRow key={`${r.ownerUid}-${r.acceptedAt}-${idx}`}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {(() => {
                          try {
                            return format(parseISO(r.acceptedAt), 'yyyy-MM-dd HH:mm');
                          } catch {
                            return r.acceptedAt;
                          }
                        })()}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{r.ownerName}</div>
                        <div className="font-mono text-xs text-muted-foreground">{r.ownerUid}</div>
                      </TableCell>
                      <TableCell className="text-sm">{r.type}</TableCell>
                      <TableCell className="text-xs">{surface ? (SURFACE_LABELS[surface] || surface) : '—'}</TableCell>
                      <TableCell>
                        <Badge variant={stale ? 'outline' : 'default'} className={stale ? 'text-amber-600 border-amber-600' : ''}>
                          v{r.version}{stale && def && ` of v${def.v}`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs space-y-0.5">
                        {r.context?.matchId && <div>match: {r.context.matchId}</div>}
                        {r.context?.tlaId && <div>tla: {r.context.tlaId}</div>}
                        {r.context?.driverId && <div>driver: {r.context.driverId}</div>}
                        {r.context?.driverInvitationToken && <div>invite: {r.context.driverInvitationToken}</div>}
                        {r.context?.driverInvitationEmail && <div className="text-muted-foreground">{r.context.driverInvitationEmail}</div>}
                        {!r.context && <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.ip || '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
