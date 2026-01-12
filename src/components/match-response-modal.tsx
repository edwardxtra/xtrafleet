"use client";

import { useState } from "react";
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
  Building2
} from "lucide-react";
import type { Match } from "@/lib/data";
import { useUser, useFirestore } from "@/firebase";
import { doc, updateDoc, getDoc, collection, addDoc } from "firebase/firestore";
import { showSuccess, showError } from "@/lib/toast-utils";
import { format, parseISO } from "date-fns";
import { generateTLA } from "@/lib/tla";
import { notify } from "@/lib/notifications";
import { createConversation } from "@/lib/messaging-utils";

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("accept");
  
  // Counter offer state
  const [counterRate, setCounterRate] = useState<string>(match.originalTerms.rate.toString());
  const [counterPickupDate, setCounterPickupDate] = useState<string>(match.originalTerms.pickupDate || "");
  const [counterNotes, setCounterNotes] = useState<string>("");
  
  // Decline state
  const [declineReason, setDeclineReason] = useState<string>("");

  const handleAccept = async () => {
    if (!firestore || !user) return;
    setIsSubmitting(true);
  
    try {
      // Fetch lessor (driver owner) info
      console.log('Fetching lessor:', match.driverOwnerId);
      const lessorDoc = await getDoc(doc(firestore, `owner_operators/${match.driverOwnerId}`));
      const lessorInfo = lessorDoc.exists() ? { id: lessorDoc.id, ...lessorDoc.data() } : null;
      console.log('Lessor info:', lessorInfo);
  
      // Fetch lessee (load owner) info
      console.log('Fetching lessee:', match.loadOwnerId);
      const lesseeDoc = await getDoc(doc(firestore, `owner_operators/${match.loadOwnerId}`));
      const lesseeInfo = lesseeDoc.exists() ? { id: lesseeDoc.id, ...lesseeDoc.data() } : null;
      console.log('Lessee info:', lesseeInfo);
  
      // Fetch driver info
      console.log('Fetching driver:', match.driverOwnerId, match.driverId);
      const driverDoc = await getDoc(doc(firestore, `owner_operators/${match.driverOwnerId}/drivers/${match.driverId}`));
      const driverInfo = driverDoc.exists() ? { id: driverDoc.id, ...driverDoc.data() } : null;
      console.log('Driver info:', driverInfo);
  
      if (!lessorInfo) {
        throw new Error(`Lessor (driver owner) not found: ${match.driverOwnerId}`);
      }
      if (!lesseeInfo) {
        throw new Error(`Lessee (load owner) not found: ${match.loadOwnerId}`);
      }
      if (!driverInfo) {
        throw new Error(`Driver not found: ${match.driverId} under owner ${match.driverOwnerId}`);
      }
  
      // Generate TLA
      const tlaData = generateTLA({
        match,
        lessorInfo: lessorInfo as any,
        lesseeInfo: lesseeInfo as any,
        driverInfo: driverInfo as any,
      });
  
      // Save TLA to Firestore
      const tlaRef = await addDoc(collection(firestore, "tlas"), tlaData);
  
      // Create conversation between the two parties
      try {
        await createConversation(
          firestore,
          match.driverOwnerId, // Driver owner (lessor)
          match.loadOwnerId,   // Load owner (lessee)
          match.loadId,
          tlaRef.id
        );
        console.log('Conversation created successfully');
      } catch (convError) {
        console.warn('Failed to create conversation:', convError);
        // Don't fail the whole operation if conversation creation fails
      }
  
      // Update match status and link TLA
      await updateDoc(doc(firestore, `matches/${match.id}`), {
        status: 'tla_pending',
        respondedAt: new Date().toISOString(),
        tlaId: tlaRef.id,
      });
  
      // Update load status to "Matched"
      try {
        await updateDoc(doc(firestore, `owner_operators/${match.loadOwnerId}/loads/${match.loadId}`), {
          status: 'Matched',
        });
      } catch (loadError) {
        console.warn("Could not update load status:", loadError);
      }
  
      // Send email notification to load owner
      const loadOwnerEmail = (lesseeInfo as any).contactEmail || '';
      const loadOwnerName = (lesseeInfo as any).legalName || '';
      
      if (loadOwnerEmail) {
        notify.matchAccepted({
          loadOwnerEmail,
          loadOwnerName,
          driverName: match.driverSnapshot.name,
          loadOrigin: match.loadSnapshot.origin,
          loadDestination: match.loadSnapshot.destination,
          rate: match.originalTerms.rate,
          tlaId: tlaRef.id,
        }).catch(err => console.error('Failed to send match accepted notification:', err));
      }
  
      showSuccess("Match accepted! TLA generated and messaging enabled.");
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Error accepting match:", error);
      showError("Failed to accept match. Please try again.");
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

      // Fetch load owner info for notification
      const lesseeDoc = await getDoc(doc(firestore, `owner_operators/${match.loadOwnerId}`));
      const lesseeInfo = lesseeDoc.exists() ? lesseeDoc.data() : null;
      const loadOwnerEmail = lesseeInfo?.contactEmail || '';
      const loadOwnerName = lesseeInfo?.legalName || '';

      if (loadOwnerEmail) {
        notify.matchCountered({
          loadOwnerEmail,
          loadOwnerName,
          driverName: match.driverSnapshot.name,
          loadOrigin: match.loadSnapshot.origin,
          loadDestination: match.loadSnapshot.destination,
          originalRate: match.originalTerms.rate,
          counterRate: parseFloat(counterRate),
          counterNotes: counterNotes || undefined,
        }).catch(err => console.error('Failed to send counter notification:', err));
      }

      showSuccess("Counter offer sent to load owner!");
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

      // Fetch load owner info for notification
      const lesseeDoc = await getDoc(doc(firestore, `owner_operators/${match.loadOwnerId}`));
      const lesseeInfo = lesseeDoc.exists() ? lesseeDoc.data() : null;
      const loadOwnerEmail = lesseeInfo?.contactEmail || '';
      const loadOwnerName = lesseeInfo?.legalName || '';

      if (loadOwnerEmail) {
        notify.matchDeclined({
          loadOwnerEmail,
          loadOwnerName,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Match Request
          </DialogTitle>
          <DialogDescription>
            Review the match request and choose how to respond.
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

          {/* Load Owner Info */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              From
            </h4>
            <p className="text-sm font-semibold">{match.loadOwnerName}</p>
          </div>

          {/* Driver Info */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <User className="h-4 w-4" />
              Requested Driver
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

            <TabsContent value="accept" className="mt-4">
              <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                <Check className="h-8 w-8 mx-auto text-green-600 mb-2" />
                <p className="font-medium">Accept these terms?</p>
                <p className="text-sm text-muted-foreground mt-1">
                  A Trip Lease Agreement will be generated and messaging enabled.
                </p>
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
            <Button onClick={handleAccept} disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
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
  );
}
