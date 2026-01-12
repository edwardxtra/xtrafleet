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
  Lock
} from "lucide-react";
import { useUser, useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, where, collectionGroup, doc, getDoc } from 'firebase/firestore';
import { getComplianceStatus, ComplianceStatus } from "@/lib/compliance";
import { 
  findMatchingDrivers, 
  findMatchingLoads, 
  getMatchQualityLabel,
  MatchScore 
} from "@/lib/matching";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { MatchRequestModal } from "@/components/match-request-modal";

export default function MatchesPage() {
  const [selectedLoad, setSelectedLoad] = useState<Load | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [selectedMatchScore, setSelectedMatchScore] = useState<MatchScore | null>(null);
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const loadsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, `owner_operators/${user.uid}/loads`), 
      where("status", "==", "Pending")
    );
  }, [firestore, user?.uid]);

  const driversQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return collectionGroup(firestore, 'drivers');
  }, [firestore, user?.uid]);

  const { data: pendingLoads, isLoading: loadsLoading } = useCollection<Load>(loadsQuery);
  const { data: allDrivers, isLoading: driversLoading } = useCollection<Driver>(driversQuery);

  useEffect(() => {
    async function fetchOwnerNames() {
      if (!firestore || !allDrivers) return;
      const ownerIds = [...new Set(allDrivers.map(d => d.ownerId).filter(Boolean))];
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
  }, [firestore, allDrivers]);

  const displayDrivers = allDrivers?.filter(driver => {
    const status = getComplianceStatus(driver);
    const isActive = driver.isActive !== false;
    return isActive && driver.availability === 'Available' && status === 'Green';
  }) || [];

  const handleLoadSelect = (load: Load) => {
    setSelectedLoad(load);
    setSelectedDriver(null);
  };

  const handleDriverSelect = (driver: Driver) => {
    if (driver.ownerId === user?.uid) return;
    setSelectedDriver(driver);
    setSelectedLoad(null);
  };

  const handleSelectDriver = (match: MatchScore) => {
    setSelectedMatchScore(match);
    setMatchModalOpen(true);
  };

  const handleMatchSuccess = () => {
    setSelectedLoad(null);
    setSelectedMatchScore(null);
  };

  const driverMatches = selectedLoad && allDrivers 
    ? findMatchingDrivers(selectedLoad, allDrivers.filter(d => d.ownerId !== user?.uid && d.isActive !== false), { 
        onlyGreenCompliance: true, 
        onlyAvailable: true,
        maxResults: 10 
      })
    : [];

  const loadMatches = selectedDriver && pendingLoads
    ? findMatchingLoads(selectedDriver, pendingLoads, { maxResults: 10 })
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
          <Card className="flex flex-col h-full overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="font-headline flex items-center gap-2">
                <Truck className="h-5 w-5" /> Pending Loads
              </CardTitle>
              <CardDescription>Select a load to see ranked driver matches.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-6 pt-0">
                  {loadsLoading ? (
                    <div className="p-6 text-center text-muted-foreground">Loading loads...</div>
                  ) : pendingLoads && pendingLoads.length > 0 ? (
                    pendingLoads.map((load) => (
                      <div key={load.id}>
                        <button onClick={() => handleLoadSelect(load)} className={`w-full text-left p-3 rounded-lg transition-colors ${selectedLoad?.id === load.id ? 'bg-muted' : 'hover:bg-muted/50'}`}>
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-semibold">{load.origin} → {load.destination}</p>
                              <p className="text-sm text-muted-foreground">{load.cargo} • {load.weight.toLocaleString()} lbs</p>
                              {load.price && <p className="text-sm font-medium text-green-600">${load.price.toLocaleString()}</p>}
                            </div>
                            {selectedLoad?.id === load.id && <CheckCircle className="h-5 w-5 text-primary" />}
                          </div>
                        </button>
                        <Separator className="my-1" />
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center text-muted-foreground">No pending loads.</div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
          
          <Card className="flex flex-col h-full overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="font-headline flex items-center gap-2">
                <Users className="h-5 w-5" /> Available Drivers
              </CardTitle>
              <CardDescription>Green compliance drivers. Your drivers shown but disabled.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-6 pt-0">
                  {driversLoading ? (
                    <div className="p-6 text-center text-muted-foreground">Loading drivers...</div>
                  ) : displayDrivers.length > 0 ? (
                    displayDrivers.map((driver) => {
                      const complianceStatus = getComplianceStatus(driver);
                      const companyName = driver.ownerId ? ownerNames[driver.ownerId] : null;
                      const isOwnDriver = driver.ownerId === user?.uid;
                      return (
                        <div key={driver.id}>
                          <button onClick={() => handleDriverSelect(driver)} disabled={isOwnDriver} className={`w-full text-left p-3 rounded-lg transition-colors ${isOwnDriver ? 'opacity-50 cursor-not-allowed bg-muted/30' : selectedDriver?.id === driver.id ? 'bg-muted' : 'hover:bg-muted/50'}`}>
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold">{driver.name}</p>
                                  {isOwnDriver && <Badge variant="outline" className="text-xs"><Lock className="h-3 w-3 mr-1" />Your Driver</Badge>}
                                  {!isOwnDriver && <Badge className={getComplianceBadgeStyle(complianceStatus)}><ShieldCheck className="h-3 w-3 mr-1" />{complianceStatus}</Badge>}
                                </div>
                                <p className="text-sm text-muted-foreground">{driver.location} • {driver.vehicleType}</p>
                                {companyName && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Building2 className="h-3 w-3" />{companyName}</p>}
                                {driver.rating && !isOwnDriver && <div className="flex items-center gap-1 mt-1"><Star className="h-3 w-3 fill-yellow-400 text-yellow-400" /><span className="text-xs">{driver.rating.toFixed(1)}</span></div>}
                              </div>
                              {selectedDriver?.id === driver.id && !isOwnDriver && <CheckCircle className="h-5 w-5 text-primary" />}
                            </div>
                          </button>
                          <Separator className="my-1" />
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-6 text-center">
                      <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">No available drivers.</p>
                      <p className="text-xs text-muted-foreground mt-1">Drivers must be available and have all documents up to date.</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
        
        <Card className="lg:col-span-1 flex flex-col h-full overflow-hidden">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="font-headline flex items-center gap-2"><Link2 className="h-5 w-5" /> Ranked Matches</CardTitle>
            <CardDescription className="truncate">{selectedLoad ? `Top driver matches for load to ${selectedLoad.destination}` : selectedDriver ? `Top load matches for ${selectedDriver.name}` : "Select a load or driver to see matches"}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full">
              <div className="p-6 pt-0">
                {selectedLoad ? (
                  driverMatches.length > 0 ? (
                    <div className="space-y-4">
                      {driverMatches.map((match) => {
                        const complianceStatus = getComplianceStatus(match.driver);
                        const companyName = match.driver.ownerId ? ownerNames[match.driver.ownerId] : null;
                        return (
                          <Card key={match.driver.id} className={`shadow-none overflow-hidden ${match.isBestMatch ? 'ring-2 ring-primary' : ''}`}>
                            {match.isBestMatch && <div className="bg-primary text-primary-foreground px-3 py-1.5 flex items-center gap-2 text-sm font-medium"><Trophy className="h-4 w-4" />Best Match</div>}
                            <CardHeader className="pb-2">
                              <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-lg font-bold text-muted-foreground">#{match.rank}</span>
                                    <CardTitle className="text-base flex items-center gap-1"><User className="h-4 w-4 flex-shrink-0" /><span className="truncate">{match.driver.name}</span></CardTitle>
                                  </div>
                                  <CardDescription className="flex items-center gap-1 text-xs"><MapPin className="h-3 w-3 flex-shrink-0" /><span className="truncate">{match.driver.location}</span></CardDescription>
                                  {companyName && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Building2 className="h-3 w-3 flex-shrink-0" /><span className="truncate">{companyName}</span></p>}
                                </div>
                                <Badge className={`flex-shrink-0 text-xs ${getComplianceBadgeStyle(complianceStatus)}`}><ShieldCheck className="h-3 w-3 mr-1" />{complianceStatus}</Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="pb-2">
                              <div className="mb-3">
                                <div className="flex justify-between text-sm mb-1"><span className="text-muted-foreground">Match Score</span><span className="font-semibold">{match.score}/100</span></div>
                                <Progress value={match.score} className="h-2" />
                                <p className="text-xs text-muted-foreground mt-1">{getMatchQualityLabel(match.score)}</p>
                              </div>
                              <div className="flex gap-1 flex-wrap mb-2">
                                <Badge variant="secondary" className="text-xs">{match.driver.vehicleType}</Badge>
                                {match.driver.rating && <Badge variant="outline" className="flex items-center gap-1 text-xs"><Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />{match.driver.rating.toFixed(1)}</Badge>}
                              </div>
                              <Tooltip>
                                <TooltipTrigger asChild><button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"><Info className="h-3 w-3" />View score breakdown</button></TooltipTrigger>
                                <TooltipContent side="left" className="w-64">
                                  <p className="font-semibold mb-2">Score Breakdown</p>
                                  <div className="space-y-1 text-xs">
                                    <div className="flex justify-between"><span>Vehicle Match:</span><span>{match.breakdown.vehicleMatch}/30</span></div>
                                    <div className="flex justify-between"><span>Qualifications:</span><span>{match.breakdown.qualificationMatch}/25</span></div>
                                    <div className="flex justify-between"><span>Location:</span><span>{match.breakdown.locationScore}/20</span></div>
                                    <div className="flex justify-between"><span>Rating:</span><span>{match.breakdown.ratingScore}/15</span></div>
                                    <div className="flex justify-between"><span>Compliance:</span><span>{match.breakdown.complianceScore}/10</span></div>
                                    <Separator className="my-2" />
                                    <div className="flex justify-between font-semibold"><span>Total:</span><span>{match.score}/100</span></div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </CardContent>
                            <CardFooter className="pt-0"><Button variant="default" size="sm" className="ml-auto" onClick={() => handleSelectDriver(match)}>Select Driver<ArrowRight className="h-4 w-4 ml-1" /></Button></CardFooter>
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
                ) : selectedDriver ? (
                  loadMatches.length > 0 ? (
                    <div className="space-y-4">
                      {loadMatches.map((match) => (
                        <Card key={match.load.id} className={`shadow-none overflow-hidden ${match.isBestMatch ? 'ring-2 ring-primary' : ''}`}>
                          {match.isBestMatch && <div className="bg-primary text-primary-foreground px-3 py-1.5 flex items-center gap-2 text-sm font-medium"><Trophy className="h-4 w-4" />Best Match</div>}
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-lg font-bold text-muted-foreground">#{match.rank}</span>
                                  <CardTitle className="text-base flex items-center gap-1"><Truck className="h-4 w-4 flex-shrink-0" /><span className="truncate">{match.load.origin} → {match.load.destination}</span></CardTitle>
                                </div>
                                <CardDescription className="truncate text-xs">{match.load.cargo} • {match.load.weight.toLocaleString()} lbs</CardDescription>
                              </div>
                              {match.load.price && <Badge variant="secondary" className="text-green-600 flex-shrink-0 text-xs">${match.load.price.toLocaleString()}</Badge>}
                            </div>
                          </CardHeader>
                          <CardContent className="pb-2">
                            <div className="mb-3">
                              <div className="flex justify-between text-sm mb-1"><span className="text-muted-foreground">Match Score</span><span className="font-semibold">{match.score}/100</span></div>
                              <Progress value={match.score} className="h-2" />
                            </div>
                          </CardContent>
                          <CardFooter className="pt-0"><Button variant="default" size="sm" className="ml-auto">Select Load<ArrowRight className="h-4 w-4 ml-1" /></Button></CardFooter>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-center p-4 border-2 border-dashed rounded-lg">
                      <Truck className="h-12 w-12 text-muted-foreground" />
                      <h3 className="mt-4 text-base font-semibold font-headline">No Matching Loads</h3>
                      <p className="mt-2 text-sm text-muted-foreground">No pending loads match this driver.</p>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-center p-4 border-2 border-dashed rounded-lg">
                    <Link2 className="h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-4 text-base font-semibold font-headline">Select a Load or Driver</h3>
                    <p className="mt-2 text-sm text-muted-foreground">Choose from the lists to view ranked matches.</p>
                    <div className="mt-4 p-3 bg-muted/50 rounded-lg text-left text-xs">
                      <p className="font-medium mb-1">Matching Algorithm:</p>
                      <ul className="space-y-0.5 text-muted-foreground">
                        <li>• Your drivers shown but disabled</li>
                        <li>• Only green compliance eligible</li>
                        <li>• Ranked by vehicle & location</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {selectedLoad && selectedMatchScore && (
        <MatchRequestModal open={matchModalOpen} onOpenChange={setMatchModalOpen} load={selectedLoad} matchScore={selectedMatchScore} onSuccess={handleMatchSuccess} />
      )}
    </TooltipProvider>
  );
}
