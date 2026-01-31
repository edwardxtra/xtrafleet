'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  PlusCircle, 
  MapPin, 
  Package, 
  Truck, 
  Clock, 
  DollarSign,
  AlertCircle,
  Calendar,
  Weight
} from 'lucide-react';
import { showError } from '@/lib/toast-utils';
import type { Load } from '@/lib/data';
import { format, parseISO } from 'date-fns';

const LoadCard = ({ load }: { load: Load }) => {
  const getStatusBadge = (status: Load['status']) => {
    const variants = {
      'Pending': 'secondary',
      'Matched': 'default',
      'In-transit': 'default',
      'Delivered': 'outline',
    } as const;

    return (
      <Badge variant={variants[status] || 'secondary'}>
        {status}
      </Badge>
    );
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold">{load.origin}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="ml-6">→</span>
              <span>{load.destination}</span>
            </div>
          </div>
          {getStatusBadge(load.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Route Information */}
        {load.route && (
          <div className="flex items-center gap-4 text-sm bg-muted/50 p-3 rounded-lg">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              <span className="font-medium">{load.route.distanceText}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <span className="font-medium">{load.route.durationText}</span>
            </div>
          </div>
        )}

        {/* Load Details */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Cargo:</span>
            <span className="font-medium">{load.cargo}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Weight className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Weight:</span>
            <span className="font-medium">{load.weight.toLocaleString()} lbs</span>
          </div>

          {load.price && (
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Price:</span>
              <span className="font-medium">${load.price.toLocaleString()}</span>
            </div>
          )}

          {load.pickupDate && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Pickup:</span>
              <span className="font-medium">
                {format(parseISO(load.pickupDate), 'MMM d, yyyy')}
              </span>
            </div>
          )}
        </div>

        {/* Trailer Type */}
        {load.trailerType && (
          <div className="pt-2 border-t">
            <Badge variant="outline" className="text-xs">
              {load.trailerType.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const LoadSkeleton = () => (
  <Card>
    <CardHeader>
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-6 w-20" />
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    </CardContent>
  </Card>
);

export default function LoadsPage() {
  const [loads, setLoads] = useState<Load[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLoads();
  }, []);

  const fetchLoads = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/loads');
      
      if (!response.ok) {
        throw new Error('Failed to fetch loads');
      }

      const data = await response.json();
      setLoads(data);
    } catch (err) {
      console.error('Error fetching loads:', err);
      setError('Failed to load your freight loads');
      showError('Failed to load freight loads');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold font-headline">Freight Loads</h1>
          <p className="text-muted-foreground mt-1">
            Manage your posted freight loads and track their status
          </p>
        </div>
        <Link href="/dashboard/loads/new">
          <Button>
            <PlusCircle className="h-4 w-4 mr-2" />
            Post New Load
          </Button>
        </Link>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <LoadSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && loads.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Truck className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No loads posted yet</h3>
            <p className="text-muted-foreground text-center mb-6">
              Get started by posting your first freight load
            </p>
            <Link href="/dashboard/loads/new">
              <Button>
                <PlusCircle className="h-4 w-4 mr-2" />
                Post Your First Load
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Loads Grid */}
      {!isLoading && !error && loads.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {loads.map((load) => (
            <LoadCard key={load.id} load={load} />
          ))}
        </div>
      )}
    </div>
  );
}
