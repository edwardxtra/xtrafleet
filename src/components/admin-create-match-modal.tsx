"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  Search,
  Package,
  User,
  MapPin,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import type { Load, Driver } from "@/lib/data";
import { useUser, useFirestore } from "@/firebase";
import {
  collectionGroup,
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { acceptMatch } from "@/lib/match-actions";
import { calculateMatchScore, getTotalScore } from "@/lib/matching";
import { showSuccess, showError } from "@/lib/toast-utils";

type LoadWithOwner = Load & { ownerId: string; ownerName?: string };
type DriverWithOwner = Driver & { ownerId: string; ownerName?: string };

interface AdminCreateMatchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AdminCreateMatchModal({
  open,
  onOpenChange,
  onSuccess,
}: AdminCreateMatchModalProps) {
  const { user: adminUser } = useUser();
  const firestore = useFirestore();

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loads, setLoads] = useState<LoadWithOwner[]>([]);
  const [drivers, setDrivers] = useState<DriverWithOwner[]>([]);

  const [loadSearch, setLoadSearch] = useState("");
  const [driverSearch, setDriverSearch] = useState("");
  const [selectedLoad, setSelectedLoad] = useState<LoadWithOwner | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<DriverWithOwner | null>(null);

  const [rate, setRate] = useState<string>("");
  const [pickupDate, setPickupDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Load unmatched loads + available drivers across all owner-operators.
  useEffect(() => {
    async function fetchData() {
      if (!firestore || !open) return;
      setIsLoading(true);
      try {
        const [loadsSnap, driversSnap] = await Promise.all([
          getDocs(collectionGroup(firestore, "loads")),
          getDocs(collectionGroup(firestore, "drivers")),
        ]);

        // Loads use the current lifecycle vocabulary (draft/live/match_pending/
        // ...); "Pending" is legacy. Show loads that are still on the
        // marketplace, treating a missing status as 'live' (as the loads UI does).
        const AVAILABLE_LOAD_STATUSES = new Set(["Pending", "live", "match_pending"]);
        const ownerIds = new Set<string>();
        const rawLoads: LoadWithOwner[] = [];
        loadsSnap.docs.forEach((docSnap) => {
          const data = docSnap.data() as Load;
          const ownerId = docSnap.ref.path.split("/")[1];
          if (AVAILABLE_LOAD_STATUSES.has((data.status as string) || "live")) {
            ownerIds.add(ownerId);
            rawLoads.push({ ...data, id: docSnap.id, ownerId });
          }
        });

        const rawDrivers: DriverWithOwner[] = [];
        driversSnap.docs.forEach((docSnap) => {
          const data = docSnap.data() as Driver;
          const ownerId = docSnap.ref.path.split("/")[1];
          if (data.availability === "Available") {
            ownerIds.add(ownerId);
            rawDrivers.push({ ...data, id: docSnap.id, ownerId });
          }
        });

        const names: Record<string, string> = {};
        await Promise.all(
          Array.from(ownerIds).map(async (ownerId) => {
            try {
              const ownerDoc = await getDoc(doc(firestore, "owner_operators", ownerId));
              if (ownerDoc.exists()) {
                const d = ownerDoc.data();
                names[ownerId] = d.legalName || d.companyName || "Unknown";
              }
            } catch (e) {
              console.error("Error fetching owner:", e);
            }
          })
        );

        setLoads(rawLoads.map((l) => ({ ...l, ownerName: names[l.ownerId] })));
        setDrivers(rawDrivers.map((d) => ({ ...d, ownerName: names[d.ownerId] })));
      } catch (error) {
        console.error("Error loading matchable data:", error);
        showError("Failed to load loads and drivers");
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [firestore, open]);

  // Reset everything when the modal closes.
  useEffect(() => {
    if (!open) {
      setSelectedLoad(null);
      setSelectedDriver(null);
      setLoadSearch("");
      setDriverSearch("");
      setRate("");
      setPickupDate("");
      setNotes("");
    }
  }, [open]);

  // Default the terms from the selected load.
  useEffect(() => {
    if (selectedLoad) {
      setRate(selectedLoad.price ? String(selectedLoad.price) : "");
      setPickupDate(selectedLoad.pickupDate ? selectedLoad.pickupDate.split("T")[0] : "");
    }
  }, [selectedLoad]);

  const filteredLoads = useMemo(() => {
    const q = loadSearch.toLowerCase();
    return loads.filter(
      (l) =>
        !q ||
        l.origin?.toLowerCase().includes(q) ||
        l.destination?.toLowerCase().includes(q) ||
        l.cargo?.toLowerCase().includes(q) ||
        l.ownerName?.toLowerCase().includes(q)
    );
  }, [loads, loadSearch]);

  const filteredDrivers = useMemo(() => {
    const q = driverSearch.toLowerCase();
    return drivers.filter(
      (d) =>
        !q ||
        d.name?.toLowerCase().includes(q) ||
        d.location?.toLowerCase().includes(q) ||
        d.ownerName?.toLowerCase().includes(q)
    );
  }, [drivers, driverSearch]);

  const sameOwner =
    !!selectedLoad && !!selectedDriver && selectedLoad.ownerId === selectedDriver.ownerId;

  const previewScore = useMemo(() => {
    if (!selectedLoad || !selectedDriver) return null;
    try {
      return getTotalScore(calculateMatchScore(selectedDriver, selectedLoad));
    } catch {
      return null;
    }
  }, [selectedLoad, selectedDriver]);

  const canSubmit =
    !!selectedLoad && !!selectedDriver && !sameOwner && Number(rate) > 0 && !isSubmitting;

  const handleSubmit = async () => {
    if (!firestore || !adminUser || !selectedLoad || !selectedDriver) return;
    if (sameOwner) {
      showError("Driver and load must belong to different owner-operators");
      return;
    }
    const rateValue = Number(rate);
    if (!rateValue || rateValue <= 0) {
      showError("Enter a valid agreed rate");
      return;
    }

    setIsSubmitting(true);
    let matchId: string | null = null;
    try {
      const loadOwnerId = selectedLoad.ownerId;
      const driverOwnerId = selectedDriver.ownerId;

      // 1. Create the pending match. Match formation itself (compliance gate +
      //    TLA) happens server-side via /api/matches/accept below — Firestore
      //    rules forbid client-side TLA creation, so there is no shortcut.
      const nowIso = new Date().toISOString();
      const matchData: Record<string, any> = {
        loadId: selectedLoad.id,
        loadOwnerId,
        loadOwnerName: selectedLoad.ownerName || "Unknown",
        driverId: selectedDriver.id,
        driverOwnerId,
        driverName: selectedDriver.name,
        driverOwnerName: selectedDriver.ownerName || "Unknown",
        initiatedBy: "load_owner",
        recipientOwnerId: driverOwnerId,
        status: "pending",
        matchScore: previewScore ?? 0,
        adminCreated: true,
        createdByAdminId: adminUser.uid,
        originalTerms: { rate: rateValue },
        createdAt: nowIso,
        expiresAt: nowIso,
        loadSnapshot: {
          origin: selectedLoad.origin,
          destination: selectedLoad.destination,
          cargo: selectedLoad.cargo,
          weight: selectedLoad.weight,
        },
        driverSnapshot: {
          name: selectedDriver.name,
          location: selectedDriver.location,
          vehicleType: selectedDriver.vehicleType,
        },
      };
      if (pickupDate) matchData.originalTerms.pickupDate = pickupDate;
      if (notes) matchData.originalTerms.notes = notes;
      if (selectedLoad.price) matchData.loadSnapshot.price = selectedLoad.price;
      if (selectedDriver.rating) matchData.driverSnapshot.rating = selectedDriver.rating;

      const matchRef = await addDoc(collection(firestore, "matches"), matchData);
      matchId = matchRef.id;

      // 2. Form the match on behalf of the driver owner. This fires the
      //    synchronous compliance gate and creates the TLA server-side.
      const result = await acceptMatch(firestore, matchRef.id, driverOwnerId);

      if (result.complianceWarning && result.complianceMessage) {
        showSuccess(`Match created with a compliance warning: ${result.complianceMessage}`);
      } else {
        showSuccess("Match created — TLA generated for both parties to review & sign.");
      }
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      // Formation failed (most often a compliance block). Best-effort: mark the
      // orphaned pending match cancelled so it doesn't linger in the queue.
      if (matchId) {
        try {
          await updateDoc(doc(firestore, `matches/${matchId}`), {
            status: "cancelled",
            cancelledAt: new Date().toISOString(),
            cancelledBy: adminUser.uid,
            cancelReason: `Admin match formation failed: ${error?.message || "unknown error"}`,
          });
        } catch (cleanupErr) {
          console.warn("Failed to clean up unformed match:", cleanupErr);
        }
      }
      console.error("Error creating admin match:", error);
      showError(error?.message || "Failed to create match");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-headline">Create Match Manually</DialogTitle>
          <DialogDescription>
            Broker a match between any load and driver. The compliance gate runs on formation
            and the lease agreement is generated for both parties to review and sign.
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-4 py-2">
          {/* Load picker */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Package className="h-4 w-4" /> Load
            </Label>
            {selectedLoad ? (
              <div className="p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm flex items-center gap-1">
                    {selectedLoad.origin}
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    {selectedLoad.destination}
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedLoad(null)}>
                    Change
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedLoad.cargo} • {selectedLoad.weight?.toLocaleString()} lbs
                </p>
                <p className="text-xs text-muted-foreground">Owner: {selectedLoad.ownerName}</p>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search loads..."
                    className="pl-8"
                    value={loadSearch}
                    onChange={(e) => setLoadSearch(e.target.value)}
                  />
                </div>
                <div className="border rounded-lg divide-y max-h-56 overflow-y-auto">
                  {isLoading ? (
                    [1, 2, 3].map((i) => (
                      <div key={i} className="p-3">
                        <Skeleton className="h-4 w-40 mb-1" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    ))
                  ) : filteredLoads.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground text-center">
                      No pending loads found
                    </p>
                  ) : (
                    filteredLoads.map((l) => (
                      <button
                        key={`${l.ownerId}-${l.id}`}
                        type="button"
                        onClick={() => setSelectedLoad(l)}
                        className="w-full text-left p-3 hover:bg-muted/50 transition-colors"
                      >
                        <p className="font-medium text-sm flex items-center gap-1">
                          {l.origin}
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          {l.destination}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {l.cargo} • {l.ownerName}
                          {l.price ? ` • $${l.price.toLocaleString()}` : ""}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* Driver picker */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <User className="h-4 w-4" /> Driver
            </Label>
            {selectedDriver ? (
              <div className="p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{selectedDriver.name}</p>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedDriver(null)}>
                    Change
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {selectedDriver.location}
                </p>
                <p className="text-xs text-muted-foreground">Owner: {selectedDriver.ownerName}</p>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search drivers..."
                    className="pl-8"
                    value={driverSearch}
                    onChange={(e) => setDriverSearch(e.target.value)}
                  />
                </div>
                <div className="border rounded-lg divide-y max-h-56 overflow-y-auto">
                  {isLoading ? (
                    [1, 2, 3].map((i) => (
                      <div key={i} className="p-3">
                        <Skeleton className="h-4 w-40 mb-1" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    ))
                  ) : filteredDrivers.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground text-center">
                      No available drivers found
                    </p>
                  ) : (
                    filteredDrivers.map((d) => (
                      <button
                        key={`${d.ownerId}-${d.id}`}
                        type="button"
                        onClick={() => setSelectedDriver(d)}
                        className="w-full text-left p-3 hover:bg-muted/50 transition-colors"
                      >
                        <p className="font-medium text-sm">{d.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.location} • {d.ownerName} • {d.vehicleType}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Same-owner guard */}
        {sameOwner && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 text-amber-800 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              The driver and load belong to the same owner-operator. A match must be between two
              different operators.
            </span>
          </div>
        )}

        {/* Match score preview */}
        {selectedLoad && selectedDriver && !sameOwner && previewScore !== null && (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-muted-foreground">Suggested match score:</span>
            <Badge variant="secondary">{previewScore}/100</Badge>
          </div>
        )}

        {/* Agreed terms */}
        {selectedLoad && selectedDriver && !sameOwner && (
          <div className="grid md:grid-cols-2 gap-4 pt-2 border-t">
            <div className="grid gap-2">
              <Label htmlFor="admin-match-rate">Agreed Rate (USD)</Label>
              <Input
                id="admin-match-rate"
                type="number"
                min={0}
                placeholder="e.g. 2500"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-match-pickup">Pickup Date (optional)</Label>
              <Input
                id="admin-match-pickup"
                type="date"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="admin-match-notes">Notes (optional)</Label>
              <Textarea
                id="admin-match-notes"
                placeholder="Any context agreed with the parties..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
        )}

        {selectedLoad && selectedDriver && !sameOwner && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              The bilateral compliance gate runs on formation. If either carrier or the driver
              fails, the match is blocked — there is no admin override.
            </span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Match & Generate TLA"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
