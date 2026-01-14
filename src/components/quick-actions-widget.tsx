'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { LucideIcon, UserPlus, Truck, BarChart, FileText, Inbox, Upload } from 'lucide-react';

interface QuickActionButton {
  icon: LucideIcon;
  label: string;
  description: string;
  href: string;
  variant?: 'default' | 'outline' | 'secondary';
}

const quickActions: QuickActionButton[] = [
  {
    icon: UserPlus,
    label: 'Add Driver',
    description: 'Add a new driver to your fleet',
    href: '/dashboard/drivers',
  },
  {
    icon: Truck,
    label: 'Post Load',
    description: 'Create a new load posting',
    href: '/dashboard/loads',
  },
  {
    icon: BarChart,
    label: 'Find Matches',
    description: 'AI-powered driver matching',
    href: '/dashboard/matches',
  },
  {
    icon: FileText,
    label: 'Agreements',
    description: 'View all TLAs',
    href: '/dashboard/agreements',
  },
  {
    icon: Inbox,
    label: 'Requests',
    description: 'Incoming match requests',
    href: '/dashboard/incoming-matches',
  },
  {
    icon: Upload,
    label: 'Bulk Import',
    description: 'Upload drivers via CSV',
    href: '/dashboard/drivers',
    variant: 'outline',
  },
];

export function QuickActionsWidget() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.href}
                asChild
                variant={action.variant || 'outline'}
                className="h-auto py-4 flex flex-col items-center gap-2 hover:bg-primary/5 hover:border-primary/50 transition-all"
              >
                <Link href={action.href}>
                  <Icon className="h-5 w-5" />
                  <div className="text-center">
                    <div className="font-medium text-sm">{action.label}</div>
                    <div className="text-xs text-muted-foreground hidden lg:block">
                      {action.description}
                    </div>
                  </div>
                </Link>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
