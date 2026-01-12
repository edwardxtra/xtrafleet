'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useFirestore } from '@/firebase';
import { collection, getDocs, collectionGroup, query, where } from 'firebase/firestore';
import { Search, MoreHorizontal, Users, Truck, Package, Eye, RefreshCw, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import type { OwnerOperator } from '@/lib/data';

type UserWithStats = OwnerOperator & {
  driversCount: number;
  loadsCount: number;
};

export default function AdminUsersPage() {
  const firestore = useFirestore();
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserWithStats | null>(null);

  const fetchUsers = async () => {
    if (!firestore) return;
    setIsLoading(true);
    
    try {
      const usersSnap = await getDocs(collection(firestore, 'owner_operators'));
      const usersData: UserWithStats[] = [];

      for (const userDoc of usersSnap.docs) {
        const userData = { id: userDoc.id, ...userDoc.data() } as OwnerOperator;
        
        // Get drivers count
        const driversSnap = await getDocs(collection(firestore, `owner_operators/${userDoc.id}/drivers`));
        const driversCount = driversSnap.size;
        
        // Get loads count
        const loadsSnap = await getDocs(collection(firestore, `owner_operators/${userDoc.id}/loads`));
        const loadsCount = loadsSnap.size;
        
        usersData.push({
          ...userData,
          driversCount,
          loadsCount,
        });
      }

      setUsers(usersData);
      setFilteredUsers(usersData);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [firestore]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredUsers(users);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredUsers(users.filter(user => 
        user.companyName?.toLowerCase().includes(query) ||
        user.legalName?.toLowerCase().includes(query) ||
        user.contactEmail?.toLowerCase().includes(query) ||
        user.dotNumber?.toLowerCase().includes(query)
      ));
    }
  }, [searchQuery, users]);

  const TableSkeleton = () => (
    <>
      {[1,2,3,4,5].map(i => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-8 w-8" /></TableCell>
        </TableRow>
      ))}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-headline">User Management</h1>
          <p className="text-muted-foreground">View and manage all registered owner operators</p>
        </div>
        <Button variant="outline" onClick={fetchUsers} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-headline">All Users</CardTitle>
              <CardDescription>{filteredUsers.length} total users</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Drivers</TableHead>
                <TableHead>Loads</TableHead>
                <TableHead>DOT #</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton />
              ) : filteredUsers.length > 0 ? (
                filteredUsers.map(user => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {user.companyName || user.legalName || 'Unnamed'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm">{user.contactEmail}</p>
                        {user.phone && <p className="text-xs text-muted-foreground">{user.phone}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                        <Truck className="h-3 w-3" />
                        {user.driversCount}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="flex items-center gap-1 w-fit">
                        <Package className="h-3 w-3" />
                        {user.loadsCount}
                      </Badge>
                    </TableCell>
                    <TableCell>{user.dotNumber || '-'}</TableCell>
                    <TableCell>
                      {user.isAdmin && <Badge variant="destructive">Admin</Badge>}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => setSelectedUser(user)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No users found</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* User Details Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-headline">{selectedUser?.companyName || selectedUser?.legalName}</DialogTitle>
            <DialogDescription>User Details</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Legal Name</p>
                  <p className="font-medium">{selectedUser.legalName || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Company Name</p>
                  <p className="font-medium">{selectedUser.companyName || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{selectedUser.contactEmail}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{selectedUser.phone || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">DOT Number</p>
                  <p className="font-medium">{selectedUser.dotNumber || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">MC Number</p>
                  <p className="font-medium">{selectedUser.mcNumber || '-'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground">Address</p>
                  <p className="font-medium">
                    {selectedUser.address ? `${selectedUser.address}, ${selectedUser.city}, ${selectedUser.state} ${selectedUser.zip}` : '-'}
                  </p>
                </div>
              </div>
              <div className="flex gap-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedUser.driversCount} Drivers</span>
                </div>
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedUser.loadsCount} Loads</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
