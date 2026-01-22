"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Driver, Load } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight,
  CheckCircle,
  Truck,
  User,
  Link2,
  Users,
  ShieldCheck,
  Star,
  Trophy,
  MapPin,
  AlertCircle,
  Info,
  Building2,
  Lock,
  Package,
  Briefcase
} from "lucide-react";
import { useUser, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, where, collectionGroup, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getComplianceStatus, ComplianceStatus } from "@/lib/compliance";
import {
  findMatchingDrivers,
  findMatchingLoads,
  getMatchQualityLabel,
  MatchScore,
  LoadMatchScore
} from "@/lib/matching";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { MatchRequestModal } from "@/components/match-request-modal";
import { DriverMatchRequestModal } from "@/components/driver-match-request-modal";

type DriverWithOwner = Driver & { ownerId: string };
type LoadWithOwner = Load & { ownerId: string };

// Selection mode: are we matching from a load or from a driver?
type SelectionMode = 'load' | 'driver' | null;

export default function MatchesPage() {
  // Selection state - what the user is trying to match FROM
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(null);
  const [selectedLoad, setSelectedLoad] = useState<Load | null>(null);
  const [selectedMyDriver, setSelectedMyDriver] = useState<DriverWithOwner | null>(null);


  // Modal states
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [driverMatchModalOpen, setDriverMatchModalOpen] = useState(false);
  const [selectedMatchScore, setSelectedMatchScore] = useState<MatchScore | null>(null);
  const [selectedLoadMatch, setSelectedLoadMatch] = useState<LoadMatchScore | null>(null);

  // Data
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const [allDrivers, setAllDrivers] = useState<DriverWithOwner[]>([]);
  const [driversLoading, setDriversLoading] = useState(true);
  const [myPendingLoads, setMyPendingLoads] = useState<Load[]>([]);
  const [allPendingLoads, setAllPendingLoads] = useState<LoadWithOwner[]>([]);
  const [loadsLoading, setLoadsLoading] = useState(true);
  const [allLoadsLoading, setAllLoadsLoading] = useState(true);

  const { user } = useUser();
  const firestore = useFirestore();

  // Subscribe to MY pending loads
  useEffect(() => {
    if (!firestore || !user?.uid) return;

    const loadsRef = query(
      collection(firestore, `owner_operators/${user.uid}/loads`),
      where("status", "==", "Pending")
    );

    const unsubscribe = onSnapshot(loadsRef, (snapshot) => {
      const loads = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Load));
      setMyPendingLoads(loads);
      setLoadsLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, user?.uid]);

  // Subscribe to ALL pending loads (for driver-initiated matching)
  useEffect(() => {
    if (!firestore || !user?.uid) return;

    const loadsRef = collectionGroup(firestore, 'loads');

    const unsubscribe = onSnapshot(loadsRef, (snapshot) => {
      const loads: LoadWithOwner[] = [];

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data() as Load;
        // Only include pending loads
        if (data.status !== 'Pending') return;

        // Path is: owner_operators/{ownerId}/loads/{loadId}
        const pathParts = docSnap.ref.path.split('/');
        const ownerId = pathParts[1];

        loads.push({
          ...data,
          id: docSnap.id,
          ownerId: ownerId,
        });
      });

      setAllPendingLoads(loads);
      setAllLoadsLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, user?.uid]);

  // Subscribe to ALL drivers using collection group query
  useEffect(() => {
    if (!firestore || !user?.uid) return;

    const driversRef = collectionGroup(firestore, 'drivers');

    const unsubscribe = onSnapshot(driversRef, (snapshot) => {
      const drivers: DriverWithOwner[] = [];

      snapshot.docs.forEach(docSnap => {
        // Path is: owner_operators/{ownerId}/drivers/{driverId}
        const pathParts = docSnap.ref.path.split('/');
        const ownerId = pathParts[1];

        drivers.push({
          ...docSnap.data() as Driver,
          id: docSnap.id,
          ownerId: ownerId,
        });
      });

      setAllDrivers(drivers);
      setDriversLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, user?.uid]);

  // Fetch owner company names for drivers AND loads
  useEffect(() => {
    async function fetchOwnerNames() {
      if (!firestore) return;
      const driverOwnerIds = allDrivers.map(d => d.ownerId).filter(Boolean);
      const loadOwnerIds = allPendingLoads.map(l => l.ownerId).filter(Boolean);
      const ownerIds = [...new Set([...driverOwnerIds, ...loadOwnerIds])];

      const names: Record<string, string> = {};
      for (const ownerId of ownerIds) {
        if (ownerId && !ownerNames[ownerId]) {
          try {
            const ownerDoc = await getDoc(doc(firestore, 'owner_operators', ownerId));
            if (ownerDoc.exists()) {
              const data = ownerDoc.data();
              names[ownerId] = data.companyName || data.legalName || 'Unknown Fleet';
            }
          } catch (e) {
            console.error('Error fetching owner:', e);
          }
        }
      }
      if (Object.keys(names).length > 0) {
        setOwnerNames(prev => ({ ...prev, ...names }));
      }
    }
    fetchOwnerNames();
  }, [firestore, allDrivers, allPendingLoads]);

  // My drivers (for initiating matches)
  const myDrivers = allDrivers.filter(driver => {
    if (driver.ownerId !== user?.uid) return false;
    const status = getComplianceStatus(driver);
    const isActive = driver.isActive !== false;
    return isActive && driver.availability === 'Available' && status === 'Green';
  });

  // Other OO's pending loads (for driver-initiated matching)
  const otherPendingLoads = allPendingLoads.filter(load => load.ownerId !== user?.uid);

  // Handle selecting MY load (to find drivers for it)
  const handleMyLoadSelect = (load: Load) => {
    setSelectionMode('load');
    setSelectedLoad(load);
    setSelectedMyDriver(null);
    setSelectedOtherDriver(null);
  };

  // Handle selecting MY driver (to find loads for them)
  const handleMyDriverSelect = (driver: DriverWithOwner) => {
    setSelectionMode('driver');
    setSelectedMyDriver(driver);
    setSelectedLoad(null);
    setSelectedOtherDriver(null);
  };

  // Handle selecting a driver match (load owner initiating)
  const handleSelectDriverMatch = (match: MatchScore) => {
    setSelectedMatchScore(match);
    setMatchModalOpen(true);
  };

  // Handle selecting a load match (driver owner initiating)
  const handleSelectLoadMatch = (match: LoadMatchScore) => {
    setSelectedLoadMatch(match);
    setDriverMatchModalOpen(true);
  };

  const handleMatchSuccess = () => {
    setSelectedLoad(null);
    setSelectedMyDriver(null);
    setSelectedMatchScore(null);
    setSelectedLoadMatch(null);
    setSelectionMode(null);
  };

  // Get ranked driver matches when MY load is selected
  const driverMatches = selectedLoad && selectionMode === 'load' && allDrivers.length > 0
    ? findMatchingDrivers(
        selectedLoad,
        allDrivers.filter(d => d.ownerId !== user?.uid && d.isActive !== false),
        { onlyGreenCompliance: true, onlyAvailable: true, maxResults: 10 }
      )
    : [];

  // Get ranked load matches when MY driver is selected
  const loadMatches = selectedMyDriver && selectionMode === 'driver' && otherPendingLoads.length > 0
    ? findMatchingLoads(selectedMyDriver, otherPendingLoads, { maxResults: 10 })
    : [];
  
  const getComplianceBadgeStyle = (status: ComplianceStatus) => {
    switch (status) {
      case 'Green': return 'bg-green-100 text-green-800 border-green-300 hover:bg-green-100';
      case 'Yellow': return 'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-100';
      case 'Red': return 'bg-red-100 text-red-800 border-red-300 hover:bg-red-100';
      default: return '';
    }
  };

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-8rem)]">
        {/* MY ASSETS - Loads and Drivers I own */}
        <Card className="flex flex-col h-full overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="font-headline flex items-center gap-2">
                <Briefcase className="h-5 w-5" /> My Assets
              </CardTitle>
              <CardDescription>Select your load or driver to find matches.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-6 pt-0">
                  {/* My Pending Loads Section */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-2">
                      <Package className="h-4 w-4" /> My Loads ({myPendingLoads.length})
                    </h4>
                    {loadsLoading ? (
                      <div className="p-4 text-center text-muted-foreground text-sm">Loading...</div>
                    ) : myPendingLoads.length > 0 ? (
                      myPendingLoads.map((load) => (
                        <div key={load.id}>
                          <button
                            onClick={() => handleMyLoadSelect(load)}
                            className={`w-full text-left p-3 rounded-lg transition-colors ${
                              selectedLoad?.id === load.id && selectionMode === 'load'
                                ? 'bg-primary/10 border border-primary'
                                : 'hover:bg-muted/50'
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-semibold text-sm">{load.origin} → {load.destination}</p>
                                <p className="text-xs text-muted-foreground">{load.cargo} • {load.weight?.toLocaleString()} lbs</p>
                                {load.price && <p className="text-xs font-medium text-green-600">${load.price.toLocaleString()}</p>}
                              </div>
                              {selectedLoad?.id === load.id && selectionMode === 'load' && (
                                <CheckCircle className="h-4 w-4 text-primary" />
                              )}
                            </div>
                          </button>
                          <Separator className="my-1" />
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground p-2">No pending loads</p>
                    )}
                  </div>

                  <Separator className="my-4" />

                  {/* My Available Drivers Section */}
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-2">
                      <User className="h-4 w-4" /> My Drivers ({myDrivers.length})
                    </h4>
                    {driversLoading ? (
                      <div className="p-4 text-center text-muted-foreground text-sm">Loading...</div>
                    ) : myDrivers.length > 0 ? (
                      myDrivers.map((driver) => {
                        const complianceStatus = getComplianceStatus(driver);
                        return (
                          <div key={driver.id}>
                            <button
                              onClick={() => handleMyDriverSelect(driver)}
                              className={`w-full text-left p-3 rounded-lg transition-colors ${
                                selectedMyDriver?.id === driver.id && selectionMode === 'driver'
                                  ? 'bg-primary/10 border border-primary'
                                  : 'hover:bg-muted/50'
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-semibold text-sm">{driver.name}</p>
                                    <Badge className={`text-xs ${getComplianceBadgeStyle(complianceStatus)}`}>
                                      <ShieldCheck className="h-3 w-3 mr-1" />{complianceStatus}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground">{driver.location} • {driver.vehicleType}</p>
                                </div>
                                {selectedMyDriver?.id === driver.id && selectionMode === 'driver' && (
                                  <CheckCircle className="h-4 w-4 text-primary" />
                                )}
                              </div>
                            </button>
                            <Separator className="my-1" />
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-muted-foreground p-2">No available drivers (must be green compliance)</p>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

        {/* Ranked Matches Panel */}
        <Card className="flex flex-col h-full overflow-hidden">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="font-headline flex items-center gap-2">
              <Link2 className="h-5 w-5" /> Ranked Matches
            </CardTitle>
            <CardDescription className="truncate">
              {selectionMode === 'load' && selectedLoad
                ? `Top drivers for your load to ${selectedLoad.destination}`
                : selectionMode === 'driver' && selectedMyDriver
                  ? `Top loads for ${selectedMyDriver.name}`
                  : "Select your load or driver from My Assets"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full">
              <div className="p-6 pt-0">
                {/* Load Owner Mode: Show driver matches */}
                {selectionMode === 'load' && selectedLoad ? (
                  driverMatches.length > 0 ? (
                    <div className="space-y-4">
                      {driverMatches.map((match) => {
                        const complianceStatus = getComplianceStatus(match.driver);
                        const companyName = match.driver.ownerId ? ownerNames[match.driver.ownerId] : null;
                        return (
                          <Card key={match.driver.id} className={`shadow-none overflow-hidden ${match.isBestMatch ? 'ring-2 ring-primary' : ''}`}>
                            {match.isBestMatch && (
                              <div className="bg-primary text-primary-foreground px-3 py-1.5 flex items-center gap-2 text-sm font-medium">
                                <Trophy className="h-4 w-4" />Best Match
                              </div>
                            )}
                            <CardHeader className="pb-2">
                              <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-lg font-bold text-muted-foreground">#{match.rank}</span>
                                    <CardTitle className="text-base flex items-center gap-1">
                                      <User className="h-4 w-4 flex-shrink-0" />
                                      <span className="truncate">{match.driver.name}</span>
                                    </CardTitle>
                                  </div>
                                  <CardDescription className="flex items-center gap-1 text-xs">
                                    <MapPin className="h-3 w-3 flex-shrink-0" />
                                    <span className="truncate">{match.driver.location}</span>
                                  </CardDescription>
                                  {companyName && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                      <Building2 className="h-3 w-3 flex-shrink-0" />
                                      <span className="truncate">{companyName}</span>
                                    </p>
                                  )}
                                </div>
                                <Badge className={`flex-shrink-0 text-xs ${getComplianceBadgeStyle(complianceStatus)}`}>
                                  <ShieldCheck className="h-3 w-3 mr-1" />{complianceStatus}
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="pb-2">
                              <div className="mb-3">
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="text-muted-foreground">Match Score</span>
                                  <span className="font-semibold">{match.score}/100</span>
                                </div>
                                <Progress value={match.score} className="h-2" />
                                <p className="text-xs text-muted-foreground mt-1">{getMatchQualityLabel(match.score)}</p>
                              </div>
                              <div className="flex gap-1 flex-wrap mb-2">
                                <Badge variant="secondary" className="text-xs">{match.driver.vehicleType}</Badge>
                                {match.driver.rating && (
                                  <Badge variant="outline" className="flex items-center gap-1 text-xs">
                                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                    {match.driver.rating.toFixed(1)}
                                  </Badge>
                                )}
                              </div>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                    <Info className="h-3 w-3" />View score breakdown
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="w-64">
                                  <p className="font-semibold mb-2">Score Breakdown</p>
                                  <div className="space-y-1 text-xs">
                                    <div className="flex justify-between"><span>Location:</span><span>{match.breakdown.locationScore}/35</span></div>
                                    <div className="flex justify-between"><span>Vehicle Match:</span><span>{match.breakdown.vehicleMatch}/25</span></div>
                                    <div className="flex justify-between"><span>Qualifications:</span><span>{match.breakdown.qualificationMatch}/20</span></div>
                                    <div className="flex justify-between"><span>Rating:</span><span>{match.breakdown.ratingScore}/10</span></div>
                                    <div className="flex justify-between"><span>Compliance:</span><span>{match.breakdown.complianceScore}/10</span></div>
                                    <Separator className="my-2" />
                                    <div className="flex justify-between font-semibold"><span>Total:</span><span>{match.score}/100</span></div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </CardContent>
                            <CardFooter className="pt-0">
                              <Button variant="default" size="sm" className="ml-auto" onClick={() => handleSelectDriverMatch(match)}>
                                Request Driver<ArrowRight className="h-4 w-4 ml-1" />
                              </Button>
                            </CardFooter>
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-center p-4 border-2 border-dashed rounded-lg">
                      <Users className="h-12 w-12 text-muted-foreground" />
                      <h3 className="mt-4 text-base font-semibold font-headline">No Matching Drivers</h3>
                      <p className="mt-2 text-sm text-muted-foreground">No available drivers match this load.</p>
                    </div>
                  )
                ) : selectionMode === 'driver' && selectedMyDriver ? (
                  /* Driver Owner Mode: Show load matches */
                  loadMatches.length > 0 ? (
                    <div className="space-y-4">
                      {loadMatches.map((match) => {
                        const loadOwnerName = (match.load as LoadWithOwner).ownerId
                          ? ownerNames[(match.load as LoadWithOwner).ownerId]
                          : null;
                        return (
                          <Card key={match.load.id} className={`shadow-none overflow-hidden ${match.isBestMatch ? 'ring-2 ring-primary' : ''}`}>
                            {match.isBestMatch && (
                              <div className="bg-primary text-primary-foreground px-3 py-1.5 flex items-center gap-2 text-sm font-medium">
                                <Trophy className="h-4 w-4" />Best Match
                              </div>
                            )}
                            <CardHeader className="pb-2">
                              <div className="flex justify-between items-start">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg font-bold text-muted-foreground">#{match.rank}</span>
                                    <CardTitle className="text-base flex items-center gap-1">
                                      <Truck className="h-4 w-4 flex-shrink-0" />
                                      <span className="truncate">{match.load.origin} → {match.load.destination}</span>
                                    </CardTitle>
                                  </div>
                                  <CardDescription className="truncate text-xs">
                                    {match.load.cargo} • {match.load.weight?.toLocaleString()} lbs
                                  </CardDescription>
                                  {loadOwnerName && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                      <Building2 className="h-3 w-3 flex-shrink-0" />
                                      <span className="truncate">{loadOwnerName}</span>
                                    </p>
                                  )}
                                </div>
                                {match.load.price && (
                                  <Badge variant="secondary" className="text-green-600 flex-shrink-0 text-xs">
                                    ${match.load.price.toLocaleString()}
                                  </Badge>
                                )}
                              </div>
                            </CardHeader>
                            <CardContent className="pb-2">
                              <div className="mb-3">
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="text-muted-foreground">Match Score</span>
                                  <span className="font-semibold">{match.score}/100</span>
                                </div>
                                <Progress value={match.score} className="h-2" />
                                <p className="text-xs text-muted-foreground mt-1">{getMatchQualityLabel(match.score)}</p>
                              </div>
                            </CardContent>
                            <CardFooter className="pt-0">
                              <Button
                                variant="default"
                                size="sm"
                                className="ml-auto w-full"
                                onClick={() => handleSelectLoadMatch(match)}
                              >
                                Offer Driver<ArrowRight className="h-4 w-4 ml-1" />
                              </Button>
                            </CardFooter>
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-center p-4 border-2 border-dashed rounded-lg">
                      <Truck className="h-12 w-12 text-muted-foreground" />
                      <h3 className="mt-4 text-base font-semibold font-headline">No Matching Loads</h3>
                      <p className="mt-2 text-sm text-muted-foreground">No pending loads from other operators match this driver.</p>
                    </div>
                  )
                ) : (
                  /* Default state - nothing selected */
                  <div className="flex flex-col items-center justify-center h-64 text-center p-4 border-2 border-dashed rounded-lg">
                    <Link2 className="h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-4 text-base font-semibold font-headline">Select from My Assets</h3>
                    <p className="mt-2 text-sm text-muted-foreground">Choose your load or driver to find matches.</p>
                    <div className="mt-4 p-3 bg-muted/50 rounded-lg text-left text-xs">
                      <p className="font-medium mb-1">How it works:</p>
                      <ul className="space-y-0.5 text-muted-foreground">
                        <li>• Select <strong>your load</strong> → find drivers to hire</li>
                        <li>• Select <strong>your driver</strong> → find loads to haul</li>
                        <li>• Only green compliance drivers eligible</li>
                        <li>• You can't match your own assets together</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Load Owner initiating match with driver */}
      {selectedLoad && selectedMatchScore && (
        <MatchRequestModal
          open={matchModalOpen}
          onOpenChange={setMatchModalOpen}
          load={selectedLoad}
          matchScore={selectedMatchScore}
          onSuccess={handleMatchSuccess}
        />
      )}

      {/* Driver Owner initiating match with load */}
      {selectedMyDriver && selectedLoadMatch && (
        <DriverMatchRequestModal
          open={driverMatchModalOpen}
          onOpenChange={setDriverMatchModalOpen}
          driver={selectedMyDriver}
          loadMatch={selectedLoadMatch}
          onSuccess={handleMatchSuccess}
        />
      )}
    </TooltipProvider>
  );
}
