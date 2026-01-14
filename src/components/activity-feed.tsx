'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime, getInitials, stringToColor } from '@/lib/utils';
import { 
  UserPlus, 
  Truck, 
  BarChart, 
  FileText, 
  CheckCircle, 
  XCircle,
  Clock,
  AlertCircle,
  LucideIcon
} from 'lucide-react';

interface Activity {
  id: string;
  type: 'driver_added' | 'load_created' | 'match_created' | 'match_accepted' | 'match_declined' | 'tla_signed';
  title: string;
  description: string;
  timestamp: Date | string;
  user?: string;
  metadata?: {
    driverName?: string;
    loadRoute?: string;
    amount?: number;
  };
}

const activityIcons: Record<Activity['type'], LucideIcon> = {
  driver_added: UserPlus,
  load_created: Truck,
  match_created: BarChart,
  match_accepted: CheckCircle,
  match_declined: XCircle,
  tla_signed: FileText,
};

const activityColors: Record<Activity['type'], string> = {
  driver_added: 'text-blue-500 bg-blue-50 dark:bg-blue-950',
  load_created: 'text-purple-500 bg-purple-50 dark:bg-purple-950',
  match_created: 'text-amber-500 bg-amber-50 dark:bg-amber-950',
  match_accepted: 'text-green-500 bg-green-50 dark:bg-green-950',
  match_declined: 'text-red-500 bg-red-50 dark:bg-red-950',
  tla_signed: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950',
};

interface ActivityFeedProps {
  activities: Activity[];
  maxItems?: number;
}

export function ActivityFeed({ activities, maxItems = 10 }: ActivityFeedProps) {
  const displayedActivities = activities.slice(0, maxItems);

  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Recent Activity</CardTitle>
          <CardDescription>Your recent actions will appear here</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Clock className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              No activity yet. Start by adding drivers or posting loads.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Recent Activity</CardTitle>
        <CardDescription>
          {activities.length} {activities.length === 1 ? 'action' : 'actions'} in the last 30 days
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {displayedActivities.map((activity, index) => {
            const Icon = activityIcons[activity.type];
            const colorClass = activityColors[activity.type];

            return (
              <div
                key={activity.id}
                className="flex gap-4 pb-4 last:pb-0 border-b last:border-0"
              >
                {/* Icon */}
                <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}>
                  <Icon className="h-5 w-5" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{activity.title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {activity.description}
                      </p>
                      
                      {/* Metadata */}
                      {activity.metadata && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {activity.metadata.driverName && (
                            <Badge variant="outline" className="text-xs">
                              {activity.metadata.driverName}
                            </Badge>
                          )}
                          {activity.metadata.loadRoute && (
                            <Badge variant="outline" className="text-xs">
                              {activity.metadata.loadRoute}
                            </Badge>
                          )}
                          {activity.metadata.amount && (
                            <Badge variant="outline" className="text-xs">
                              ${activity.metadata.amount.toLocaleString()}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Timestamp */}
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(activity.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {activities.length > maxItems && (
          <div className="mt-4 text-center">
            <p className="text-xs text-muted-foreground">
              Showing {maxItems} of {activities.length} activities
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Helper function to generate mock activities (can be replaced with real data)
export function generateMockActivities(): Activity[] {
  return [
    {
      id: '1',
      type: 'driver_added',
      title: 'Driver Added',
      description: 'John Martinez was added to your fleet',
      timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 mins ago
      metadata: {
        driverName: 'John Martinez',
      },
    },
    {
      id: '2',
      type: 'load_created',
      title: 'Load Posted',
      description: 'New load posted for Chicago to Miami',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
      metadata: {
        loadRoute: 'Chicago → Miami',
        amount: 4500,
      },
    },
    {
      id: '3',
      type: 'match_created',
      title: 'Match Found',
      description: 'AI found a match for your Brooklyn to Orlando load',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
      metadata: {
        loadRoute: 'Brooklyn → Orlando',
      },
    },
    {
      id: '4',
      type: 'match_accepted',
      title: 'Match Accepted',
      description: 'Driver accepted your load offer',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
      metadata: {
        amount: 5400,
      },
    },
    {
      id: '5',
      type: 'tla_signed',
      title: 'TLA Signed',
      description: 'Transportation Lease Agreement signed and active',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
    },
  ];
}
