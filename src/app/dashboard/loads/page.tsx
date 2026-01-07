"use client";

import { useEffect, useState } from "react";
import { File, PlusCircle, Upload, WifiOff, AlertCircle, RefreshCw, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { AddLoadForm } from "@/components/add-load-form";
import { MoreHorizontal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Load } from "@/lib/data";
import { UploadLoadsCSV } from "@/components/upload-loads-csv";
import { useUser, useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection } from "firebase/firestore";
import { showSuccess, showError } from "@/lib/toast-utils";

// Loading skeleton for table
const TableSkeleton = () => (
  <>
    {[1, 2, 3, 4, 5].map((i) => (
      <TableRow key={i}>
        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
        <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
        <TableCell><Skeleton className="h-8 w-8" /></TableCell>
      </TableRow>
    ))}
  </>
);

export default function LoadsPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [isOnline, setIsOnline] = useState(true);

  // Network status detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showSuccess('You\'re back online!');
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return collection(firestore, `owner_operators/${user.uid}/loads`);
  }, [firestore, user?.uid]);

  const { data: loads, isLoading, error: loadsError } = useCollection<Load>(loadsQuery);

  // Show error toast
  useEffect(() => {
    if (loadsError) {
      showError('Failed to load loads. Please try again.');
    }
  }, [loadsError]);

  const getBadgeVariant = (status: string) => {
    switch (status) {
      case "Delivered":
        return "secondary";
      case "In-transit":
        return "default";
      case "Pending":
      default:
        return "outline";
    }
  };
  
  return (
    <Sheet>
      <main className="grid flex-1 items-start gap-4 sm:py-0 md:gap-8">
        {/* Offline Banner */}
        {!isOnline && (
          <Alert variant="destructive">
            <WifiOff className="h-4 w-4" />
            <AlertDescription>
              You're currently offline. Data may not be up to date.
            </AlertDescription>
          </Alert>
        )}

        {/* Error Banner */}
        {loadsError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load loads. 
              <Button 
                variant="link" 
                className="p-0 h-auto ml-2" 
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="all">
          <div className="flex items-center">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="in-transit">In-transit</TabsTrigger>
              <TabsTrigger value="delivered">Delivered</TabsTrigger>
            </TabsList>
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 gap-1" disabled={!isOnline}>
                <File className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                  Export
                </span>
              </Button>
               <UploadLoadsCSV>
                 <Button size="sm" variant="outline" className="h-8 gap-1" disabled={!isOnline}>
                    <Upload className="h-3.5 w-3.5" />
                    <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                        Upload CSV
                    </span>
                </Button>
              </UploadLoadsCSV>
              <SheetTrigger asChild>
                <Button size="sm" className="h-8 gap-1" disabled={!isOnline}>
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                    Add Load
                  </span>
                </Button>
              </SheetTrigger>
            </div>
          </div>
          <TabsContent value="all">
            <Card>
              <CardHeader>
                <CardTitle className="font-headline">Loads</CardTitle>
                <CardDescription>
                  Manage your loads and view their details.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Origin</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Weight</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading || isUserLoading ? (
                      <TableSkeleton />
                    ) : loadsError ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <AlertCircle className="h-8 w-8 text-destructive" />
                            <p className="text-muted-foreground">Failed to load loads</p>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => window.location.reload()}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Retry
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : loads && loads.length > 0 ? (
                      loads.map((load) => (
                        <TableRow key={load.id}>
                          <TableCell className="font-medium">
                            {load.origin}
                          </TableCell>
                          <TableCell>{load.destination}</TableCell>
                          <TableCell>{load.cargo}</TableCell>
                          <TableCell>{load.weight.toLocaleString()} lbs</TableCell>
                          <TableCell>
                            <Badge variant={getBadgeVariant(load.status)}>
                              {load.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  aria-haspopup="true"
                                  size="icon"
                                  variant="ghost"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Toggle menu</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem disabled={!isOnline}>Edit</DropdownMenuItem>
                                <DropdownMenuItem disabled={!isOnline}>Find Match</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" disabled={!isOnline}>
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <Package className="h-8 w-8 text-muted-foreground" />
                            <p className="text-muted-foreground">No loads found</p>
                            <SheetTrigger asChild>
                              <Button size="sm" disabled={!isOnline}>
                                <PlusCircle className="h-3.5 w-3.5 mr-1" />
                                Add your first load
                              </Button>
                            </SheetTrigger>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      <AddLoadForm />
    </Sheet>
  );
}