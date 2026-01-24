"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Send,
  CheckCircle,
  XCircle,
  MessageSquare,
  AlertCircle,
  ArrowRight,
  Loader2
} from "lucide-react";
import { useUser, useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, where, orderBy, doc, updateDoc, getDoc, addDoc } from "firebase/firestore";
import type { Match } from "@/lib/data";
import { format, parseISO, differenceInHours, isPast } from "date-fns";
import { showSuccess, showError, showInfo } from "@/lib/toast-utils";
import { useRouter } from "next/navigation";
import { generateTLA } from "@/lib/tla";
import { notify } from "@/lib/notifications";
import { createConversation } from "@/lib/messaging-utils";

const statusConfig = {
  pending: { label: "Awaiting Response", variant: "outline" as const, icon: Clock, color: "text-orange-600" },
  accepted: { label: "Accepted", variant: "default" as const, icon: CheckCircle, color: "text-green-600" },
  countered: { label: "Counter Received", variant: "secondary" as const, icon: MessageSquare, color: "text-blue-600" },
  declined: { label: "Declined", variant: "destructive" as const, icon: XCircle, color: "text-red-600" },
  expired: { label: "Expired", variant: "outline" as const, icon: AlertCircle, color: "text-gray-500" },
  cancelled: { label: "Cancelled", variant: "outline" as const, icon: XCircle, color: "text-gray-500" },
  tla_pending: { label: "TLA Pending", variant: "default" as const, icon: Clock, color: "text-green-600" },
  tla_signed: { label: "TLA Signed", variant: "default" as const, icon: CheckCircle, color: "text-green-600" },
  in_progress: { label: "In Progress", variant: "default" as const, icon: Truck, color: "text-green-600" },
  completed: { label: "Completed", variant: "secondary" as const, icon: CheckCircle, color: "text-gray-600" },
};

export default function SentRequestsPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [counterModalOpen, setCounterModalOpen] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);

  // Query matches where current user INITIATED (sent the request)
  // This catches both load owner initiated and driver owner initiated
  const matchesQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, "matches"),
      where("loadOwnerId", "==", user.uid),
      where("initiatedBy", "==", "load_owner"),
      orderBy("createdAt", "desc")
    );
  }, [firestore, user?.uid]);

  const { data: matches, isLoading, error } = useCollection<Match>(matchesQuery);

  // Check if match is expired
  const isExpired = (match: Match) => {
    return isPast(parseISO(match.expiresAt));
  };

  // Categorize matches
  const counteredMatches = matches?.filter(m => m.status === 'countered' && !isExpired(m)) || [];
  const pendingMatches = matches?.filter(m => m.status === 'pending' && !isExpired(m)) || [];
  const otherMatches = matches?.filter(m =>
    (m.status !== 'pending' && m.status !== 'countered') || isExpired(m)
  ) || [];

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Not specified";
    try {
      return format(parseISO(dateString), "MMM d, yyyy");
    } catch {
      return dateString;
    }
  };

  const getTimeLeft = (expiresAt: string) => {
    const hours = differenceInHours(parseISO(expiresAt), new Date());
    if (hours <= 0) return "Expired";
    if (hours < 24) return `${hours}h left`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
  };

  const handleViewCounter = (match: Match) => {
    setSelectedMatch(match);
    setCounterModalOpen(true);
  };

  // Accept counter offer
  const handleAcceptCounter = async () => {
    if (!firestore || !user || !selectedMatch) return;
    setIsAccepting(true);

    try {
      // Fetch lessor (driver owner) info
      const lessorDoc = await getDoc(doc(firestore, `owner_operators/${selectedMatch.driverOwnerId}`));
      const lessorInfo = lessorDoc.exists() ? { id: lessorDoc.id, ...lessorDoc.data() } : null;

      // Fetch lessee (load owner - current user) info
      const lesseeDoc = await getDoc(doc(firestore, `owner_operators/${selectedMatch.loadOwnerId}`));
      const lesseeInfo = lesseeDoc.exists() ? { id: lesseeDoc.id, ...lesseeDoc.data() } : null;

      // Fetch driver info
      const driverDoc = await getDoc(doc(firestore, `owner_operators/${selectedMatch.driverOwnerId}/drivers/${selectedMatch.driverId}`));
      const driverInfo = driverDoc.exists() ? { id: driverDoc.id, ...driverDoc.data() } : null;

      if (!lessorInfo || !lesseeInfo || !driverInfo) {
        throw new Error('Required information not found');
      }

      // Check if load is still available
      const loadDoc = await getDoc(doc(firestore, `owner_operators/${selectedMatch.loadOwnerId}/loads/${selectedMatch.loadId}`));
      if (!loadDoc.exists()) {
        throw new Error('Load not found');
      }
      const loadData = loadDoc.data();
      if (loadData.status !== 'Pending') {
        throw new Error(`This load has already been matched (status: ${loadData.status}).`);
      }

      // Use counter terms for TLA
      const matchWithCounterTerms = {
        ...selectedMatch,
        originalTerms: selectedMatch.counterTerms || selectedMatch.originalTerms
      };

      // Generate TLA with counter terms
      const tlaData = generateTLA({
        match: matchWithCounterTerms,
        lessorInfo: lessorInfo as any,
        lesseeInfo: lesseeInfo as any,
        driverInfo: driverInfo as any,
      });

      // Save TLA
      const tlaRef = await addDoc(collection(firestore, "tlas"), tlaData);

      // Create conversation
      try {
        await createConversation(
          firestore,
          selectedMatch.driverOwnerId,
          selectedMatch.loadOwnerId,
          selectedMatch.loadId,
          tlaRef.id
        );
      } catch (convError) {
        console.warn('Failed to create conversation:', convError);
      }

      // Update match status
      await updateDoc(doc(firestore, `matches/${selectedMatch.id}`), {
        status: 'tla_pending',
        counterAcceptedAt: new Date().toISOString(),
        tlaId: tlaRef.id,
        finalTerms: selectedMatch.counterTerms,
      });

      // Update load status
      await updateDoc(doc(firestore, `owner_operators/${selectedMatch.loadOwnerId}/loads/${selectedMatch.loadId}`), {
        status: 'Matched',
        matchedAt: new Date().toISOString(),
        tlaId: tlaRef.id,
      });

      // Notify driver owner
      const driverOwnerEmail = (lessorInfo as any).contactEmail || '';
      if (driverOwnerEmail) {
        notify.matchAccepted({
          loadOwnerEmail: driverOwnerEmail,
          loadOwnerName: (lessorInfo as any).legalName || '',
          driverName: selectedMatch.driverSnapshot.name,
          loadOrigin: selectedMatch.loadSnapshot.origin,
          loadDestination: selectedMatch.loadSnapshot.destination,
          rate: selectedMatch.counterTerms?.rate || selectedMatch.originalTerms.rate,
          tlaId: tlaRef.id,
        }).catch(err => console.error('Failed to send notification:', err));
      }

      // Create in-app notification for driver owner
      await addDoc(collection(firestore, "notifications"), {
        userId: selectedMatch.driverOwnerId,
        type: "counter_accepted",
        title: "Counter Offer Accepted!",
        message: `Your counter offer for ${selectedMatch.loadSnapshot.origin} → ${selectedMatch.loadSnapshot.destination} was accepted!`,
        link: "/dashboard/messages",
        linkText: "Go to Messages",
        createdAt: new Date().toISOString(),
        read: false,
      });

      showSuccess("Counter offer accepted! TLA created.");
      showInfo("You can now message the driver owner.");
      setCounterModalOpen(false);

      setTimeout(() => {
        router.push(`/dashboard/tla/${tlaRef.id}`);
      }, 800);

    } catch (error: any) {
      console.error("Error accepting counter:", error);
      showError(error.message || "Failed to accept counter offer.");
    } finally {
      setIsAccepting(false);
    }
  };

  // Decline counter offer
  const handleDeclineCounter = async () => {
    if (!firestore || !user || !selectedMatch) return;
    setIsDeclining(true);

    try {
      await updateDoc(doc(firestore, `matches/${selectedMatch.id}`), {
        status: 'declined',
        declinedAt: new Date().toISOString(),
        declinedBy: 'load_owner',
        declineReason: 'Counter offer declined',
      });

      // Notify driver owner
      const driverOwnerDoc = await getDoc(doc(firestore, `owner_operators/${selectedMatch.driverOwnerId}`));
      const driverOwnerInfo = driverOwnerDoc.exists() ? driverOwnerDoc.data() : null;
      const driverOwnerEmail = driverOwnerInfo?.contactEmail || '';

      if (driverOwnerEmail) {
        notify.matchDeclined({
          loadOwnerEmail: driverOwnerEmail,
          loadOwnerName: driverOwnerInfo?.legalName || '',
          driverName: selectedMatch.driverSnapshot.name,
          loadOrigin: selectedMatch.loadSnapshot.origin,
          loadDestination: selectedMatch.loadSnapshot.destination,
          reason: 'Counter offer was not accepted',
        }).catch(err => console.error('Failed to send notification:', err));
      }

      showSuccess("Counter offer declined.");
      setCounterModalOpen(false);
      setSelectedMatch(null);

    } catch (error: any) {
      console.error("Error declining counter:", error);
      showError(error.message || "Failed to decline counter offer.");
    } finally {
      setIsDeclining(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-headline">Sent Match Requests</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-headline">Sent Match Requests</h1>
          <p className="text-destructive">Error loading requests. Please refresh.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-headline">Sent Match Requests</h1>
        <p className="text-muted-foreground">
          Track your outgoing match requests and respond to counter offers.
        </p>
      </div>

      {/* Counter Offers - Most Important */}
      {counteredMatches.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-600" />
            Counter Offers Received ({counteredMatches.length})
          </h2>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {counteredMatches.map(match => (
              <Card key={match.id} className="border-blue-500 border-2">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Truck className="h-4 w-4" />
                        {match.loadSnapshot.origin} → {match.loadSnapshot.destination}
                      </CardTitle>
                      <CardDescription>
                        {match.loadSnapshot.cargo} • {match.loadSnapshot.weight.toLocaleString()} lbs
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                      <MessageSquare className="h-3 w-3 mr-1" />
                      Counter
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Driver:</span>
                    <span className="font-medium">{match.driverSnapshot.name}</span>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{match.driverOwnerName}</span>
                  </div>

                  {/* Original vs Counter Rate */}
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Your Rate</p>
                        <p className="font-medium line-through text-muted-foreground">
                          ${match.originalTerms.rate.toLocaleString()}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-blue-600" />
                      <div>
                        <p className="text-xs text-blue-600 font-medium">Counter Rate</p>
                        <p className="font-bold text-blue-600 text-lg">
                          ${match.counterTerms?.rate.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {match.counterTerms?.notes && (
                      <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                        "{match.counterTerms.notes}"
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-sm text-orange-600">
                    <Clock className="h-4 w-4" />
                    <span>{getTimeLeft(match.expiresAt)}</span>
                  </div>
                </CardContent>

                <CardFooter>
                  <Button className="w-full" onClick={() => handleViewCounter(match)}>
                    Review Counter Offer
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Pending Requests */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Awaiting Response ({pendingMatches.length})
        </h2>

        {pendingMatches.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Send className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No Pending Requests</h3>
              <p className="text-muted-foreground text-center mt-1">
                Your sent match requests will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pendingMatches.map(match => (
              <Card key={match.id}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Truck className="h-4 w-4" />
                        {match.loadSnapshot.origin} → {match.loadSnapshot.destination}
                      </CardTitle>
                      <CardDescription>
                        {match.loadSnapshot.cargo} • {match.loadSnapshot.weight.toLocaleString()} lbs
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="text-orange-600 border-orange-600">
                      <Clock className="h-3 w-3 mr-1" />
                      {getTimeLeft(match.expiresAt)}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{match.driverSnapshot.name}</span>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{match.driverOwnerName}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    <span className="font-semibold text-green-600">
                      ${match.originalTerms.rate.toLocaleString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Past Requests */}
      {otherMatches.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Past Requests</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {otherMatches.map(match => {
              const expired = isExpired(match);
              const status = expired && match.status === 'pending' ? 'expired' : match.status;
              const config = statusConfig[status] || statusConfig.expired;
              const StatusIcon = config.icon;

              return (
                <Card key={match.id} className="opacity-75">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Truck className="h-4 w-4" />
                          {match.loadSnapshot.origin} → {match.loadSnapshot.destination}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {match.loadSnapshot.cargo}
                        </CardDescription>
                      </div>
                      <Badge variant={config.variant}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {config.label}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{match.driverSnapshot.name}</span>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span>${match.originalTerms.rate.toLocaleString()}</span>
                      {match.status === 'countered' && match.counterTerms && (
                        <span className="text-muted-foreground">
                          → ${match.counterTerms.rate.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Counter Offer Modal */}
      <Dialog open={counterModalOpen} onOpenChange={setCounterModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-600" />
              Counter Offer Received
            </DialogTitle>
            <DialogDescription>
              Review the counter offer and decide how to proceed.
            </DialogDescription>
          </DialogHeader>

          {selectedMatch && (
            <div className="space-y-4 py-4">
              {/* Load Summary */}
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">Load</h4>
                <p className="font-semibold">
                  {selectedMatch.loadSnapshot.origin} → {selectedMatch.loadSnapshot.destination}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedMatch.loadSnapshot.cargo} • {selectedMatch.loadSnapshot.weight.toLocaleString()} lbs
                </p>
              </div>

              {/* Driver Summary */}
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">Driver</h4>
                <p className="font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {selectedMatch.driverSnapshot.name}
                </p>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {selectedMatch.driverSnapshot.location}
                </p>
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                  <Building2 className="h-3 w-3" />
                  {selectedMatch.driverOwnerName}
                </p>
              </div>

              {/* Rate Comparison */}
              <div className="p-4 border-2 border-blue-500 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                <h4 className="font-medium mb-3 text-blue-700">Counter Offer Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Your Original Rate</p>
                    <p className="text-lg font-medium line-through">
                      ${selectedMatch.originalTerms.rate.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-blue-600 font-medium">Counter Rate</p>
                    <p className="text-2xl font-bold text-blue-600">
                      ${selectedMatch.counterTerms?.rate.toLocaleString()}
                    </p>
                  </div>
                </div>

                {selectedMatch.counterTerms?.pickupDate && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-sm text-muted-foreground">Counter Pickup Date</p>
                    <p className="font-medium">{formatDate(selectedMatch.counterTerms.pickupDate)}</p>
                  </div>
                )}

                {selectedMatch.counterTerms?.notes && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-sm text-muted-foreground">Message from Driver Owner</p>
                    <p className="text-sm italic">"{selectedMatch.counterTerms.notes}"</p>
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Accepting will create a Trip Lease Agreement and enable messaging.
              </p>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleDeclineCounter}
              disabled={isAccepting || isDeclining}
              className="w-full sm:w-auto"
            >
              {isDeclining ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Decline Counter
            </Button>
            <Button
              onClick={handleAcceptCounter}
              disabled={isAccepting || isDeclining}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
            >
              {isAccepting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Accept Counter Offer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
