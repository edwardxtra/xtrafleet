"use client";

import { useState } from "react";
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
  Info
} from "lucide-react";
import { useUser, useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, where, collectionGroup } from 'firebase/firestore';
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
  
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  // Query for current user's pending loads
  const loadsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, `owner_operators/${user.uid}/loads`), 
      where("status", "==", "Pending")
    );
  }, [firestore, user?.uid]);

  // Collection Group Query - gets drivers from ALL owner_operators
  const driversQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return collectionGroup(firestore, 'drivers');
  }, [firestore, user?.uid]);

  const { data: pendingLoads, isLoading: loadsLoading } = useCollection<Load>(loadsQuery);
  const { data: allDrivers, isLoading: driversLoading } = useCollection<Driver>(driversQuery);

  // Filter to only show:
  // 1. Available drivers
  // 2. Green compliance
  // 3. NOT owned by current user (can't hire your own drivers)
  const availableGreenDrivers = allDrivers?.filter(driver => {
    const status = getComplianceStatus(driver);
    const isOwnDriver = driver.ownerId === user?.uid;
    return !isOwnDriver && driver.availability === 'Available' && status === 'Green';
  }) || [];

  const handleLoadSelect = (load: Load) => {
    setSelectedLoad(load);
    setSelectedDriver(null);
  };

  const handleDriverSelect = (driver: Driver) => {
    setSelectedDriver(driver);
    setSelectedLoad(null);
  };

  const handleSelectDriver = (match: MatchScore) => {
    setSelectedMatchScore(match);
    setMatchModalOpen(true);
  };

  const handleMatchSuccess = () => {
    // Reset selection after successful match request
    setSelectedLoad(null);
    setSelectedMatchScore(null);
  };

  // Get ranked matches using the matching algorithm
  // Pass all drivers (not just availableGreenDrivers) - the algorithm will filter
  const driverMatches = selectedLoad && allDrivers 
    ? findMatchingDrivers(selectedLoad, allDrivers.filter(d => d.ownerId !== user?.uid), { 
        onlyGreenCompliance: true, 
        onlyAvailable: true,
        maxResults: 10 
      })
    : [];

  const loadMatches = selectedDriver && pendingLoads
    ? findMatchingLoads(selectedDriver, pendingLoads, { maxResults: 10 })
    : [];
  
  const getComplianceBadgeVariant = (status: ComplianceStatus) => {
    switch (status) {
      case 'Green': return 'default';
      case 'Yellow': return 'secondary';
      case 'Red': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pending Loads */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="font-headline flex items-center gap-2">
                <Truck /> Pending Loads
              </CardTitle>
              <CardDescription>Select a load to see ranked driver matches.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 flex-grow">
              <ScrollArea className="h-[60vh] md:h-[calc(80vh-10rem)]">
                <div className="p-6 pt-0">
                  {loadsLoading ? (
                    <div className="p-6 text-center text-muted-foreground">Loading loads...</div>
                  ) : pendingLoads && pendingLoads.length > 0 ? (
                    pendingLoads.map((load) => (
                      <div key={load.id}>
                        <button
                          onClick={() => handleLoadSelect(load)}
                          className={`w-full text-left p-3 rounded-lg transition-colors ${
                            selectedLoad?.id === load.id ? 'bg-muted' : 'hover:bg-muted/50'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-semibold">{load.origin} → {load.destination}</p>
                              <p className="text-sm text-muted-foreground">
                                {load.cargo} • {load.weight.toLocaleString()} lbs
                              </p>
                              {load.price && (
                                <p className="text-sm font-medium text-green-600">
                                  ${load.price.toLocaleString()}
                                </p>
                              )}
                            </div>
                            {selectedLoad?.id === load.id && (
                              <CheckCircle className="h-5 w-5 text-primary" />
                            )}
                          </div>
                        </button>
                        <Separator className="my-1" />
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center text-muted-foreground">
                      No pending loads.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
          
          {/* Available Drivers (Green Compliance Only, from other fleets) */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="font-headline flex items-center gap-2">
                <Users /> Available Drivers
              </CardTitle>
              <CardDescription>
                Drivers from other fleets (green compliance only).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 flex-grow">
              <ScrollArea className="h-[60vh] md:h-[calc(80vh-10rem)]">
                <div className="p-6 pt-0">
                  {driversLoading ? (
                    <div className="p-6 text-center text-muted-foreground">Loading drivers...</div>
                  ) : availableGreenDrivers.length > 0 ? (
                    availableGreenDrivers.map((driver) => {
                      const complianceStatus = getComplianceStatus(driver);
                      return (
                        <div key={driver.id}>
                          <button
                            onClick={() => handleDriverSelect(driver)}
                            className={`w-full text-left p-3 rounded-lg transition-colors ${
                              selectedDriver?.id === driver.id ? 'bg-muted' : 'hover:bg-muted/50'
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold">{driver.name}</p>
                                  <Badge variant={getComplianceBadgeVariant(complianceStatus)} className="text-xs">
                                    <ShieldCheck className="h-3 w-3 mr-1" />
                                    {complianceStatus}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {driver.location} • {driver.vehicleType}
                                </p>
                                {driver.rating && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                    <span className="text-xs">{driver.rating.toFixed(1)}</span>
                                  </div>
                                )}
                              </div>
                              {selectedDriver?.id === driver.id && (
                                <CheckCircle className="h-5 w-5 text-primary" />
                              )}
                            </div>
                          </button>
                          <Separator className="my-1" />
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-6 text-center">
                      <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">No available drivers from other fleets.</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Drivers must be available and have all documents up to date.
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
        
        {/* Matches Panel */}
        <Card className="lg:col-span-1 flex flex-col">
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2">
              <Link2 /> Ranked Matches
            </CardTitle>
            <CardDescription>
              {selectedLoad 
                ? `Top driver matches for load to ${selectedLoad.destination}` 
                : selectedDriver 
                  ? `Top load matches for ${selectedDriver.name}` 
                  : "Select a load or driver to see matches"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-grow overflow-hidden">
            {selectedLoad ? (
              driverMatches.length > 0 ? (
                <ScrollArea className="h-full">
                  <div className="space-y-4 p-1">
                    {driverMatches.map((match) => {
                      const complianceStatus = getComplianceStatus(match.driver);
                      return (
                        <Card 
                          key={match.driver.id} 
                          className={`shadow-none overflow-hidden ${
                            match.isBestMatch ? 'ring-2 ring-primary' : ''
                          }`}
                        >
                          {/* Best Match Banner - Inside the card */}
                          {match.isBestMatch && (
                            <div className="bg-primary text-primary-foreground px-3 py-1.5 flex items-center gap-2 text-sm font-medium">
                              <Trophy className="h-4 w-4" />
                              Best Match
                            </div>
                          )}
                          
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-lg font-bold text-muted-foreground">
                                    #{match.rank}
                                  </span>
                                  <CardTitle className="text-lg flex items-center gap-2">
                                    <User className="h-4 w-4" />
                                    {match.driver.name}
                                  </CardTitle>
                                </div>
                                <CardDescription className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {match.driver.location}
                                </CardDescription>
                              </div>
                              <Badge variant={getComplianceBadgeVariant(complianceStatus)}>
                                <ShieldCheck className="h-3 w-3 mr-1" />
                                {complianceStatus}
                              </Badge>
                            </div>
                          </CardHeader>
                          
                          <CardContent className="pb-2">
                            {/* Match Score */}
                            <div className="mb-3">
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-muted-foreground">Match Score</span>
                                <span className="font-semibold">{match.score}/100</span>
                              </div>
                              <Progress value={match.score} className="h-2" />
                              <p className="text-xs text-muted-foreground mt-1">
                                {getMatchQualityLabel(match.score)}
                              </p>
                            </div>

                            {/* Driver Details */}
                            <div className="flex gap-1 flex-wrap mb-2">
                              <Badge variant="secondary">{match.driver.vehicleType}</Badge>
                              {match.driver.certifications?.map(c => (
                                <Badge key={c} variant="outline">{c}</Badge>
                              ))}
                              {match.driver.rating && (
                                <Badge variant="outline" className="flex items-center gap-1">
                                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                  {match.driver.rating.toFixed(1)}
                                </Badge>
                              )}
                            </div>

                            {/* Score Breakdown */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                  <Info className="h-3 w-3" />
                                  View score breakdown
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="w-64">
                                <p className="font-semibold mb-2">Score Breakdown</p>
                                <div className="space-y-1 text-xs">
                                  <div className="flex justify-between">
                                    <span>Vehicle Match:</span>
                                    <span>{match.breakdown.vehicleMatch}/30</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Qualifications:</span>
                                    <span>{match.breakdown.qualificationMatch}/25</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Location:</span>
                                    <span>{match.breakdown.locationScore}/20</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Rating:</span>
                                    <span>{match.breakdown.ratingScore}/15</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Compliance:</span>
                                    <span>{match.breakdown.complianceScore}/10</span>
                                  </div>
                                  <Separator className="my-2" />
                                  <div className="flex justify-between font-semibold">
                                    <span>Total:</span>
                                    <span>{match.score}/100</span>
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>

                            {match.driver.profileSummary && (
                              <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                                {match.driver.profileSummary}
                              </p>
                            )}
                          </CardContent>
                          
                          <CardFooter>
                            <Button 
                              variant="default" 
                              className="ml-auto"
                              onClick={() => handleSelectDriver(match)}
                            >
                              Select Driver
                              <ArrowRight className="h-4 w-4 ml-2" />
                            </Button>
                          </CardFooter>
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-8 border-2 border-dashed rounded-lg">
                  <Users className="h-16 w-16 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold font-headline">
                    No Matching Drivers
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    No available green-compliance drivers from other fleets match this load's requirements.
                  </p>
                </div>
              )
            ) : selectedDriver ? (
              loadMatches.length > 0 ? (
                <ScrollArea className="h-full">
                  <div className="space-y-4 p-1">
                    {loadMatches.map((match) => (
                      <Card 
                        key={match.load.id} 
                        className={`shadow-none overflow-hidden ${
                          match.isBestMatch ? 'ring-2 ring-primary' : ''
                        }`}
                      >
                        {match.isBestMatch && (
                          <div className="bg-primary text-primary-foreground px-3 py-1.5 flex items-center gap-2 text-sm font-medium">
                            <Trophy className="h-4 w-4" />
                            Best Match
                          </div>
                        )}
                        
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-lg font-bold text-muted-foreground">
                                  #{match.rank}
                                </span>
                                <CardTitle className="text-lg flex items-center gap-2">
                                  <Truck className="h-4 w-4" />
                                  {match.load.origin} → {match.load.destination}
                                </CardTitle>
                              </div>
                              <CardDescription>
                                {match.load.cargo} • {match.load.weight.toLocaleString()} lbs
                              </CardDescription>
                            </div>
                            {match.load.price && (
                              <Badge variant="secondary" className="text-green-600">
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
                          </div>

                          {match.load.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {match.load.description}
                            </p>
                          )}
                        </CardContent>
                        
                        <CardFooter>
                          <Button variant="default" className="ml-auto">
                            Select Load
                            <ArrowRight className="h-4 w-4 ml-2" />
                          </Button>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-8 border-2 border-dashed rounded-lg">
                  <Truck className="h-16 w-16 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold font-headline">
                    No Matching Loads
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    No pending loads match this driver's qualifications.
                  </p>
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8 border-2 border-dashed rounded-lg">
                <Link2 className="h-16 w-16 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold font-headline">
                  Select a Load or Driver
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Choose an item from the lists to view ranked matches.
                </p>
                <div className="mt-4 p-4 bg-muted/50 rounded-lg text-left text-sm">
                  <p className="font-medium mb-2">Matching Algorithm:</p>
                  <ul className="space-y-1 text-muted-foreground text-xs">
                    <li>• Shows drivers from other fleets only</li>
                    <li>• Only green compliance drivers eligible</li>
                    <li>• Ranked by vehicle, qualifications, location</li>
                    <li>• Driver rating factored into score</li>
                    <li>• #1 highlighted as "Best Match"</li>
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Match Request Modal */}
      {selectedLoad && selectedMatchScore && (
        <MatchRequestModal
          open={matchModalOpen}
          onOpenChange={setMatchModalOpen}
          load={selectedLoad}
          matchScore={selectedMatchScore}
          onSuccess={handleMatchSuccess}
        />
      )}
    </TooltipProvider>
  );
}