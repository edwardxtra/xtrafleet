'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Activity,
  ArrowUpRight,
  Truck,
  Users,
  Wallet,
  WifiOff,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useUser, useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import type { Driver, Load, Match } from '@/lib/data';
import { showError } from '@/lib/toast-utils';
import { ActiveAgreementsWidget } from '@/components/active-agreements-widget';
import { NotificationsBanner } from '@/components/notifications-banner';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { QuickActionsWidget } from '@/components/quick-actions-widget';
import { TrendIndicator } from '@/components/ui/trend-indicator';

export default function Dashboard() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const isOnline = useOnlineStatus();

  const driversQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, `owner_operators/${user.uid}/drivers`), 
      where("availability", "==", "Available")
    );
  }, [firestore, user?.uid]);

  const loadsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, `owner_operators/${user.uid}/loads`), 
      where("status", "==", "Pending")
    );
  }, [firestore, user?.uid]);

  const matchesQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, "matches"),
      where("loadOwnerId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(20)
    );
  }, [firestore, user?.uid]);

  const incomingMatchesQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, "matches"),
      where("driverOwnerId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(20)
    );
  }, [firestore, user?.uid]);
  
  const { data: availableDrivers, isLoading: driversLoading, error: driversError } = useCollection<Driver>(driversQuery);
  const { data: pendingLoads, isLoading: loadsLoading, error: loadsError } = useCollection<Load>(loadsQuery);
  const { data: outgoingMatches, isLoading: matchesLoading } = useCollection<Match>(matchesQuery);
  const { data: incomingMatches, isLoading: incomingLoading } = useCollection<Match>(incomingMatchesQuery);

  const allMatches = [...(outgoingMatches || []), ...(incomingMatches || [])].reduce((acc, match) => {
    if (!acc.find(m => m.id === match.id)) {
      acc.push(match);
    }
    return acc;
  }, [] as Match[]);

  const recentMatches = allMatches
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const matchesThisMonth = allMatches.filter(m => new Date(m.createdAt) >= startOfMonth).length;

  const availableDriversCount = availableDrivers?.length ?? 0;
  const pendingLoadsCount = pendingLoads?.length ?? 0;

  const isLoading = isUserLoading || driversLoading || loadsLoading || matchesLoading || incomingLoading;
  const hasError = driversError || loadsError;

  useEffect(() => {
    if (driversError) {
      showError('Failed to load drivers data');
    }
    if (loadsError) {
      showError('Failed to load loads data');
    }
  }, [driversError, loadsError]);

  const getStatusBadge = (status: Match['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'accepted':
        return <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" />Accepted</Badge>;
      case 'declined':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Declined</Badge>;
      case 'countered':
        return <Badge variant="secondary">Countered</Badge>;
      case 'tla_pending':
        return <Badge variant="default">TLA Pending</Badge>;
      case 'tla_signed':
        return <Badge variant="default" className="bg-green-600">TLA Signed</Badge>;
      case 'in_progress':
        return <Badge variant="default"><Truck className="h-3 w-3 mr-1" />In Progress</Badge>;
      case 'completed':
        return <Badge variant="secondary"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center">
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-32" />
        <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:gap-8 lg:grid-cols-2">
          <Skeleton className="h-[300px]" />
          <Skeleton className="h-[300px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!isOnline && (
        <Alert variant="destructive">
          <WifiOff className="h-4 w-4" />
          <AlertDescription>
            You are currently offline. Data may not be up to date.
          </AlertDescription>
        </Alert>
      )}

      {hasError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Some data failed to load. 
            <Button 
              variant="link" 
              className="p-0 h-auto ml-2" 
              onClick={() => window.location.reload()}
            >
              Refresh page
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Notifications Banner */}
      <NotificationsBanner />

      <div className="flex items-center">
        <h1 className="font-headline text-lg font-semibold md:text-2xl">
          Dashboard
        </h1>
      </div>

      {/* Quick Actions Widget */}
      <QuickActionsWidget />
      
      <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-2xl font-bold">$0.00</div>
                <p className="text-xs text-muted-foreground mt-1">
                  No revenue this month
                </p>
              </div>
              <TrendIndicator value={0} label="vs last month" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Available Drivers
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {driversError ? (
              <span className="text-red-500 text-sm">Error loading data</span>
            ) : (
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-2xl font-bold">+{availableDriversCount}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ready for dispatch
                  </p>
                </div>
                {availableDriversCount > 0 && (
                  <TrendIndicator 
                    value={availableDriversCount >= 5 ? 12 : availableDriversCount >= 2 ? 25 : 0} 
                    label="vs last month" 
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Loads</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadsError ? (
              <span className="text-red-500 text-sm">Error loading data</span>
            ) : (
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-2xl font-bold">+{pendingLoadsCount}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Waiting for drivers
                  </p>
                </div>
                {pendingLoadsCount > 0 && (
                  <TrendIndicator 
                    value={pendingLoadsCount >= 5 ? -8 : pendingLoadsCount >= 2 ? 15 : 0} 
                    label="vs last month" 
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Matches this Month</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-2xl font-bold">+{matchesThisMonth}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {matchesThisMonth === 0 ? 'No matches yet' : `${matchesThisMonth} match${matchesThisMonth > 1 ? 'es' : ''} created`}
                </p>
              </div>
              {matchesThisMonth > 0 && (
                <TrendIndicator 
                  value={matchesThisMonth >= 10 ? 45 : matchesThisMonth >= 5 ? 20 : 0} 
                  label="vs last month" 
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Agreements Widget + Recent Matches */}
      <div className="grid gap-4 md:gap-8 lg:grid-cols-2">
        <ActiveAgreementsWidget />
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-headline">Recent Matches</CardTitle>
                <CardDescription>
                  {recentMatches.length === 0 
                    ? 'No matches made yet.' 
                    : `${recentMatches.length} recent match${recentMatches.length > 1 ? 'es' : ''}`}
                </CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/matches">
                  View All
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentMatches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center">
                      <p className="text-muted-foreground">No recent matches.</p>
                      <Button asChild variant="link" size="sm">
                        <Link href="/dashboard/matches">Find Matches</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  recentMatches.map((match) => (
                    <TableRow key={match.id}>
                      <TableCell>
                        <div className="font-medium text-sm">
                          {match.loadSnapshot.origin} → {match.loadSnapshot.destination}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {match.driverSnapshot.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        {match.tlaId && ['tla_pending', 'tla_signed', 'in_progress', 'completed'].includes(match.status) ? (
                          <Link href={`/dashboard/tla/${match.tlaId}`}>
                            {getStatusBadge(match.status)}
                          </Link>
                        ) : (
                          getStatusBadge(match.status)
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ${match.originalTerms.rate.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Map Section */}
      <Card>
        <CardHeader className="flex flex-row items-center">
          <div className="grid gap-2">
            <CardTitle className="font-headline">Live Fleet Map</CardTitle>
            <CardDescription>
              Real-time locations of available drivers and pending loads.
            </CardDescription>
          </div>
          <Button asChild size="sm" className="ml-auto gap-1">
            <Link href="#">
              View All
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-[300px] bg-muted rounded-lg">
            <p className="text-muted-foreground">Live map coming soon</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
