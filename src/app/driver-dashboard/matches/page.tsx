'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Package, MapPin, Calendar, DollarSign, Truck } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface Match {
  id: string;
  loadId: string;
  pickupLocation: string;
  deliveryLocation: string;
  pickupDate: string;
  deliveryDate: string;
  rate: number;
  status: 'completed' | 'in-progress' | 'cancelled';
  completedDate?: string;
  distance?: number;
  weight?: number;
  commodity?: string;
}

export default function DriverMatches() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownerId, setOwnerId] = useState<string>('');

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    async function loadMatches() {
      if (!user || !db) return;

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) {
          throw new Error('User not found');
        }

        const userData = userDoc.data();
        if (userData.role !== 'driver') {
          router.push('/dashboard');
          return;
        }

        const ownerOperatorId = userData.ownerId;
        setOwnerId(ownerOperatorId);

        // TODO: Query matches for this driver from Firestore
        // For now, show placeholder message
        setMatches([]);
        
      } catch (error) {
        console.error('Error loading matches:', error);
      } finally {
        setLoading(false);
      }
    }

    if (user && db) {
      loadMatches();
    }
  }, [user, db, router]);

  if (isUserLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-600 hover:bg-green-700';
      case 'in-progress':
        return 'bg-blue-600 hover:bg-blue-700';
      case 'cancelled':
        return 'bg-gray-600 hover:bg-gray-700';
      default:
        return '';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'in-progress':
        return 'In Progress';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">Past Matches</h2>
        <p className="text-gray-600">View your match history and completed trips</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Matches</p>
                <p className="text-3xl font-bold">{matches.length}</p>
              </div>
              <Package className="h-8 w-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Completed</p>
                <p className="text-3xl font-bold text-green-600">
                  {matches.filter(m => m.status === 'completed').length}
                </p>
              </div>
              <Truck className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Earnings</p>
                <p className="text-3xl font-bold text-blue-600">
                  ${matches.filter(m => m.status === 'completed').reduce((sum, m) => sum + m.rate, 0).toLocaleString()}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Matches List */}
      <Card>
        <CardHeader>
          <CardTitle>Match History</CardTitle>
        </CardHeader>
        <CardContent>
          {matches.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg mb-2">No matches yet</p>
              <p className="text-gray-500 text-sm">Your match history will appear here once you start accepting loads</p>
            </div>
          ) : (
            <div className="space-y-4">
              {matches.map((match) => (
                <div key={match.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-lg">Load #{match.loadId}</h3>
                        <Badge className={getStatusColor(match.status)}>
                          {getStatusText(match.status)}
                        </Badge>
                      </div>
                      {match.commodity && (
                        <p className="text-sm text-gray-600 mb-2">{match.commodity}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-green-600">${match.rate.toLocaleString()}</p>
                      {match.distance && (
                        <p className="text-sm text-gray-600">{match.distance} miles</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium">Pickup</p>
                        <p className="text-gray-600">{match.pickupLocation}</p>
                        <p className="text-gray-500 text-xs">
                          {format(parseISO(match.pickupDate), 'MMM dd, yyyy')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium">Delivery</p>
                        <p className="text-gray-600">{match.deliveryLocation}</p>
                        <p className="text-gray-500 text-xs">
                          {format(parseISO(match.deliveryDate), 'MMM dd, yyyy')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {match.completedDate && match.status === 'completed' && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="h-4 w-4" />
                        <span>Completed on {format(parseISO(match.completedDate), 'MMM dd, yyyy')}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}