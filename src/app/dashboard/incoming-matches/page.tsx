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
  Truck, 
  User, 
  MapPin, 
  Clock, 
  DollarSign,
  Building2,
  Inbox,
  CheckCircle,
  XCircle,
  MessageSquare,
  AlertCircle
} from "lucide-react";
import { useUser, useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import type { Match } from "@/lib/data";
import { MatchResponseModal } from "@/components/match-response-modal";
import { format, parseISO, differenceInHours, isPast } from "date-fns";

const statusConfig = {
  pending: { label: "Pending", variant: "outline" as const, icon: Clock },
  accepted: { label: "Accepted", variant: "default" as const, icon: CheckCircle },
  countered: { label: "Countered", variant: "secondary" as const, icon: MessageSquare },
  declined: { label: "Declined", variant: "destructive" as const, icon: XCircle },
  expired: { label: "Expired", variant: "outline" as const, icon: AlertCircle },
  cancelled: { label: "Cancelled", variant: "outline" as const, icon: XCircle },
  tla_pending: { label: "TLA Pending", variant: "default" as const, icon: Clock },
  tla_signed: { label: "TLA Signed", variant: "default" as const, icon: CheckCircle },
  in_progress: { label: "In Progress", variant: "default" as const, icon: Truck },
  completed: { label: "Completed", variant: "secondary" as const, icon: CheckCircle },
};

export default function IncomingMatchesPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [responseModalOpen, setResponseModalOpen] = useState(false);

  // Query matches where current user is the recipient (needs to respond)
  // This works for both directions:
  // - Load owner initiated → driver owner is recipient
  // - Driver owner initiated → load owner is recipient
  const matchesQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, "matches"),
      where("recipientOwnerId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
  }, [firestore, user?.uid]);

  const { data: matches, isLoading, error } = useCollection<Match>(matchesQuery);

  // Check if match is expired
  const isExpired = (match: Match) => {
    return isPast(parseISO(match.expiresAt));
  };

  const pendingMatches = matches?.filter(m => m.status === 'pending' && !isExpired(m)) || [];
  const otherMatches = matches?.filter(m => m.status !== 'pending' || isExpired(m)) || [];

  const handleRespond = (match: Match) => {
    if (isExpired(match)) {
      return; // Don't open modal for expired matches
    }
    setSelectedMatch(match);
    setResponseModalOpen(true);
  };

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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-headline">Incoming Match Requests</h1>
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
          <h1 className="text-2xl font-bold font-headline">Incoming Match Requests</h1>
          <p className="text-destructive">Error loading matches. Please refresh.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-headline">Incoming Match Requests</h1>
        <p className="text-muted-foreground">
          Review and respond to match requests for your drivers or loads.
        </p>
      </div>

      {/* Pending Requests */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Pending Requests ({pendingMatches.length})
        </h2>
        
        {pendingMatches.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Inbox className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No Pending Requests</h3>
              <p className="text-muted-foreground text-center mt-1">
                When someone sends a match request for your drivers or loads, it will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pendingMatches.map(match => {
              // Determine if this is a request for your driver or your load
              const isForMyDriver = match.initiatedBy === 'load_owner';
              const requesterName = isForMyDriver ? match.loadOwnerName : match.driverOwnerName;

              return (
                <Card key={match.id} className="border-primary/50">
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

                  <CardContent className="space-y-3">
                    {/* Request type indicator */}
                    <Badge variant={isForMyDriver ? "secondary" : "outline"} className="mb-2">
                      {isForMyDriver ? "Request for your driver" : "Offer for your load"}
                    </Badge>

                    {/* From */}
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">From:</span>
                      <span className="font-medium">{requesterName}</span>
                    </div>

                    {/* Driver or Load info depending on direction */}
                    {isForMyDriver ? (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Your Driver:</span>
                        <span className="font-medium">{match.driverSnapshot.name}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Their Driver:</span>
                        <span className="font-medium">{match.driverSnapshot.name}</span>
                      </div>
                    )}

                    {/* Rate */}
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-green-600" />
                      <span className="text-lg font-bold text-green-600">
                        ${match.originalTerms.rate.toLocaleString()}
                      </span>
                    </div>

                    {/* Pickup Date */}
                    {match.originalTerms.pickupDate && (
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Pickup:</span>
                        <span>{formatDate(match.originalTerms.pickupDate)}</span>
                      </div>
                    )}
                  </CardContent>

                  <CardFooter>
                    <Button
                      className="w-full"
                      onClick={() => handleRespond(match)}
                    >
                      Respond to Request
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
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
              const status = expired ? 'expired' : match.status;
              const config = statusConfig[status];
              const StatusIcon = config.icon;
              const isForMyDriver = match.initiatedBy === 'load_owner';
              const requesterName = isForMyDriver ? match.loadOwnerName : match.driverOwnerName;

              return (
                <Card key={match.id} className="opacity-75">
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
                      <Badge variant={config.variant}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {config.label}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-2">
                    <Badge variant="outline" className="mb-1 text-xs">
                      {isForMyDriver ? "For your driver" : "For your load"}
                    </Badge>

                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{requesterName}</span>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{match.driverSnapshot.name}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        ${match.originalTerms.rate.toLocaleString()}
                      </span>
                      {match.status === 'countered' && match.counterTerms && (
                        <span className="text-sm text-muted-foreground">
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

      {/* Response Modal */}
      {selectedMatch && !isExpired(selectedMatch) && (
        <MatchResponseModal
          open={responseModalOpen}
          onOpenChange={setResponseModalOpen}
          match={selectedMatch}
          onSuccess={() => setSelectedMatch(null)}
        />
      )}
    </div>
  );
}
