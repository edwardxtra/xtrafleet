"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Truck,
  User,
  MapPin,
  Clock,
  DollarSign,
  Building2,
  Inbox,
  Send,
  CheckCircle,
  XCircle,
  MessageSquare,
  AlertCircle,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { useUser, useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, where, orderBy, doc, updateDoc, getDoc, addDoc } from "firebase/firestore";
import type { Match } from "@/lib/data";
import { MatchResponseModal } from "@/components/match-response-modal";
import { format, parseISO, differenceInHours, isPast } from "date-fns";
import { showSuccess, showError, showInfo } from "@/lib/toast-utils";
import { useRouter } from "next/navigation";
import { generateTLA } from "@/lib/tla";
import { notify } from "@/lib/notifications";
import { createConversation } from "@/lib/messaging-utils";

const statusConfig: Record<string, { label: string; variant: "outline" | "default" | "secondary" | "destructive"; icon: React.ElementType; color?: string }> = {
  pending: { label: "Pending", variant: "outline", icon: Clock, color: "text-orange-600" },
  accepted: { label: "Accepted", variant: "default", icon: CheckCircle, color: "text-green-600" },
  countered: { label: "Counter Received", variant: "secondary", icon: MessageSquare, color: "text-blue-600" },
  declined: { label: "Declined", variant: "destructive", icon: XCircle, color: "text-red-600" },
  expired: { label: "Expired", variant: "outline", icon: AlertCircle, color: "text-gray-500" },
  cancelled: { label: "Cancelled", variant: "outline", icon: XCircle, color: "text-gray-500" },
  tla_pending: { label: "TLA Pending", variant: "default", icon: Clock, color: "text-green-600" },
  tla_signed: { label: "TLA Signed", variant: "default", icon: CheckCircle, color: "text-green-600" },
  in_progress: { label: "In Progress", variant: "default", icon: Truck, color: "text-green-600" },
  completed: { label: "Completed", variant: "secondary", icon: CheckCircle, color: "text-gray-600" },
};

export default function RequestsPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("incoming");
  const [selectedIncoming, setSelectedIncoming] = useState<Match | null>(null);
  const [responseModalOpen, setResponseModalOpen] = useState(false);
  const [selectedSent, setSelectedSent] = useState<Match | null>(null);
  const [counterModalOpen, setCounterModalOpen] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);

  const incomingQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, "matches"), where("recipientOwnerId", "==", user.uid), orderBy("createdAt", "desc"));
  }, [firestore, user?.uid]);
  const { data: incomingMatches, isLoading: incomingLoading, error: incomingError } = useCollection<Match>(incomingQuery);

  const sentQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, "matches"), where("loadOwnerId", "==", user.uid), where("initiatedBy", "==", "load_owner"), orderBy("createdAt", "desc"));
  }, [firestore, user?.uid]);
  const { data: sentMatches, isLoading: sentLoading, error: sentError } = useCollection<Match>(sentQuery);

  const isExpired = (match: Match) => isPast(parseISO(match.expiresAt));
  const incomingPending = incomingMatches?.filter(m => m.status === 'pending' && !isExpired(m)) || [];
  const incomingOther = incomingMatches?.filter(m => m.status !== 'pending' || isExpired(m)) || [];
  const sentCountered = sentMatches?.filter(m => m.status === 'countered' && !isExpired(m)) || [];
  const sentPending = sentMatches?.filter(m => m.status === 'pending' && !isExpired(m)) || [];
  const sentOther = sentMatches?.filter(m => (m.status !== 'pending' && m.status !== 'countered') || isExpired(m)) || [];
  const incomingBadge = incomingPending.length;
  const sentBadge = sentCountered.length + sentPending.length;

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Not specified";
    try { return format(parseISO(dateString), "MMM d, yyyy"); } catch { return dateString; }
  };
  const getTimeLeft = (expiresAt: string) => {
    const hours = differenceInHours(parseISO(expiresAt), new Date());
    if (hours <= 0) return "Expired";
    if (hours < 24) return `${hours}h left`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
  };

  const handleRespond = (match: Match) => { if (isExpired(match)) return; setSelectedIncoming(match); setResponseModalOpen(true); };
  const handleViewCounter = (match: Match) => { setSelectedSent(match); setCounterModalOpen(true); };

  const handleAcceptCounter = async () => {
    if (!firestore || !user || !selectedSent) return;
    setIsAccepting(true);
    try {
      const lessorDoc = await getDoc(doc(firestore, `owner_operators/${selectedSent.driverOwnerId}`));
      const lessorInfo = lessorDoc.exists() ? { id: lessorDoc.id, ...lessorDoc.data() } : null;
      const lesseeDoc = await getDoc(doc(firestore, `owner_operators/${selectedSent.loadOwnerId}`));
      const lesseeInfo = lesseeDoc.exists() ? { id: lesseeDoc.id, ...lesseeDoc.data() } : null;
      const driverDoc = await getDoc(doc(firestore, `owner_operators/${selectedSent.driverOwnerId}/drivers/${selectedSent.driverId}`));
      const driverInfo = driverDoc.exists() ? { id: driverDoc.id, ...driverDoc.data() } : null;
      if (!lessorInfo || !lesseeInfo || !driverInfo) throw new Error('Required information not found');
      const loadDoc2 = await getDoc(doc(firestore, `owner_operators/${selectedSent.loadOwnerId}/loads/${selectedSent.loadId}`));
      if (!loadDoc2.exists()) throw new Error('Load not found');
      if (loadDoc2.data().status !== 'Pending') throw new Error(`This load has already been matched (status: ${loadDoc2.data().status}).`);
      const matchWithCounterTerms = { ...selectedSent, originalTerms: selectedSent.counterTerms || selectedSent.originalTerms };
      const tlaData = generateTLA({ match: matchWithCounterTerms, lessorInfo: lessorInfo as any, lesseeInfo: lesseeInfo as any, driverInfo: driverInfo as any });
      const tlaRef = await addDoc(collection(firestore, "tlas"), tlaData);
      try { await createConversation(firestore, selectedSent.driverOwnerId, selectedSent.loadOwnerId, selectedSent.loadId, tlaRef.id); } catch (e) { console.warn('Failed to create conversation:', e); }
      await updateDoc(doc(firestore, `matches/${selectedSent.id}`), { status: 'tla_pending', counterAcceptedAt: new Date().toISOString(), tlaId: tlaRef.id, finalTerms: selectedSent.counterTerms });
      await updateDoc(doc(firestore, `owner_operators/${selectedSent.loadOwnerId}/loads/${selectedSent.loadId}`), { status: 'Matched', matchedAt: new Date().toISOString(), tlaId: tlaRef.id });
      const driverOwnerEmail = (lessorInfo as any).contactEmail || '';
      if (driverOwnerEmail) { notify.matchAccepted({ loadOwnerEmail: driverOwnerEmail, loadOwnerName: (lessorInfo as any).legalName || '', driverName: selectedSent.driverSnapshot.name, loadOrigin: selectedSent.loadSnapshot.origin, loadDestination: selectedSent.loadSnapshot.destination, rate: selectedSent.counterTerms?.rate || selectedSent.originalTerms.rate, tlaId: tlaRef.id }).catch(err => console.error('Notification error:', err)); }
      await addDoc(collection(firestore, "notifications"), { userId: selectedSent.driverOwnerId, type: "counter_accepted", title: "Counter Offer Accepted!", message: `Your counter offer for ${selectedSent.loadSnapshot.origin} \u2192 ${selectedSent.loadSnapshot.destination} was accepted!`, link: "/dashboard/messages", linkText: "Go to Messages", createdAt: new Date().toISOString(), read: false });
      showSuccess("Counter offer accepted! TLA created."); showInfo("You can now message the driver owner."); setCounterModalOpen(false);
      setTimeout(() => { router.push(`/dashboard/tla/${tlaRef.id}`); }, 800);
    } catch (error: any) { console.error("Error accepting counter:", error); showError(error.message || "Failed to accept counter offer."); } finally { setIsAccepting(false); }
  };

  const handleDeclineCounter = async () => {
    if (!firestore || !user || !selectedSent) return;
    setIsDeclining(true);
    try {
      await updateDoc(doc(firestore, `matches/${selectedSent.id}`), { status: 'declined', declinedAt: new Date().toISOString(), declinedBy: 'load_owner', declineReason: 'Counter offer declined' });
      const driverOwnerDoc = await getDoc(doc(firestore, `owner_operators/${selectedSent.driverOwnerId}`));
      const driverOwnerInfo = driverOwnerDoc.exists() ? driverOwnerDoc.data() : null;
      const driverOwnerEmail = driverOwnerInfo?.contactEmail || '';
      if (driverOwnerEmail) { notify.matchDeclined({ loadOwnerEmail: driverOwnerEmail, loadOwnerName: driverOwnerInfo?.legalName || '', driverName: selectedSent.driverSnapshot.name, loadOrigin: selectedSent.loadSnapshot.origin, loadDestination: selectedSent.loadSnapshot.destination, reason: 'Counter offer was not accepted' }).catch(err => console.error('Notification error:', err)); }
      showSuccess("Counter offer declined."); setCounterModalOpen(false); setSelectedSent(null);
    } catch (error: any) { console.error("Error declining counter:", error); showError(error.message || "Failed to decline counter offer."); } finally { setIsDeclining(false); }
  };

  if (incomingLoading || sentLoading) {
    return (<div className="space-y-6"><div><h1 className="text-2xl font-bold font-headline">Match Requests</h1><p className="text-muted-foreground">Loading...</p></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[1,2,3].map(i => (<Card key={i}><CardHeader><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-32" /></CardHeader><CardContent><Skeleton className="h-20 w-full" /></CardContent></Card>))}</div></div>);
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold font-headline">Match Requests</h1><p className="text-muted-foreground">Manage your incoming and sent match requests in one place.</p></div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="incoming" className="flex items-center gap-2"><Inbox className="h-4 w-4" />Incoming{incomingBadge > 0 && <Badge variant="default" className="ml-1 h-5 min-w-5 px-1.5 bg-red-600 hover:bg-red-600">{incomingBadge}</Badge>}</TabsTrigger>
          <TabsTrigger value="sent" className="flex items-center gap-2"><Send className="h-4 w-4" />Sent{sentBadge > 0 && <Badge variant="default" className="ml-1 h-5 min-w-5 px-1.5 bg-red-600 hover:bg-red-600">{sentBadge}</Badge>}</TabsTrigger>
        </TabsList>

        <TabsContent value="incoming" className="space-y-6 mt-4">
          {incomingError ? <Card><CardContent className="py-12 text-center"><p className="text-destructive">Error loading incoming requests. Please refresh.</p></CardContent></Card> : (<>
            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Clock className="h-5 w-5" />Pending Requests ({incomingPending.length})</h2>
              {incomingPending.length === 0 ? (<Card><CardContent className="flex flex-col items-center justify-center py-12"><Inbox className="h-16 w-16 text-muted-foreground mb-4" /><h3 className="text-lg font-semibold">No Pending Requests</h3><p className="text-muted-foreground text-center mt-1">When someone sends a match request for your drivers or loads, it will appear here.</p></CardContent></Card>) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {incomingPending.map(match => { const isForMyDriver = match.initiatedBy === 'load_owner'; const requesterName = isForMyDriver ? match.loadOwnerName : match.driverOwnerName; return (
                    <Card key={match.id} className="border-primary/50"><CardHeader className="pb-2"><div className="flex justify-between items-start"><div><CardTitle className="text-lg flex items-center gap-2"><Truck className="h-4 w-4" />{match.loadSnapshot.origin} &rarr; {match.loadSnapshot.destination}</CardTitle><CardDescription>{match.loadSnapshot.cargo} &bull; {match.loadSnapshot.weight.toLocaleString()} lbs</CardDescription></div><Badge variant="outline" className="text-orange-600 border-orange-600"><Clock className="h-3 w-3 mr-1" />{getTimeLeft(match.expiresAt)}</Badge></div></CardHeader>
                    <CardContent className="space-y-3"><Badge variant={isForMyDriver ? "secondary" : "outline"} className="mb-2">{isForMyDriver ? "Request for your driver" : "Offer for your load"}</Badge><div className="flex items-center gap-2 text-sm"><Building2 className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">From:</span><span className="font-medium">{requesterName}</span></div><div className="flex items-center gap-2 text-sm"><User className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">{isForMyDriver ? "Your Driver:" : "Their Driver:"}</span><span className="font-medium">{match.driverSnapshot.name}</span></div><div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-green-600" /><span className="text-lg font-bold text-green-600">${match.originalTerms.rate.toLocaleString()}</span></div>{match.originalTerms.pickupDate && (<div className="flex items-center gap-2 text-sm"><Clock className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Pickup:</span><span>{formatDate(match.originalTerms.pickupDate)}</span></div>)}</CardContent>
                    <CardFooter><Button className="w-full" onClick={() => handleRespond(match)}>Respond to Request</Button></CardFooter></Card>); })}
                </div>)}
            </div>
            {incomingOther.length > 0 && (<div><h2 className="text-lg font-semibold mb-4">Past Requests</h2><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{incomingOther.map(match => { const expired = isExpired(match); const status = expired ? 'expired' : match.status; const config = statusConfig[status] || statusConfig.expired; const StatusIcon = config.icon; const isForMyDriver = match.initiatedBy === 'load_owner'; const requesterName = isForMyDriver ? match.loadOwnerName : match.driverOwnerName; return (<Card key={match.id} className="opacity-75"><CardHeader className="pb-2"><div className="flex justify-between items-start"><div><CardTitle className="text-lg flex items-center gap-2"><Truck className="h-4 w-4" />{match.loadSnapshot.origin} &rarr; {match.loadSnapshot.destination}</CardTitle><CardDescription>{match.loadSnapshot.cargo} &bull; {match.loadSnapshot.weight.toLocaleString()} lbs</CardDescription></div><Badge variant={config.variant}><StatusIcon className="h-3 w-3 mr-1" />{config.label}</Badge></div></CardHeader><CardContent className="space-y-2"><Badge variant="outline" className="mb-1 text-xs">{isForMyDriver ? "For your driver" : "For your load"}</Badge><div className="flex items-center gap-2 text-sm"><Building2 className="h-4 w-4 text-muted-foreground" /><span className="font-medium">{requesterName}</span></div><div className="flex items-center gap-2 text-sm"><User className="h-4 w-4 text-muted-foreground" /><span>{match.driverSnapshot.name}</span></div><div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-muted-foreground" /><span className="font-medium">${match.originalTerms.rate.toLocaleString()}</span>{match.status === 'countered' && match.counterTerms && (<span className="text-sm text-muted-foreground">&rarr; ${match.counterTerms.rate.toLocaleString()}</span>)}</div></CardContent></Card>); })}</div></div>)}
          </>)}
        </TabsContent>

        <TabsContent value="sent" className="space-y-6 mt-4">
          {sentError ? <Card><CardContent className="py-12 text-center"><p className="text-destructive">Error loading sent requests. Please refresh.</p></CardContent></Card> : (<>
            {sentCountered.length > 0 && (<div><h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><MessageSquare className="h-5 w-5 text-blue-600" />Counter Offers Received ({sentCountered.length})</h2><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{sentCountered.map(match => (<Card key={match.id} className="border-blue-500 border-2"><CardHeader className="pb-2"><div className="flex justify-between items-start"><div><CardTitle className="text-lg flex items-center gap-2"><Truck className="h-4 w-4" />{match.loadSnapshot.origin} &rarr; {match.loadSnapshot.destination}</CardTitle><CardDescription>{match.loadSnapshot.cargo} &bull; {match.loadSnapshot.weight.toLocaleString()} lbs</CardDescription></div><Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><MessageSquare className="h-3 w-3 mr-1" />Counter</Badge></div></CardHeader><CardContent className="space-y-3"><div className="flex items-center gap-2 text-sm"><User className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Driver:</span><span className="font-medium">{match.driverSnapshot.name}</span></div><div className="flex items-center gap-2 text-sm"><Building2 className="h-4 w-4 text-muted-foreground" /><span className="font-medium">{match.driverOwnerName}</span></div><div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Your Rate</p><p className="font-medium line-through text-muted-foreground">${match.originalTerms.rate.toLocaleString()}</p></div><ArrowRight className="h-4 w-4 text-blue-600" /><div><p className="text-xs text-blue-600 font-medium">Counter Rate</p><p className="font-bold text-blue-600 text-lg">${match.counterTerms?.rate.toLocaleString()}</p></div></div>{match.counterTerms?.notes && (<p className="text-xs text-muted-foreground mt-2 pt-2 border-t">&ldquo;{match.counterTerms.notes}&rdquo;</p>)}</div><div className="flex items-center gap-2 text-sm text-orange-600"><Clock className="h-4 w-4" /><span>{getTimeLeft(match.expiresAt)}</span></div></CardContent><CardFooter><Button className="w-full" onClick={() => handleViewCounter(match)}>Review Counter Offer</Button></CardFooter></Card>))}</div></div>)}
            <div><h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Clock className="h-5 w-5" />Awaiting Response ({sentPending.length})</h2>{sentPending.length === 0 ? (<Card><CardContent className="flex flex-col items-center justify-center py-12"><Send className="h-16 w-16 text-muted-foreground mb-4" /><h3 className="text-lg font-semibold">No Pending Requests</h3><p className="text-muted-foreground text-center mt-1">Your sent match requests will appear here.</p></CardContent></Card>) : (<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{sentPending.map(match => (<Card key={match.id}><CardHeader className="pb-2"><div className="flex justify-between items-start"><div><CardTitle className="text-lg flex items-center gap-2"><Truck className="h-4 w-4" />{match.loadSnapshot.origin} &rarr; {match.loadSnapshot.destination}</CardTitle><CardDescription>{match.loadSnapshot.cargo} &bull; {match.loadSnapshot.weight.toLocaleString()} lbs</CardDescription></div><Badge variant="outline" className="text-orange-600 border-orange-600"><Clock className="h-3 w-3 mr-1" />{getTimeLeft(match.expiresAt)}</Badge></div></CardHeader><CardContent className="space-y-2"><div className="flex items-center gap-2 text-sm"><User className="h-4 w-4 text-muted-foreground" /><span className="font-medium">{match.driverSnapshot.name}</span></div><div className="flex items-center gap-2 text-sm"><Building2 className="h-4 w-4 text-muted-foreground" /><span>{match.driverOwnerName}</span></div><div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-green-600" /><span className="font-semibold text-green-600">${match.originalTerms.rate.toLocaleString()}</span></div></CardContent></Card>))}</div>)}</div>
            {sentOther.length > 0 && (<div><h2 className="text-lg font-semibold mb-4">Past Requests</h2><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{sentOther.map(match => { const expired = isExpired(match); const status = expired && match.status === 'pending' ? 'expired' : match.status; const config = statusConfig[status] || statusConfig.expired; const StatusIcon = config.icon; return (<Card key={match.id} className="opacity-75"><CardHeader className="pb-2"><div className="flex justify-between items-start"><div><CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" />{match.loadSnapshot.origin} &rarr; {match.loadSnapshot.destination}</CardTitle><CardDescription className="text-xs">{match.loadSnapshot.cargo}</CardDescription></div><Badge variant={config.variant}><StatusIcon className="h-3 w-3 mr-1" />{config.label}</Badge></div></CardHeader><CardContent className="space-y-1"><div className="flex items-center gap-2 text-sm"><User className="h-4 w-4 text-muted-foreground" /><span>{match.driverSnapshot.name}</span></div><div className="flex items-center gap-2 text-sm"><DollarSign className="h-4 w-4 text-muted-foreground" /><span>${match.originalTerms.rate.toLocaleString()}</span>{match.status === 'countered' && match.counterTerms && (<span className="text-muted-foreground">&rarr; ${match.counterTerms.rate.toLocaleString()}</span>)}</div></CardContent></Card>); })}</div></div>)}
          </>)}
        </TabsContent>
      </Tabs>

      {selectedIncoming && !isExpired(selectedIncoming) && <MatchResponseModal open={responseModalOpen} onOpenChange={setResponseModalOpen} match={selectedIncoming} onSuccess={() => setSelectedIncoming(null)} />}

      <Dialog open={counterModalOpen} onOpenChange={setCounterModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-blue-600" />Counter Offer Received</DialogTitle><DialogDescription>Review the counter offer and decide how to proceed.</DialogDescription></DialogHeader>
          {selectedSent && (<div className="space-y-4 py-4"><div className="p-4 bg-muted/50 rounded-lg"><h4 className="font-medium mb-2">Load</h4><p className="font-semibold">{selectedSent.loadSnapshot.origin} &rarr; {selectedSent.loadSnapshot.destination}</p><p className="text-sm text-muted-foreground">{selectedSent.loadSnapshot.cargo} &bull; {selectedSent.loadSnapshot.weight.toLocaleString()} lbs</p></div><div className="p-4 bg-muted/50 rounded-lg"><h4 className="font-medium mb-2">Driver</h4><p className="font-semibold flex items-center gap-2"><User className="h-4 w-4" />{selectedSent.driverSnapshot.name}</p><p className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{selectedSent.driverSnapshot.location}</p><p className="text-sm text-muted-foreground flex items-center gap-1 mt-1"><Building2 className="h-3 w-3" />{selectedSent.driverOwnerName}</p></div><div className="p-4 border-2 border-blue-500 rounded-lg bg-blue-50 dark:bg-blue-950/20"><h4 className="font-medium mb-3 text-blue-700 dark:text-blue-300">Counter Offer Details</h4><div className="grid grid-cols-2 gap-4"><div><p className="text-sm text-muted-foreground">Your Original Rate</p><p className="text-lg font-medium line-through">${selectedSent.originalTerms.rate.toLocaleString()}</p></div><div><p className="text-sm text-blue-600 font-medium">Counter Rate</p><p className="text-2xl font-bold text-blue-600">${selectedSent.counterTerms?.rate.toLocaleString()}</p></div></div>{selectedSent.counterTerms?.pickupDate && (<div className="mt-3 pt-3 border-t"><p className="text-sm text-muted-foreground">Counter Pickup Date</p><p className="font-medium">{formatDate(selectedSent.counterTerms.pickupDate)}</p></div>)}{selectedSent.counterTerms?.notes && (<div className="mt-3 pt-3 border-t"><p className="text-sm text-muted-foreground">Message from Driver Owner</p><p className="text-sm italic">&ldquo;{selectedSent.counterTerms.notes}&rdquo;</p></div>)}</div><p className="text-xs text-muted-foreground">Accepting will create a Trip Lease Agreement and enable messaging.</p></div>)}
          <DialogFooter className="flex-col sm:flex-row gap-2"><Button variant="outline" onClick={handleDeclineCounter} disabled={isAccepting || isDeclining} className="w-full sm:w-auto">{isDeclining ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}Decline Counter</Button><Button onClick={handleAcceptCounter} disabled={isAccepting || isDeclining} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700">{isAccepting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}Accept Counter Offer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
