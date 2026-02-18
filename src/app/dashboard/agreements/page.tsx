"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useUser, useFirestore } from "@/firebase";
import { collection, query, where, orderBy, getDocs, or } from "firebase/firestore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Search, Filter, Clock, CheckCircle, Truck, AlertCircle, ArrowRight, Star, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { TLA } from "@/lib/data";
import { DriverRatingModal } from "@/components/driver-rating-modal";

type StatusFilter = "all" | "pending" | "signed" | "in_progress" | "completed";
type SortField = "route" | "driver" | "rate" | "status" | "date";
type SortDirection = "asc" | "desc";

export default function AgreementsPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [tlas, setTlas] = useState<TLA[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [tlaToRate, setTlaToRate] = useState<TLA | null>(null);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    async function fetchTLAs() {
      if (!firestore || !user) return;
      try {
        const q = query(collection(firestore, "tlas"), or(where("lessor.ownerOperatorId", "==", user.uid), where("lessee.ownerOperatorId", "==", user.uid)), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        setTlas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as TLA[]);
      } catch (err) { console.error("Error fetching TLAs:", err); } finally { setIsLoading(false); }
    }
    fetchTLAs();
  }, [firestore, user]);

  const handleSort = (field: SortField) => {
    if (sortField === field) { setSortDirection(p => p === "asc" ? "desc" : "asc"); }
    else { setSortField(field); setSortDirection("asc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDirection === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const statusPriority: Record<string, number> = { pending_lessor: 0, pending_lessee: 0, signed: 1, in_progress: 2, completed: 3, voided: 4 };

  const filteredAndSortedTLAs = useMemo(() => {
    let result = tlas.filter(tla => {
      if (statusFilter !== "all") {
        if (statusFilter === "pending" && !["pending_lessor", "pending_lessee"].includes(tla.status)) return false;
        if (statusFilter !== "pending" && tla.status !== statusFilter) return false;
      }
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        return tla.trip.origin.toLowerCase().includes(s) || tla.trip.destination.toLowerCase().includes(s) || tla.driver.name.toLowerCase().includes(s) || tla.lessor.legalName.toLowerCase().includes(s) || tla.lessee.legalName.toLowerCase().includes(s) || (tla.trip.cargo && tla.trip.cargo.toLowerCase().includes(s));
      }
      return true;
    });
    result.sort((a, b) => {
      let c = 0;
      switch (sortField) {
        case "route": c = `${a.trip.origin} ${a.trip.destination}`.localeCompare(`${b.trip.origin} ${b.trip.destination}`); break;
        case "driver": c = a.driver.name.localeCompare(b.driver.name); break;
        case "rate": c = a.payment.amount - b.payment.amount; break;
        case "status": c = (statusPriority[a.status] ?? 99) - (statusPriority[b.status] ?? 99); break;
        case "date": c = (a.createdAt || "").localeCompare(b.createdAt || ""); break;
      }
      return sortDirection === "asc" ? c : -c;
    });
    return result;
  }, [tlas, statusFilter, searchTerm, sortField, sortDirection]);

  const getStatusBadge = (status: TLA["status"]) => {
    switch (status) {
      case "pending_lessor": case "pending_lessee": return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending Signature</Badge>;
      case "signed": return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Ready to Start</Badge>;
      case "in_progress": return <Badge className="bg-blue-600"><Truck className="h-3 w-3 mr-1" />In Progress</Badge>;
      case "completed": return <Badge className="bg-purple-600"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case "voided": return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Voided</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (ds?: string) => { if (!ds) return "-"; try { return format(parseISO(ds), "MMM d, yyyy"); } catch { return ds; } };
  const getUserRole = (tla: TLA) => { if (!user) return null; if (tla.lessor.ownerOperatorId === user.uid) return "lessor"; if (tla.lessee.ownerOperatorId === user.uid) return "lessee"; return null; };
  const canRate = (tla: TLA) => { if (!user) return false; return tla.lessee.ownerOperatorId === user.uid && tla.status === "completed" && !(tla as any).rated; };

  const handleRateDriver = (tla: TLA) => { setTlaToRate(tla); setRatingModalOpen(true); };
  const handleRatingSuccess = () => { if (tlaToRate) { setTlas(prev => prev.map(t => t.id === tlaToRate.id ? { ...t, rated: true } as TLA : t)); } setTlaToRate(null); };

  const stats = {
    pending: tlas.filter(t => ["pending_lessor", "pending_lessee"].includes(t.status)).length,
    active: tlas.filter(t => ["signed", "in_progress"].includes(t.status)).length,
    completed: tlas.filter(t => t.status === "completed").length,
    total: tlas.length,
  };

  if (isLoading) return (<div className="space-y-6"><Skeleton className="h-8 w-48" /><div className="grid gap-4 md:grid-cols-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-96" /></div>);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-headline flex items-center gap-2"><FileText className="h-6 w-6" />Trip Lease Agreements</h1>
        <p className="text-muted-foreground">Manage all your TLAs in one place</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className={`cursor-pointer transition-colors ${statusFilter === 'pending' ? 'ring-2 ring-primary' : 'hover:bg-muted/50'}`} onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}>
          <CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Pending Signature</p><p className="text-2xl font-bold">{stats.pending}</p></div><Clock className="h-8 w-8 text-yellow-500 opacity-50" /></div></CardContent>
        </Card>
        <Card className={`cursor-pointer transition-colors ${statusFilter === 'in_progress' ? 'ring-2 ring-primary' : 'hover:bg-muted/50'}`} onClick={() => setStatusFilter(statusFilter === 'in_progress' ? 'all' : 'in_progress')}>
          <CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Active Trips</p><p className="text-2xl font-bold">{stats.active}</p></div><Truck className="h-8 w-8 text-blue-500 opacity-50" /></div></CardContent>
        </Card>
        <Card className={`cursor-pointer transition-colors ${statusFilter === 'completed' ? 'ring-2 ring-primary' : 'hover:bg-muted/50'}`} onClick={() => setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed')}>
          <CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Completed</p><p className="text-2xl font-bold">{stats.completed}</p></div><CheckCircle className="h-8 w-8 text-green-500 opacity-50" /></div></CardContent>
        </Card>
        <Card className={`cursor-pointer transition-colors ${statusFilter === 'all' ? 'ring-2 ring-primary' : 'hover:bg-muted/50'}`} onClick={() => setStatusFilter('all')}>
          <CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Total TLAs</p><p className="text-2xl font-bold">{stats.total}</p></div><FileText className="h-8 w-8 text-muted-foreground opacity-50" /></div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>All Agreements</CardTitle><CardDescription>View and manage your trip lease agreements</CardDescription></CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by route, driver, or company..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-full sm:w-48"><Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="Filter by status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending Signature</SelectItem>
                <SelectItem value="signed">Ready to Start</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredAndSortedTLAs.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-4" />
              <h3 className="font-semibold mb-2">No agreements found</h3>
              <p className="text-muted-foreground text-sm">{searchTerm || statusFilter !== "all" ? "Try adjusting your filters" : "TLAs will appear here when you accept or create matches"}</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead><button onClick={() => handleSort("route")} className="flex items-center hover:text-foreground transition-colors font-medium">Route<SortIcon field="route" /></button></TableHead>
                    <TableHead><button onClick={() => handleSort("driver")} className="flex items-center hover:text-foreground transition-colors font-medium">Driver<SortIcon field="driver" /></button></TableHead>
                    <TableHead>Your Role</TableHead>
                    <TableHead><button onClick={() => handleSort("rate")} className="flex items-center hover:text-foreground transition-colors font-medium">Rate<SortIcon field="rate" /></button></TableHead>
                    <TableHead><button onClick={() => handleSort("status")} className="flex items-center hover:text-foreground transition-colors font-medium">Status<SortIcon field="status" /></button></TableHead>
                    <TableHead><button onClick={() => handleSort("date")} className="flex items-center hover:text-foreground transition-colors font-medium">Date<SortIcon field="date" /></button></TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedTLAs.map((tla) => (
                    <TableRow key={tla.id}>
                      <TableCell>
                        <div className="flex items-center gap-1"><span className="font-medium">{tla.trip.origin}</span><ArrowRight className="h-3 w-3 text-muted-foreground" /><span className="font-medium">{tla.trip.destination}</span></div>
                        <p className="text-xs text-muted-foreground">{tla.trip.cargo}</p>
                      </TableCell>
                      <TableCell>{tla.driver.name}</TableCell>
                      <TableCell><Badge variant="outline">{getUserRole(tla) === "lessor" ? "Driver Provider" : "Load Owner"}</Badge></TableCell>
                      <TableCell><span className="font-semibold text-green-600">${tla.payment.amount.toLocaleString()}</span></TableCell>
                      <TableCell>{getStatusBadge(tla.status)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDate(tla.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canRate(tla) && (<Button size="sm" variant="outline" onClick={() => handleRateDriver(tla)} className="text-yellow-600 border-yellow-600 hover:bg-yellow-50"><Star className="h-4 w-4 mr-1" />Rate</Button>)}
                          {(tla as any).rated && (<Badge variant="outline" className="text-green-600 border-green-300"><Star className="h-3 w-3 mr-1 fill-yellow-400 text-yellow-400" />Rated</Badge>)}
                          <Button asChild size="sm"><Link href={`/dashboard/tla/${tla.id}`}>View</Link></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {tlaToRate && <DriverRatingModal open={ratingModalOpen} onOpenChange={setRatingModalOpen} tla={tlaToRate} onSuccess={handleRatingSuccess} />}
    </div>
  );
}
