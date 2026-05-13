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
  Package,
  Briefcase,
  Award,
  X,
} from "lucide-react";
import { useUser, useFirestore } from "@/firebase";
import { collection, query, where, collectionGroup, doc, getDoc, onSnapshot } from "firebase/firestore";
import {
  findMatchingDrivers,
  findMatchingDriversAsync,
  findMatchingLoads,
  findIneligibleDrivers,
  getMatchQualityLabel,
  getMatchReasons,
  type MatchScore,
  type LoadMatchScore,
} from "@/lib/matching";
import { Progress } from "@/components/ui/progress";
import { MatchRequestModal } from "@/components/match-request-modal";
import { DriverMatchRequestModal } from "@/components/driver-match-request-modal";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ComplianceScorecard, ScoringFormulaExplainer } from "@/components/compliance-scorecard";
import { getComplianceStatus, type ComplianceStatus } from "@/lib/compliance";

type DriverWithOwner = Driver & { ownerId: string };
type LoadWithOwner = Load & { ownerId: string };
type SelectionMode = "load" | "driver" | null;

const LOG_PREFIX = "[matches/page]";

export default function MatchesPage() {
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(null);
  const [selectedLoad, setSelectedLoad] = useState<Load | null>(null);
  const [selectedMyDriver, setSelectedMyDriver] = useState<DriverWithOwner | null>(null);

  // Match request modals
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [driverMatchModalOpen, setDriverMatchModalOpen] = useState(false);
  const [selectedMatchScore, setSelectedMatchScore] = useState<MatchScore | null>(null);
  const [selectedLoadMatch, setSelectedLoadMatch] = useState<LoadMatchScore | null>(null);

  // Score breakdown Sheet
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [breakdownMatch, setBreakdownMatch] = useState<MatchScore | null>(null);
  const [showFormula, setShowFormula] = useState(false);

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

  // Subscribe to MY pending loads.
  // "Pending" is the legacy status string; the current /api/loads POST
  // writes "live" by default and bumps to "match_pending" once a match
  // request goes out. Both new statuses plus the legacy one should
  // populate this panel so newly-posted loads show up immediately.
  useEffect(() => {
    if (!firestore || !user?.uid) return;
    const unsubscribe = onSnapshot(
      query(
        collection(firestore, `owner_operators/${user.uid}/loads`),
        where("status", "in", ["Pending", "live", "match_pending"]),
      ),
      (snapshot) => {
        const loads = snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as Load));
        setMyPendingLoads(loads);
        setLoadsLoading(false);
        console.log(`${LOG_PREFIX} myPendingLoads updated: ${loads.length}`);
      },
      (err) => console.error(`${LOG_PREFIX} myPendingLoads snapshot error:`, err)
    );
    return () => unsubscribe();
  }, [firestore, user?.uid]);

  // Subscribe to ALL pending loads. Mirrors the my-pending status set
  // ("Pending" legacy + "live" + "match_pending" current) so newly-posted
  // loads from other owners are also matchable.
  useEffect(() => {
    if (!firestore || !user?.uid) return;
    const AVAILABLE_STATUSES = new Set(['Pending', 'live', 'match_pending']);
    const unsubscribe = onSnapshot(
      collectionGroup(firestore, "loads"),
      (snapshot) => {
        const loads: LoadWithOwner[] = [];
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data() as Load;
          if (!AVAILABLE_STATUSES.has(data.status as string)) return;
          const ownerId = docSnap.ref.path.split("/")[1];
          loads.push({ ...data, id: docSnap.id, ownerId });
        });
        setAllPendingLoads(loads);
        setAllLoadsLoading(false);
        console.log(`${LOG_PREFIX} allPendingLoads updated: ${loads.length}`);
      },
      (err) => console.error(`${LOG_PREFIX} allPendingLoads snapshot error:`, err)
    );
    return () => unsubscribe();
  }, [firestore, user?.uid]);

  // Subscribe to ALL drivers
  useEffect(() => {
    if (!firestore || !user?.uid) return;
    const unsubscribe = onSnapshot(
      collectionGroup(firestore, "drivers"),
      (snapshot) => {
        const drivers: DriverWithOwner[] = [];
        snapshot.docs.forEach((docSnap) => {
          const ownerId = docSnap.ref.path.split("/")[1];
          drivers.push({ ...docSnap.data() as Driver, id: docSnap.id, ownerId });
        });
        setAllDrivers(drivers);
        setDriversLoading(false);
        console.log(`${LOG_PREFIX} allDrivers updated: ${drivers.length}`);
      },
      (err) => console.error(`${LOG_PREFIX} allDrivers snapshot error:`, err)
    );
    return () => unsubscribe();
  }, [firestore, user?.uid]);

  // Fetch owner company names
  useEffect(() => {
    async function fetchOwnerNames() {
      if (!firestore) return;
      const ids = [
        ...new Set([
          ...allDrivers.map((d) => d.ownerId),
          ...allPendingLoads.map((l) => l.ownerId),
        ].filter(Boolean)),
      ];
      const names: Record<string, string> = {};
      for (const ownerId of ids) {
        if (ownerNames[ownerId]) continue;
        try {
          const snap = await getDoc(doc(firestore, "owner_operators", ownerId));
          if (snap.exists()) {
            const data = snap.data();
            names[ownerId] = data.companyName || data.legalName || "Unknown Fleet";
          }
        } catch (e) {
          console.error(`${LOG_PREFIX} fetchOwnerNames error for ${ownerId}:`, e);
        }
      }
      if (Object.keys(names).length > 0) setOwnerNames((prev) => ({ ...prev, ...names }));
    }
    fetchOwnerNames();
  }, [firestore, allDrivers, allPendingLoads]);

  const myDrivers = allDrivers.filter((d) => {
    if (d.ownerId !== user?.uid) return false;
    const status = getComplianceStatus(d);
    return d.isActive !== false && d.availability === "Available" && status === "Green";
  });

  const otherPendingLoads = allPendingLoads.filter((l) => l.ownerId !== user?.uid);

  const handleMyLoadSelect = (load: Load) => {
    setSelectionMode("load");
    setSelectedLoad(load);
    setSelectedMyDriver(null);
  };

  const handleMyDriverSelect = (driver: DriverWithOwner) => {
    setSelectionMode("driver");
    setSelectedMyDriver(driver);
    setSelectedLoad(null);
  };

  const handleViewBreakdown = (match: MatchScore) => {
    setBreakdownMatch(match);
    setShowFormula(false);
    setBreakdownOpen(true);
    console.log(
      `${LOG_PREFIX} Opening breakdown for driver ${match.driver.id ?? match.driver.name}: score=${match.score}`,
      match.breakdown
    );
  };

  const handleSelectDriverMatch = (match: MatchScore) => {
    setSelectedMatchScore(match);
    setMatchModalOpen(true);
  };

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

  // Pool of drivers eligible for the selected load (excluding own fleet
  // + inactive). Same input feeds both findMatchingDrivers (ranking) and
  // findIneligibleDrivers (diagnostic panel).
  const driverPoolForLoad =
    selectedLoad && selectionMode === "load" && allDrivers.length > 0
      ? allDrivers.filter((d) => d.ownerId !== user?.uid && d.isActive !== false)
      : [];

  // PR 2: switched from sync findMatchingDrivers to async variant so we
  // benefit from the Radar-backed /api/geocode endpoint. The async path
  // resolves driver + load coordinates via Radar (with a 30-day Firestore
  // cache) rather than the 80-city hard-coded dictionary. We render the
  // sync result first as an instant best-effort, then upgrade it once the
  // async resolution lands so the page never feels empty during fetch.
  const driverMatchesSync =
    selectedLoad && selectionMode === "load" && driverPoolForLoad.length > 0
      ? findMatchingDrivers(
          selectedLoad,
          driverPoolForLoad,
          { onlyGreenCompliance: true, onlyAvailable: true, maxResults: 10 }
        )
      : [];

  const [driverMatchesAsync, setDriverMatchesAsync] = useState<MatchScore[] | null>(null);
  const [matchesResolving, setMatchesResolving] = useState(false);

  useEffect(() => {
    if (!selectedLoad || selectionMode !== "load" || driverPoolForLoad.length === 0) {
      setDriverMatchesAsync(null);
      return;
    }
    let cancelled = false;
    setMatchesResolving(true);
    findMatchingDriversAsync(
      selectedLoad,
      driverPoolForLoad,
      { onlyGreenCompliance: true, onlyAvailable: true, maxResults: 10 }
    )
      .then((resolved) => {
        if (cancelled) return;
        setDriverMatchesAsync(resolved);
      })
      .catch((err) => {
        console.warn(`${LOG_PREFIX} findMatchingDriversAsync error`, err);
      })
      .finally(() => {
        if (!cancelled) setMatchesResolving(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLoad?.id, selectionMode, driverPoolForLoad.length]);

  const driverMatches = driverMatchesAsync ?? driverMatchesSync;

  // PR 1 transparency: drivers that were filtered out of the ranking
  // because of hard-eligibility checks (availability / expired docs).
  // Equipment is now a SOFT scoring penalty, not a hard filter, so wrong-
  // equipment drivers appear in driverMatches with a low score, not here.
  const ineligibleDriversForLoad =
    selectedLoad && selectionMode === "load" && driverPoolForLoad.length > 0
      ? findIneligibleDrivers(driverPoolForLoad, { onlyGreenCompliance: true, onlyAvailable: true })
      : [];

  const loadMatches =
    selectedMyDriver && selectionMode === "driver" && otherPendingLoads.length > 0
      ? findMatchingLoads(selectedMyDriver, otherPendingLoads, { maxResults: 10 })
      : [];

  const getComplianceBadgeStyle = (status: ComplianceStatus) => {
    switch (status) {
      case "Green": return "bg-green-100 text-green-800 border-green-300 hover:bg-green-100";
      case "Yellow": return "bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-100";
      case "Red": return "bg-red-100 text-red-800 border-red-300 hover:bg-red-100";
      default: return "";
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 lg:h-[calc(100vh-8rem)]">

        {/* MY ASSETS */}
        <Card className="flex flex-col h-[50vh] lg:h-full overflow-hidden">
          <CardHeader className="flex-shrink-0 p-4 md:p-6">
            <CardTitle className="font-headline flex items-center gap-2 text-base md:text-lg">
              <Briefcase className="h-4 w-4 md:h-5 md:w-5" /> My Assets
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">Select your load or driver to find matches.</CardDescription>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-3 md:p-6 pt-0">

                {/* My Pending Loads */}
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
                            selectedLoad?.id === load.id && selectionMode === "load"
                              ? "bg-primary/10 border border-primary"
                              : "hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-semibold text-sm">{load.origin} → {load.destination}</p>
                              <p className="text-xs text-muted-foreground">
                                {load.cargo} • {load.weight?.toLocaleString()} lbs
                              </p>
                              {load.price && <p className="text-xs font-medium text-green-600">${load.price.toLocaleString()}</p>}
                            </div>
                            {selectedLoad?.id === load.id && selectionMode === "load" && (
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

                {/* My Available Drivers */}
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
                              selectedMyDriver?.id === driver.id && selectionMode === "driver"
                                ? "bg-primary/10 border border-primary"
                                : "hover:bg-muted/50"
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
                              {selectedMyDriver?.id === driver.id && selectionMode === "driver" && (
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

        {/* RANKED MATCHES */}
        <Card className="flex flex-col h-[50vh] lg:h-full overflow-hidden">
          <CardHeader className="flex-shrink-0 p-4 md:p-6">
            <CardTitle className="font-headline flex items-center gap-2 text-base md:text-lg">
              <Link2 className="h-4 w-4 md:h-5 md:w-5" /> Ranked Matches
            </CardTitle>
            <CardDescription className="truncate text-xs md:text-sm">
              {selectionMode === "load" && selectedLoad
                ? `Best of ${driverMatches.length} eligible driver${driverMatches.length === 1 ? "" : "s"} for ${selectedLoad.destination}${ineligibleDriversForLoad.length > 0 ? ` (${ineligibleDriversForLoad.length} filtered out — see below)` : ""}${matchesResolving ? " · refining…" : ""}`
                : selectionMode === "driver" && selectedMyDriver
                  ? `Top loads for ${selectedMyDriver.name}`
                  : "Select your load or driver from My Assets"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full">
              <div className="p-3 md:p-6 pt-0">

                {/* Load Owner Mode */}
                {selectionMode === "load" && selectedLoad ? (
                  driverMatches.length > 0 ? (
                    <div className="space-y-4">
                      {driverMatches.map((match) => {
                        const complianceStatus = getComplianceStatus(match.driver);
                        const companyName = match.driver.ownerId ? ownerNames[match.driver.ownerId] : null;
                        const hasWarning = !!match.breakdown.qualificationWarning;
                        return (
                          <Card key={match.driver.id} className={`shadow-none overflow-hidden ${match.isBestMatch ? "ring-2 ring-primary" : ""}`}>
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

                              {/* Match reason badges */}
                              {(() => {
                                const reasons = getMatchReasons(match.breakdown);
                                return reasons.length > 0 ? (
                                  <div className="flex gap-1 flex-wrap mb-2">
                                    {reasons.map((r, i) => (
                                      <Badge key={i} variant="outline" className={`text-xs ${r.color}`}>
                                        {r.icon === "location" && <MapPin className="h-3 w-3 mr-1" />}
                                        {r.icon === "truck" && <Truck className="h-3 w-3 mr-1" />}
                                        {r.icon === "star" && <Star className="h-3 w-3 mr-1 fill-current" />}
                                        {r.icon === "certificate" && <Award className="h-3 w-3 mr-1" />}
                                        {r.icon === "shield" && <ShieldCheck className="h-3 w-3 mr-1" />}
                                        {r.label}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : null;
                              })()}

                              {/* Qual warning inline teaser */}
                              {hasWarning && (
                                <div className="flex items-center gap-1.5 mb-2 p-2 rounded bg-amber-50 border border-amber-200">
                                  <AlertCircle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                                  <p className="text-xs text-amber-800 truncate">{match.breakdown.qualificationWarning}</p>
                                </div>
                              )}

                              <div className="flex gap-1 flex-wrap mb-2">
                                <Badge variant="secondary" className="text-xs">{match.driver.vehicleType}</Badge>
                                {match.driver.rating && (
                                  <Badge variant="outline" className="flex items-center gap-1 text-xs">
                                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                    {match.driver.rating.toFixed(1)}
                                  </Badge>
                                )}
                              </div>

                              {/* Score breakdown — now a button that opens the Sheet */}
                              <button
                                onClick={() => handleViewBreakdown(match)}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                              >
                                <Info className="h-3 w-3" />View compliance & score breakdown
                              </button>
                            </CardContent>
                            <CardFooter className="pt-0">
                              <Button variant="default" size="sm" className="ml-auto" onClick={() => handleSelectDriverMatch(match)}>
                                Request Driver<ArrowRight className="h-4 w-4 ml-1" />
                              </Button>
                            </CardFooter>
                          </Card>
                        );
                      })}

                      {ineligibleDriversForLoad.length > 0 && (
                        <div className="mt-6 border rounded-lg p-3 md:p-4 bg-muted/30">
                          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            Drivers filtered out
                            <span className="text-xs font-normal text-muted-foreground">
                              ({ineligibleDriversForLoad.length})
                            </span>
                          </h4>
                          <p className="text-xs text-muted-foreground mb-3">
                            These drivers in the pool were excluded by hard-eligibility checks (availability or expired documents). Equipment is no longer a hard filter — wrong-equipment drivers appear in the ranked list above with a low score.
                          </p>
                          <ul className="space-y-1.5">
                            {ineligibleDriversForLoad.slice(0, 10).map(({ driver, reason }) => (
                              <li key={driver.id || driver.name} className="text-xs flex items-start gap-2">
                                <span className="font-medium">{driver.name}</span>
                                <span className="text-muted-foreground">— {reason}</span>
                              </li>
                            ))}
                            {ineligibleDriversForLoad.length > 10 && (
                              <li className="text-xs text-muted-foreground italic">
                                …and {ineligibleDriversForLoad.length - 10} more.
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-center p-4 border-2 border-dashed rounded-lg">
                      <Users className="h-12 w-12 text-muted-foreground" />
                      <h3 className="mt-4 text-base font-semibold font-headline">No Matching Drivers</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {ineligibleDriversForLoad.length > 0
                          ? `${ineligibleDriversForLoad.length} driver${ineligibleDriversForLoad.length === 1 ? " was" : "s were"} filtered out — see reasons below.`
                          : "No available drivers in the pool."}
                      </p>
                      {ineligibleDriversForLoad.length > 0 && (
                        <ul className="mt-4 text-left text-xs space-y-1.5 max-w-md w-full">
                          {ineligibleDriversForLoad.slice(0, 10).map(({ driver, reason }) => (
                            <li key={driver.id || driver.name} className="flex items-start gap-2">
                              <span className="font-medium">{driver.name}</span>
                              <span className="text-muted-foreground">— {reason}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                ) : selectionMode === "driver" && selectedMyDriver ? (
                  /* Driver Owner Mode */
                  loadMatches.length > 0 ? (
                    <div className="space-y-4">
                      {loadMatches.map((match) => {
                        const loadOwnerName = (match.load as LoadWithOwner).ownerId
                          ? ownerNames[(match.load as LoadWithOwner).ownerId]
                          : null;
                        return (
                          <Card key={match.load.id} className={`shadow-none overflow-hidden ${match.isBestMatch ? "ring-2 ring-primary" : ""}`}>
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
                              <Button variant="default" size="sm" className="ml-auto w-full" onClick={() => handleSelectLoadMatch(match)}>
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

      {/* Score Breakdown Sheet */}
      <Sheet open={breakdownOpen} onOpenChange={setBreakdownOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base">
                {breakdownMatch?.driver.name} — Score Breakdown
              </SheetTitle>
            </div>
            <SheetDescription className="text-xs">
              Match score: <span className="font-semibold">{breakdownMatch?.score}/100</span>
              {breakdownMatch && ` · ${getMatchQualityLabel(breakdownMatch.score)}`}
            </SheetDescription>
          </SheetHeader>

          {/* Score category bars */}
          {breakdownMatch && (
            <div className="space-y-3 mb-4">
              {([
                { label: "Location", value: breakdownMatch.breakdown.locationScore, max: 35 },
                { label: "Qualification & Compliance", value: breakdownMatch.breakdown.qualificationScore, max: 40 },
                { label: "Vehicle Match", value: breakdownMatch.breakdown.vehicleMatch, max: 20 },
                { label: "Rating", value: breakdownMatch.breakdown.ratingScore, max: 5 },
              ] as const).map(({ label, value, max }) => (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{value}/{max}</span>
                  </div>
                  <Progress value={(value / max) * 100} className="h-1.5" />
                </div>
              ))}
              <div className="flex justify-between text-sm pt-1 border-t font-semibold">
                <span>Total</span>
                <span>{breakdownMatch.score}/100</span>
              </div>
            </div>
          )}

          <Separator className="mb-4" />

          {/* Compliance Scorecard */}
          {breakdownMatch && (
            <ComplianceScorecard
              driver={breakdownMatch.driver}
              role="owner_operator"
              qualificationWarning={breakdownMatch.breakdown.qualificationWarning}
              expiryDetails={breakdownMatch.breakdown.expiryDetails}
              onLearnMore={() => setShowFormula(true)}
            />
          )}

          {/* Learn More formula toggle */}
          {showFormula && breakdownMatch && (
            <>
              <Separator className="my-4" />
              <ScoringFormulaExplainer expiryDetails={breakdownMatch.breakdown.expiryDetails} />
            </>
          )}

          {!showFormula && (
            <button
              onClick={() => setShowFormula(true)}
              className="mt-4 text-xs text-muted-foreground underline hover:text-foreground transition-colors"
            >
              Learn more about how scores are calculated
            </button>
          )}
        </SheetContent>
      </Sheet>

      {/* Match request modals */}
      {selectedLoad && selectedMatchScore && (
        <MatchRequestModal
          open={matchModalOpen}
          onOpenChange={setMatchModalOpen}
          load={selectedLoad}
          matchScore={selectedMatchScore}
          onSuccess={handleMatchSuccess}
        />
      )}
      {selectedMyDriver && selectedLoadMatch && (
        <DriverMatchRequestModal
          open={driverMatchModalOpen}
          onOpenChange={setDriverMatchModalOpen}
          driver={selectedMyDriver}
          loadMatch={selectedLoadMatch}
          onSuccess={handleMatchSuccess}
        />
      )}
    </>
  );
}
