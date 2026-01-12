'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardList } from 'lucide-react';

export default function AdminAuditPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Audit Log</h1>
        <p className="text-muted-foreground">Track all administrative actions</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Audit Trail</CardTitle>
          <CardDescription>Coming in Phase 2</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16">
            <ClipboardList className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Audit Log Coming Soon</h3>
            <p className="text-muted-foreground text-center max-w-md mt-2">
              This feature will track all administrative actions including user modifications,
              TLA voids, and system changes for compliance and accountability.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
