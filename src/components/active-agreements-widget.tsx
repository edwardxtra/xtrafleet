"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useUser, useFirestore } from "@/firebase";
import { collection, query, where, orderBy, limit, getDocs, or } from "firebase/firestore";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  Clock,
  CheckCircle,
  Truck,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import type { TLA } from "@/lib/data";

export function ActiveAgreementsWidget() {
  const { user } = useUser();
  const firestore = useFirestore();
  
  const [tlas, setTlas] = useState<TLA[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch recent/active TLAs
  useEffect(() => {
    async function fetchTLAs() {
      if (!firestore || !user) return;
      
      try {
        const tlasRef = collection(firestore, "tlas");
        
        // Get TLAs where user is involved
        const q = query(
          tlasRef,
          or(
            where("lessor.ownerOperatorId", "==", user.uid),
            where("lessee.ownerOperatorId", "==", user.uid)
          ),
          orderBy("createdAt", "desc"),
          limit(10)
        );
        
        const snapshot = await getDocs(q);
        const tlasData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as TLA[];
        
        // Sort to prioritize action-needed items
        const sorted = tlasData.sort((a, b) => {
          const priorityOrder: Record<string, number> = {
            'in_progress': 1,
            'pending_lessor': 2,
            'pending_lessee': 2,
            'signed': 3,
            'completed': 4,
            'voided': 5,
          };
          return (priorityOrder[a.status] || 99) - (priorityOrder[b.status] || 99);
        });
        
        setTlas(sorted.slice(0, 5));
      } catch (err) {
        console.error("Error fetching TLAs:", err);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchTLAs();
  }, [firestore, user]);

  const getStatusInfo = (tla: TLA) => {
    const isLessor = user?.uid === tla.lessor.ownerOperatorId;
    const isLessee = user?.uid === tla.lessee.ownerOperatorId;
    
    switch (tla.status) {
      case "pending_lessor":
        return {
          badge: <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"><Clock className="h-3 w-3 mr-1" />Needs Signature</Badge>,
          action: isLessor ? "Sign Now" : "Waiting",
          urgent: isLessor,
        };
      case "pending_lessee":
        return {
          badge: <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"><Clock className="h-3 w-3 mr-1" />Needs Signature</Badge>,
          action: isLessee ? "Sign Now" : "Waiting",
          urgent: isLessee,
        };
      case "signed":
        return {
          badge: <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Ready</Badge>,
          action: isLessor ? "Start Trip" : "View",
          urgent: isLessor,
        };
      case "in_progress":
        return {
          badge: <Badge className="bg-blue-600"><Truck className="h-3 w-3 mr-1" />In Progress</Badge>,
          action: "Track",
          urgent: true,
        };
      case "completed":
        return {
          badge: <Badge className="bg-purple-600"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>,
          action: "View",
          urgent: false,
        };
      default:
        return {
          badge: <Badge variant="outline">{tla.status}</Badge>,
          action: "View",
          urgent: false,
        };
    }
  };

  const getTimeAgo = (dateString?: string) => {
    if (!dateString) return "";
    try {
      return formatDistanceToNow(parseISO(dateString), { addSuffix: true });
    } catch {
      return "";
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const actionNeededCount = tlas.filter(t => {
    const info = getStatusInfo(t);
    return info.urgent;
  }).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Active Agreements
            {actionNeededCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {actionNeededCount} action needed
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Your recent trip lease agreements
          </CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/agreements">
            View All
            <ExternalLink className="h-3 w-3 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {tlas.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground opacity-50 mb-3" />
            <p className="text-sm text-muted-foreground">No agreements yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              TLAs will appear here when you accept matches
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tlas.map((tla) => {
              const statusInfo = getStatusInfo(tla);
              return (
                <Link
                  key={tla.id}
                  href={`/dashboard/tla/${tla.id}`}
                  className={`block p-3 rounded-lg border transition-colors hover:bg-muted/50 ${
                    statusInfo.urgent ? "border-primary/50 bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-sm font-medium">
                        <span className="truncate">{tla.trip.origin}</span>
                        <ArrowRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        <span className="truncate">{tla.trip.destination}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {tla.driver.name}
                        </span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs font-medium text-green-600">
                          ${tla.payment.amount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {statusInfo.badge}
                      <span className="text-xs text-muted-foreground">
                        {getTimeAgo(tla.updatedAt || tla.createdAt)}
                      </span>
                    </div>
                  </div>
                  {statusInfo.urgent && (
                    <div className="mt-2 flex justify-end">
                      <Button size="sm" variant={statusInfo.action === "Sign Now" ? "default" : "secondary"}>
                        {statusInfo.action}
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
