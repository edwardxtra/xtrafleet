"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { File, PlusCircle, Upload, WifiOff, AlertCircle, RefreshCw, Package, Download, Pencil, Search as SearchIcon, Trash2 } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { AddLoadForm } from "@/components/add-load-form";
import { EditLoadModal } from "@/components/edit-load-modal";
import { MoreHorizontal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Load } from "@/lib/data";
import { UploadLoadsCSV } from "@/components/upload-loads-csv";
import { useUser, useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, doc, deleteDoc } from "firebase/firestore";
import { showSuccess, showError } from "@/lib/toast-utils";

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

const LoadsTable = ({ 
  loads, 
  isLoading, 
  isUserLoading, 
  loadsError, 
  isOnline,
  emptyMessage = "No loads found",
  onEdit,
  onDelete,
  onFindMatch,
}: { 
  loads: Load[] | null;
  isLoading: boolean;
  isUserLoading: boolean;
  loadsError: Error | null;
  isOnline: boolean;
  emptyMessage?: string;
  onEdit: (load: Load) => void;
  onDelete: (load: Load) => void;
  onFindMatch: (load: Load) => void;
}) => {
  const getBadgeVariant = (status: string) => {
    switch (status) {
      case "Delivered":
        return "secondary";
      case "In-transit":
        return "default";
      case "Matched":
        return "outline";
      case "Pending":
      default:
        return "outline";
    }
  };

  return (
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
              <TableCell>{load.weight?.toLocaleString() || 0} lbs</TableCell>
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
                    <DropdownMenuItem 
                      disabled={!isOnline || load.status !== "Pending"}
                      onClick={() => onEdit(load)}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      disabled={!isOnline || load.status !== "Pending"}
                      onClick={() => onFindMatch(load)}
                    >
                      <SearchIcon className="h-4 w-4 mr-2" />
                      Find Match
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      className="text-destructive" 
                      disabled={!isOnline || load.status === "In-transit"}
                      onClick={() => onDelete(load)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
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
                <p className="text-muted-foreground">{emptyMessage}</p>
              </div>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
};

export default function LoadsPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [editingLoad, setEditingLoad] = useState<Load | null>(null);
  const [deletingLoad, setDeletingLoad] = useState<Load | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const filteredLoads = useMemo(() => {
    if (!loads) return null;
    
    switch (activeTab) {
      case "pending":
        return loads.filter(load => load.status === "Pending");
      case "in-transit":
        return loads.filter(load => load.status === "In-transit");
      case "delivered":
        return loads.filter(load => load.status === "Delivered");
      default:
        return loads;
    }
  }, [loads, activeTab]);

  const counts = useMemo(() => {
    if (!loads) return { all: 0, pending: 0, inTransit: 0, delivered: 0 };
    return {
      all: loads.length,
      pending: loads.filter(l => l.status === "Pending").length,
      inTransit: loads.filter(l => l.status === "In-transit").length,
      delivered: loads.filter(l => l.status === "Delivered").length,
    };
  }, [loads]);

  useEffect(() => {
    if (loadsError) {
      showError('Failed to load loads. Please try again.');
    }
  }, [loadsError]);

  const handleExport = () => {
    if (!filteredLoads || filteredLoads.length === 0) {
      showError('No loads to export');
      return;
    }

    const headers = ['Origin', 'Destination', 'Cargo', 'Weight (lbs)', 'Status', 'Price', 'Pickup Date'];
    const csvContent = [
      headers.join(','),
      ...filteredLoads.map(load => [
        `"${load.origin || ''}"`,
        `"${load.destination || ''}"`,
        `"${load.cargo || ''}"`,
        load.weight || 0,
        `"${load.status || ''}"`,
        load.price || 0,
        `"${load.pickupDate || ''}"`,
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `loads-${activeTab}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    showSuccess('Loads exported successfully!');
  };

  const handleDelete = async () => {
    if (!deletingLoad || !firestore || !user?.uid) return;
    
    setIsDeleting(true);
    try {
      await deleteDoc(doc(firestore, `owner_operators/${user.uid}/loads/${deletingLoad.id}`));
      showSuccess('Load deleted successfully');
      setDeletingLoad(null);
    } catch (error: any) {
      showError(error.message || 'Failed to delete load');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFindMatch = (load: Load) => {
    router.push(`/dashboard/matches?loadId=${load.id}`);
  };
  
  return (
    <Sheet>
      <main className="grid flex-1 items-start gap-4 sm:py-0 md:gap-8">
        {!isOnline && (
          <Alert variant="destructive">
            <WifiOff className="h-4 w-4" />
            <AlertDescription>
              You're currently offline. Data may not be up to date.
            </AlertDescription>
          </Alert>
        )}

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

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center">
            <TabsList>
              <TabsTrigger value="all">
                All {counts.all > 0 && `(${counts.all})`}
              </TabsTrigger>
              <TabsTrigger value="pending">
                Pending {counts.pending > 0 && `(${counts.pending})`}
              </TabsTrigger>
              <TabsTrigger value="in-transit">
                In-transit {counts.inTransit > 0 && `(${counts.inTransit})`}
              </TabsTrigger>
              <TabsTrigger value="delivered">
                Delivered {counts.delivered > 0 && `(${counts.delivered})`}
              </TabsTrigger>
            </TabsList>
            <div className="ml-auto flex items-center gap-2">
              <Button 
                size="sm" 
                variant="outline" 
                className="h-8 gap-1" 
                disabled={!isOnline || !filteredLoads?.length}
                onClick={handleExport}
              >
                <Download className="h-3.5 w-3.5" />
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

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="font-headline">Loads</CardTitle>
              <CardDescription>
                Manage your loads and view their details.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LoadsTable 
                loads={filteredLoads}
                isLoading={isLoading}
                isUserLoading={isUserLoading}
                loadsError={loadsError}
                isOnline={isOnline}
                emptyMessage={
                  activeTab === "all" 
                    ? "No loads found. Add your first load!" 
                    : `No ${activeTab} loads found.`
                }
                onEdit={setEditingLoad}
                onDelete={setDeletingLoad}
                onFindMatch={handleFindMatch}
              />
            </CardContent>
          </Card>
        </Tabs>
      </main>
      
      <AddLoadForm />
      
      <EditLoadModal
        open={!!editingLoad}
        onOpenChange={(open) => !open && setEditingLoad(null)}
        load={editingLoad}
      />

      <AlertDialog open={!!deletingLoad} onOpenChange={(open) => !open && setDeletingLoad(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Load</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this load from {deletingLoad?.origin} to {deletingLoad?.destination}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
