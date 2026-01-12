'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestore } from '@/firebase';
import { collection, collectionGroup, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { Users, Truck, FileText, Link2, TrendingUp, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type Stats = {
  totalUsers: number;
  totalDrivers: number;
  totalLoads: number;
  totalMatches: number;
  totalTLAs: number;
  pendingMatches: number;
  signedTLAs: number;
  redComplianceDrivers: number;
};

type RecentActivity = {
  id: string;
  type: 'user' | 'match' | 'tla';
  description: string;
  timestamp: string;
};

export default function AdminDashboard() {
  const firestore = useFirestore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      if (!firestore) return;
      
      try {
        // Fetch all owner_operators (users)
        const usersSnap = await getDocs(collection(firestore, 'owner_operators'));
        const totalUsers = usersSnap.size;

        // Fetch all drivers using collection group
        const driversSnap = await getDocs(collectionGroup(firestore, 'drivers'));
        const totalDrivers = driversSnap.size;
        
        // Count red compliance drivers
        let redComplianceDrivers = 0;
        driversSnap.docs.forEach(doc => {
          const data = doc.data();
          // Simple check - if any critical field is missing or expired
          if (!data.cdlExpiry || !data.medicalCardExpiry) {
            redComplianceDrivers++;
          }
        });

        // Fetch all loads
        const loadsSnap = await getDocs(collectionGroup(firestore, 'loads'));
        const totalLoads = loadsSnap.size;

        // Fetch all matches
        const matchesSnap = await getDocs(collection(firestore, 'matches'));
        const totalMatches = matchesSnap.size;
        const pendingMatches = matchesSnap.docs.filter(d => d.data().status === 'pending').length;

        // Fetch all TLAs
        const tlasSnap = await getDocs(collection(firestore, 'tlas'));
        const totalTLAs = tlasSnap.size;
        const signedTLAs = tlasSnap.docs.filter(d => ['signed', 'in_progress', 'completed'].includes(d.data().status)).length;

        setStats({
          totalUsers,
          totalDrivers,
          totalLoads,
          totalMatches,
          totalTLAs,
          pendingMatches,
          signedTLAs,
          redComplianceDrivers,
        });

        // Build recent activity from users
        const activity: RecentActivity[] = [];
        usersSnap.docs.slice(0, 5).forEach(doc => {
          const data = doc.data();
          if (data.createdAt) {
            activity.push({
              id: doc.id,
              type: 'user',
              description: `${data.companyName || data.legalName || 'New user'} registered`,
              timestamp: data.createdAt,
            });
          }
        });

        // Add recent matches
        matchesSnap.docs.slice(0, 5).forEach(doc => {
          const data = doc.data();
          activity.push({
            id: doc.id,
            type: 'match',
            description: `Match ${data.status}: ${data.loadSnapshot?.origin} → ${data.loadSnapshot?.destination}`,
            timestamp: data.createdAt,
          });
        });

        // Sort by timestamp
        activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setRecentActivity(activity.slice(0, 10));

      } catch (error) {
        console.error('Error fetching admin stats:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchStats();
  }, [firestore]);

  const StatCard = ({ title, value, icon: Icon, description, variant = 'default' }: {
    title: string;
    value: number | string;
    icon: React.ElementType;
    description?: string;
    variant?: 'default' | 'warning' | 'success';
  }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${
          variant === 'warning' ? 'text-amber-500' : 
          variant === 'success' ? 'text-green-500' : 
          'text-muted-foreground'
        }`} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Admin Dashboard</h1>
        <p className="text-muted-foreground">Platform overview and statistics</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Users" value={stats?.totalUsers ?? 0} icon={Users} description="Registered owner operators" />
        <StatCard title="Total Drivers" value={stats?.totalDrivers ?? 0} icon={Truck} description="Across all fleets" />
        <StatCard title="Total Matches" value={stats?.totalMatches ?? 0} icon={Link2} description={`${stats?.pendingMatches ?? 0} pending`} />
        <StatCard title="Signed TLAs" value={stats?.signedTLAs ?? 0} icon={FileText} description={`${stats?.totalTLAs ?? 0} total agreements`} variant="success" />
      </div>

      {/* Secondary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Total Loads" value={stats?.totalLoads ?? 0} icon={TrendingUp} description="Posted across platform" />
        <StatCard title="Pending Matches" value={stats?.pendingMatches ?? 0} icon={Clock} description="Awaiting response" variant="warning" />
        <StatCard title="Compliance Alerts" value={stats?.redComplianceDrivers ?? 0} icon={AlertTriangle} description="Drivers needing attention" variant="warning" />
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Recent Activity</CardTitle>
          <CardDescription>Latest platform events</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : recentActivity.length > 0 ? (
            <div className="space-y-3">
              {recentActivity.map(activity => (
                <div key={activity.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Badge variant={activity.type === 'user' ? 'default' : activity.type === 'match' ? 'secondary' : 'outline'}>
                      {activity.type}
                    </Badge>
                    <span className="text-sm">{activity.description}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {activity.timestamp ? formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true }) : 'Unknown'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No recent activity</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
