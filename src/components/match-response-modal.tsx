"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Loader2,
  Truck,
  User,
  MapPin,
  DollarSign,
  Calendar,
  Check,
  X,
  MessageSquare,
  Clock,
  Building2,
  Star,
  Mail,
  Shield,
} from "lucide-react";
import type { Match } from "@/lib/data";
import { useUser, useFirestore } from "@/firebase";
import { doc, updateDoc, getDoc, arrayUnion } from "firebase/firestore";
import { showSuccess, showError, showInfo } from "@/lib/toast-utils";
import { format, parseISO } from "date-fns";
import { notify } from "@/lib/notifications";
import { acceptMatch } from "@/lib/match-actions";
import { ATTESTATIONS, buildAttestationEntry, type AttestationType } from "@/lib/attestations";

const LENDER_ATTESTATIONS: AttestationType[] = [
  'matchLenderQualified',
  'matchLenderAuthority',
];

type LenderChecks = Record<AttestationType, boolean>;

interface MatchResponseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  match: Match;
  onSuccess?: () => void;
}

export function MatchResponseModal({
  open,
  onOpenChange,
  match,
  onSuccess,
}: MatchResponseModalProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("accept");

  // Counter offer state
  const [counterRate, setCounterRate] = useState<string>(match.originalTerms.rate.toString());
  const [counterPickupDate, setCounterPickupDate] = useState<string>(match.originalTerms.pickupDate || "");
  const [counterNotes, setCounterNotes] = useState<string>("");

  // Decline state
  const [declineReason, setDeclineReason] = useState<string>("");

  // DEV-154 phase 2: lender (driver owner) compliance attestations on accept.
  const [lenderChecks, setLenderChecks] = useState<LenderChecks>(
    () =>
      LENDER_ATTESTATIONS.reduce(
        (acc, t) => ({ ...acc, [t]: false }),
        {} as LenderChecks,
      ),
  );
  const allLenderChecked = LENDER_ATTESTATIONS.every(t => lenderChecks[t]);

  // Determine direction - who initiated this match?
  // If load_owner initiated, driver_owner is responding (current behavior)
  // If driver_owner initiated, load_owner is responding (new behavior)
  const initiatedByLoadOwner = match.initiatedBy === 'load_owner' || !match.initiatedBy; // Default to load_owner for backwards compat
  const initiatorName = initiatedByLoadOwner ? match.loadOwnerName : match.driverOwnerName;
  const initiatorEmail = initiatedByLoadOwner
    ? (match as any).loadOwnerEmail
    : (match as any).driverOwnerEmail;

  const handleAccept = async () => {
    if (!firestore || !user) return;
    setIsSubmitting(true);

    try {
      // Match formation runs server-side: the compliance gate fires there,
      // then the TLA / match / load are written. See /api/matches/accept.
      const { tlaId, complianceWarning, complianceMessage } = await acceptMatch(
        firestore,
        match.id
      );

      // DEV-154 phase 2: record the lender's match-confirmation attestations
      // against this matchId + tlaId for a contextual audit trail.
      // Non-blocking — the match is already formed; if this fails we log.
      try {
        const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
        await updateDoc(doc(firestore, 'owner_operators', user.uid), {
          attestations: arrayUnion(
            ...LENDER_ATTESTATIONS.map(type =>
              buildAttestationEntry(type, user.uid, {
                userAgent,
                context: { matchId: match.id, tlaId },
              }),
            ),
          ),
        });
      } catch (err) {
        console.error('Failed to record lender match attestations:', err);
      }

      const otherPartyName = initiatedByLoadOwner
        ? match.loadOwnerName
        : match.driverOwnerName;

      showSuccess("Match accepted! TLA created and ready to sign.");
      if (complianceWarning && complianceMessage) {
        showInfo(complianceMessage);
      }
      showInfo(`💬 You can now message ${otherPartyName || "the other party"} in the Messages tab!`);

      onOpenChange(false);
      if (onSuccess) onSuccess();

      // Delay redirect slightly to allow toasts to be seen
      setTimeout(() => {
        router.push(`/dashboard/tla/${tlaId}`);
      }, 800);
    } catch (error: any) {
      console.error("Error accepting match:", error);
      showError(error.message || "Failed to accept match. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCounter = async () => {
    if (!firestore || !user) return;
    
    if (!counterRate || parseFloat(counterRate) <= 0) {
      showError("Please enter a valid counter rate");
      return;
    }

    setIsSubmitting(true);

    try {
      const counterTerms: { rate: number; pickupDate?: string; notes?: string } = {
        rate: parseFloat(counterRate),
      };
      if (counterPickupDate) counterTerms.pickupDate = counterPickupDate;
      if (counterNotes) counterTerms.notes = counterNotes;

      await updateDoc(doc(firestore, `matches/${match.id}`), {
        status: 'countered',
        counterTerms,
        respondedAt: new Date().toISOString(),
      });

      // Fetch initiator info for notification
      const initiatorId = initiatedByLoadOwner ? match.loadOwnerId : match.driverOwnerId;
      const initiatorDoc = await getDoc(doc(firestore, `owner_operators/${initiatorId}`));
      const initiatorInfo = initiatorDoc.exists() ? initiatorDoc.data() : null;
      const initiatorEmailFetched = initiatorInfo?.contactEmail || '';
      const initiatorNameFetched = initiatorInfo?.legalName || '';

      if (initiatorEmailFetched) {
        notify.matchCountered({
          loadOwnerEmail: initiatorEmailFetched, // Reusing same type, sending to initiator
          loadOwnerName: initiatorNameFetched,
          driverName: match.driverSnapshot.name,
          loadOrigin: match.loadSnapshot.origin,
          loadDestination: match.loadSnapshot.destination,
          originalRate: match.originalTerms.rate,
          counterRate: parseFloat(counterRate),
          counterNotes: counterNotes || undefined,
        }).catch(err => console.error('Failed to send counter notification:', err));
      }

      showSuccess("Counter offer sent!");
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Error sending counter offer:", error);
      showError("Failed to send counter offer. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (!firestore || !user) return;
    setIsSubmitting(true);

    try {
      const updateData: Record<string, any> = {
        status: 'declined',
        respondedAt: new Date().toISOString(),
      };
      if (declineReason) updateData.declineReason = declineReason;

      await updateDoc(doc(firestore, `matches/${match.id}`), updateData);

      // Fetch initiator info for notification
      const initiatorIdForDecline = initiatedByLoadOwner ? match.loadOwnerId : match.driverOwnerId;
      const initiatorDocForDecline = await getDoc(doc(firestore, `owner_operators/${initiatorIdForDecline}`));
      const initiatorInfoForDecline = initiatorDocForDecline.exists() ? initiatorDocForDecline.data() : null;
      const initiatorEmailForDecline = initiatorInfoForDecline?.contactEmail || '';
      const initiatorNameForDecline = initiatorInfoForDecline?.legalName || '';

      if (initiatorEmailForDecline) {
        notify.matchDeclined({
          loadOwnerEmail: initiatorEmailForDecline, // Reusing same type, sending to initiator
          loadOwnerName: initiatorNameForDecline,
          driverName: match.driverSnapshot.name,
          loadOrigin: match.loadSnapshot.origin,
          loadDestination: match.loadSnapshot.destination,
          reason: declineReason || undefined,
        }).catch(err => console.error('Failed to send decline notification:', err));
      }

      showSuccess("Match declined.");
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Error declining match:", error);
      showError("Failed to decline match. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Not specified";
    try {
      return format(parseISO(dateString), "MMM d, yyyy");
    } catch {
      return dateString;
    }
  };

  const expiresIn = () => {
    const expiresAt = parseISO(match.expiresAt);
    const now = new Date();
    const hoursLeft = Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)));
    return hoursLeft;
  };

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              {initiatedByLoadOwner ? "Match Request" : "Driver Offer"}
            </DialogTitle>
            <DialogDescription>
              {initiatedByLoadOwner
                ? "Review the match request and choose how to respond."
                : "A driver owner has offered their driver for your load."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Expiry Warning */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded-lg">
              <Clock className="h-4 w-4" />
              <span>Expires in {expiresIn()} hours</span>
            </div>

            {/* Load Details */}
            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Load Details
              </h4>
              <div className="text-sm space-y-1">
                <p className="font-semibold">
                  {match.loadSnapshot.origin} → {match.loadSnapshot.destination}
                </p>
                <p className="text-muted-foreground">
                  {match.loadSnapshot.cargo} • {match.loadSnapshot.weight.toLocaleString()} lbs
                </p>
              </div>
            </div>

            {/* Initiator Info with Email and Score */}
            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                {initiatedByLoadOwner ? "From (Load Owner)" : "From (Driver Owner)"}
              </h4>
              <div className="space-y-2">
                <p className="text-sm font-semibold">{initiatorName}</p>
                {initiatorEmail && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 cursor-help">
                        <Mail className="h-3 w-3" />
                        <span className="truncate max-w-[200px]">{initiatorEmail}</span>
                      </p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{initiatorEmail}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {match.matchScore !== undefined && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-primary border-primary">
                      <Star className="h-3 w-3 mr-1" />
                      Match Score: {match.matchScore}/100
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            {/* Driver Info */}
            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <User className="h-4 w-4" />
                {initiatedByLoadOwner ? "Your Driver" : "Offered Driver"}
              </h4>
              <div className="text-sm space-y-1">
                <p className="font-semibold">{match.driverSnapshot.name}</p>
                <p className="text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {match.driverSnapshot.location}
                </p>
                <Badge variant="secondary">{match.driverSnapshot.vehicleType}</Badge>
              </div>
            </div>

            {/* Proposed Terms */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-3">Proposed Terms</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Rate</p>
                  <p className="font-semibold text-lg text-green-600">
                    ${match.originalTerms.rate.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Pickup Date</p>
                  <p className="font-semibold">
                    {formatDate(match.originalTerms.pickupDate)}
                  </p>
                </div>
              </div>
              {match.originalTerms.notes && (
                <div className="mt-3">
                  <p className="text-muted-foreground text-sm">Notes</p>
                  <p className="text-sm">{match.originalTerms.notes}</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Response Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="accept" className="gap-1">
                  <Check className="h-3 w-3" />
                  Accept
                </TabsTrigger>
                <TabsTrigger value="counter" className="gap-1">
                  <MessageSquare className="h-3 w-3" />
                  Counter
                </TabsTrigger>
                <TabsTrigger value="decline" className="gap-1">
                  <X className="h-3 w-3" />
                  Decline
                </TabsTrigger>
              </TabsList>

              <TabsContent value="accept" className="mt-4 space-y-4">
                <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                  <Check className="h-8 w-8 mx-auto text-green-600 mb-2" />
                  <p className="font-medium">Accept these terms?</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    A Trip Lease Agreement will be generated and messaging enabled.
                  </p>
                </div>

                {/* DEV-154 phase 2: lender compliance attestations.
                    Required to accept. Persisted with context.matchId + tlaId. */}
                <div className="space-y-3 p-3 md:p-4 border rounded-lg bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-amber-600" />
                    <h4 className="font-medium text-sm">Compliance Confirmation</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Required before accepting. By checking each box you confirm:
                  </p>
                  <div className="space-y-2.5">
                    {LENDER_ATTESTATIONS.map(type => {
                      const def = ATTESTATIONS[type];
                      return (
                        <div key={type} className="flex items-start gap-2.5">
                          <Checkbox
                            id={`lender-${type}`}
                            checked={lenderChecks[type]}
                            onCheckedChange={(checked) =>
                              setLenderChecks(prev => ({ ...prev, [type]: checked === true }))
                            }
                            disabled={isSubmitting}
                            className="mt-0.5"
                          />
                          <Label htmlFor={`lender-${type}`} className="text-xs leading-relaxed cursor-pointer">
                            {def.text}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="counter" className="mt-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Propose different terms. The load owner can accept or decline your counter offer.
                </p>
                
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="counterRate">Counter Rate ($)</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="counterRate"
                        type="number"
                        value={counterRate}
                        onChange={(e) => setCounterRate(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="counterPickupDate">Counter Pickup Date (Optional)</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="counterPickupDate"
                        type="date"
                        value={counterPickupDate}
                        onChange={(e) => setCounterPickupDate(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="counterNotes">Message to Load Owner (Optional)</Label>
                    <Textarea
                      id="counterNotes"
                      placeholder="Explain your counter offer..."
                      value={counterNotes}
                      onChange={(e) => setCounterNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="decline" className="mt-4 space-y-4">
                <div className="text-center p-4 bg-red-50 dark:bg-red-950/20 rounded-lg">
                  <X className="h-8 w-8 mx-auto text-red-600 mb-2" />
                  <p className="font-medium">Decline this request?</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    The load owner will be notified.
                  </p>
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="declineReason">Reason (Optional)</Label>
                  <Textarea
                    id="declineReason"
                    placeholder="Let them know why you're declining..."
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    rows={2}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            
            {activeTab === "accept" && (
              <Button onClick={handleAccept} disabled={isSubmitting || !allLenderChecked} className="bg-green-600 hover:bg-green-700">
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Accept & Generate TLA
              </Button>
            )}
            
            {activeTab === "counter" && (
              <Button onClick={handleCounter} disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <MessageSquare className="h-4 w-4 mr-2" />
                )}
                Send Counter Offer
              </Button>
            )}
            
            {activeTab === "decline" && (
              <Button onClick={handleDecline} disabled={isSubmitting} variant="destructive">
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <X className="h-4 w-4 mr-2" />
                )}
                Decline Request
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
