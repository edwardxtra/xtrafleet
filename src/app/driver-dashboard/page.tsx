'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, getDoc, query, collection, where, orderBy, limit } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Truck,
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  TrendingUp,
  AlertCircle,
  WifiOff,
} from 'lucide-react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { DQFCompletionModal } from '@/components/dqf-completion-modal';

interface Match {
  id: string;
  status: string;
  loadSnapshot: {
    origin: string;
    destination: string;
    pickupDate: string;
  };
  originalTerms: {
    rate: number;
  };
  createdAt: string;
  tlaId?: string;
}

export default function DriverDashboard() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [ownerId, setOwnerId] = useState<string>('');
  const [driverName, setDriverName] = useState<string>('');
  const [dqfStatus, setDqfStatus] = useState<string>('');
  const [showDqfModal, setShowDqfModal] = useState(false);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    async function loadDriverInfo() {
      if (!user || !db) return;

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) return;

        const userData = userDoc.data();
        if (userData.role !== 'driver') {
          router.push('/dashboard');
          return;
        }

        setOwnerId(userData.ownerId);

        const driverDoc = await getDoc(doc(db, 'owner_operators', userData.ownerId, 'drivers', user.uid));
        if (driverDoc.exists()) {
          const driverData = driverDoc.data();
          setDriverName(driverData.name);
          setDqfStatus(driverData.dqfStatus || 'not_required');
          
          if (driverData.dqfStatus === 'pending') {
            setShowDqfModal(true);
          }
        }
      } finally {
        setLoading(false);
      }
    }

    if (user && db) {
      loadDriverInfo();
    }
  }, [user, db, router]);

  const handleDqfComplete = () => {
    setShowDqfModal(false);
    setDqfStatus('submitted');
  };

  const matchesQuery = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return query(
      collection(db, 'matches'),
      where('driverId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
  }, [db, user?.uid]);

  const { data: matches } = useCollection<Match>(matchesQuery);

  const activeMatches = matches?.filter(m => 
    ['accepted', 'tla_pending', 'tla_signed', 'in_progress'].includes(m.status)
  ) || [];
  
  const completedMatches = matches?.filter(m => m.status === 'completed') || [];
  const pendingMatches = matches?.filter(m => m.status === 'pending') || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'accepted':
        return <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" />Accepted</Badge>;
      case 'declined':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Declined</Badge>;
      case 'tla_pending':
        return <Badge variant="default" className="bg-blue-600">TLA Pending</Badge>;
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

  if (isUserLoading || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <>
      <DQFCompletionModal 
        open={showDqfModal} 
        onOpenChange={setShowDqfModal}
        onComplete={handleDqfComplete}
      />

      <div className="space-y-6">
        {!isOnline && (
          <Alert variant="destructive">
            <WifiOff className="h-4 w-4" />
            <AlertDescription>
              You are currently offline. Data may not be up to date.
            </AlertDescription>
          </Alert>
        )}

        {dqfStatus === 'submitted' && (
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertDescription>
              Your Driver Qualification File is pending review by your fleet owner.
            </AlertDescription>
          </Alert>
        )}

        {dqfStatus === 'pending' && !showDqfModal && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>You need to complete your Driver Qualification File to start matching with loads.</span>
              <Button size="sm" onClick={() => setShowDqfModal(true)}>
                Complete Now
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div>
          <h1 className="text-3xl font-bold mb-2">Welcome back{driverName && `, ${driverName.split(' ')[0]}`}!</h1>
          <p className="text-muted-foreground">Here's an overview of your activity</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Matches</CardTitle>
              <Truck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeMatches.length}</div>
              <p className="text-xs text-muted-foreground">
                {activeMatches.length === 0 ? 'No active loads' : 'Currently in progress'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completedMatches.length}</div>
              <p className="text-xs text-muted-foreground">
                {completedMatches.length === 0 ? 'No completed loads yet' : 'Total completed'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingMatches.length}</div>
              <p className="text-xs text-muted-foreground">
                {pendingMatches.length === 0 ? 'No pending requests' : 'Awaiting response'}
              </p>
            </CardContent>
          </Card>
        </div>

        {activeMatches.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Active Agreements</CardTitle>
              <CardDescription>Transportation Load Agreements in progress</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {activeMatches.map((match) => (
                  <div
                    key={match.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">
                          {match.loadSnapshot.origin} → {match.loadSnapshot.destination}
                        </p>
                        {getStatusBadge(match.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Pickup: {format(parseISO(match.loadSnapshot.pickupDate), 'MMM dd, yyyy')}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Rate</p>
                        <p className="font-semibold">${match.originalTerms.rate.toLocaleString()}</p>
                      </div>
                      {match.tlaId && (
                        <Button asChild size="sm">
                          <Link href={`/dashboard/tla/${match.tlaId}`}>
                            <FileText className="h-4 w-4 mr-2" />
                            View TLA
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Matches</CardTitle>
                <CardDescription>
                  {matches && matches.length > 0 
                    ? `Your last ${Math.min(matches.length, 20)} match${matches.length !== 1 ? 'es' : ''}`
                    : 'No matches yet'}
                </CardDescription>
              </div>
              {matches && matches.length > 0 && (
                <Button asChild variant="outline" size="sm">
                  <Link href="/driver-dashboard/matches">
                    View All
                  </Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!matches || matches.length === 0 ? (
              <div className="text-center py-12">
                <Truck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Matches Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Matches will appear here once owner-operators send you load requests
                </p>
                <Button asChild>
                  <Link href="/driver-dashboard/profile">
                    Complete Your Profile
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {matches.slice(0, 5).map((match) => (
                  <div
                    key={match.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">
                          {match.loadSnapshot.origin} → {match.loadSnapshot.destination}
                        </p>
                        {getStatusBadge(match.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {format(parseISO(match.createdAt), 'MMM dd, yyyy h:mm a')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Rate</p>
                      <p className="font-semibold">${match.originalTerms.rate.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {matches && matches.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <Button asChild variant="outline" className="h-auto py-4">
                  <Link href="/driver-dashboard/matches">
                    <div className="flex items-center gap-3">
                      <Truck className="h-5 w-5" />
                      <div className="text-left">
                        <p className="font-medium">View All Matches</p>
                        <p className="text-sm text-muted-foreground">See complete match history</p>
                      </div>
                    </div>
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-auto py-4">
                  <Link href="/driver-dashboard/profile">
                    <div className="flex items-center gap-3">
                      <TrendingUp className="h-5 w-5" />
                      <div className="text-left">
                        <p className="font-medium">Update Profile</p>
                        <p className="text-sm text-muted-foreground">Manage your information</p>
                      </div>
                    </div>
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
