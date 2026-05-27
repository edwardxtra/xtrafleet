'use client';
import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useUser, useAuth, useFirestore } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import {
  SidebarProvider,
  Sidebar,
  SidebarTrigger,
  SidebarInset,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
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
import { Logo } from "@/components/logo";
import { Home, Users, Truck, LogOut, Loader2, FileText, Link2, Shield, ClipboardList, Package, Settings, CreditCard, UserPlus, MessageSquare, Activity, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AdminRole,
  hasPermission,
  canAccessRoute,
  getDefaultRoleForLegacyAdmin,
  ROLE_INFO,
} from "@/lib/admin-roles";

// Create context for admin role
type AdminContextType = {
  adminRole: AdminRole | null;
  hasPermission: (permission: string) => boolean;
};

const AdminContext = createContext<AdminContextType>({
  adminRole: null,
  hasPermission: () => false,
});

export const useAdminRole = () => useContext(AdminContext);

function AdminHeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = q.trim();
        if (!trimmed) return;
        router.push(`/admin/search?q=${encodeURIComponent(trimmed)}`);
        setQ('');
      }}
      className="ml-auto flex items-center gap-2"
    >
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="pl-7 h-9 w-48 sm:w-64"
        />
      </div>
    </form>
  );
}

function AdminSidebarNavLink({ href, children, tooltip }: { href: string; children: React.ReactNode; tooltip: string; }) {
  const { setOpenMobile, isMobile } = useSidebar();
  const pathname = usePathname();
  const isActive = pathname === href;
  const handleClick = () => { if (isMobile) setOpenMobile(false); };
  return (
    <SidebarMenuButton asChild tooltip={tooltip} isActive={isActive}>
      <Link href={href} onClick={handleClick}>{children}</Link>
    </SidebarMenuButton>
  );
}

function AdminSidebarNav({ onSignOutClick, adminRole }: { onSignOutClick: () => void; adminRole: AdminRole }) {
  const { setOpenMobile, isMobile } = useSidebar();
  const handleSignOutClick = () => { if (isMobile) setOpenMobile(false); onSignOutClick(); };

  const checkPermission = (permission: string) => hasPermission(adminRole, permission as any);

  return (
    <>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <AdminSidebarNavLink href="/admin" tooltip="Dashboard"><Home /><span>Dashboard</span></AdminSidebarNavLink>
          </SidebarMenuItem>
          {checkPermission('users:view') && (
            <SidebarMenuItem>
              <AdminSidebarNavLink href="/admin/users" tooltip="Users"><Users /><span>Users (OOs)</span></AdminSidebarNavLink>
            </SidebarMenuItem>
          )}
          {checkPermission('users:create') && (
            <SidebarMenuItem>
              <AdminSidebarNavLink href="/admin/onboard" tooltip="Onboard Customer"><UserPlus /><span>Onboard Customer</span></AdminSidebarNavLink>
            </SidebarMenuItem>
          )}
          {checkPermission('drivers:view') && (
            <SidebarMenuItem>
              <AdminSidebarNavLink href="/admin/drivers" tooltip="Drivers"><Truck /><span>All Drivers</span></AdminSidebarNavLink>
            </SidebarMenuItem>
          )}
          {checkPermission('loads:view') && (
            <SidebarMenuItem>
              <AdminSidebarNavLink href="/admin/loads" tooltip="Loads"><Package /><span>All Loads</span></AdminSidebarNavLink>
            </SidebarMenuItem>
          )}
          {checkPermission('matches:view') && (
            <SidebarMenuItem>
              <AdminSidebarNavLink href="/admin/matches" tooltip="Matches"><Link2 /><span>Matches</span></AdminSidebarNavLink>
            </SidebarMenuItem>
          )}
          {checkPermission('tlas:view') && (
            <SidebarMenuItem>
              <AdminSidebarNavLink href="/admin/tlas" tooltip="TLAs"><FileText /><span>TLAs</span></AdminSidebarNavLink>
            </SidebarMenuItem>
          )}
          {checkPermission('audit:view') && (
            <SidebarMenuItem>
              <AdminSidebarNavLink href="/admin/audit" tooltip="Audit Log"><ClipboardList /><span>Audit Log</span></AdminSidebarNavLink>
            </SidebarMenuItem>
          )}
          {checkPermission('audit:view') && (
            <SidebarMenuItem>
              <AdminSidebarNavLink href="/admin/conversations" tooltip="Conversations"><MessageSquare /><span>Conversations</span></AdminSidebarNavLink>
            </SidebarMenuItem>
          )}
          {checkPermission('audit:view') && (
            <SidebarMenuItem>
              <AdminSidebarNavLink href="/admin/health" tooltip="System Health"><Activity /><span>System Health</span></AdminSidebarNavLink>
            </SidebarMenuItem>
          )}
          {checkPermission('audit:view') && (
            <SidebarMenuItem>
              <AdminSidebarNavLink href="/admin/search" tooltip="Global Search"><Search /><span>Global Search</span></AdminSidebarNavLink>
            </SidebarMenuItem>
          )}
          {checkPermission('billing:view') && (
            <SidebarMenuItem>
              <AdminSidebarNavLink href="/admin/billing" tooltip="Users & Billing"><CreditCard /><span>Users & Billing</span></AdminSidebarNavLink>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
        {checkPermission('admin:manage_roles') && (
          <>
            <Separator className="my-2" />
            <SidebarMenu>
              <SidebarMenuItem>
                <AdminSidebarNavLink href="/admin/settings" tooltip="Admin Access"><Settings /><span>Admin Access</span></AdminSidebarNavLink>
              </SidebarMenuItem>
            </SidebarMenu>
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Back to Dashboard">
              <Link href="/dashboard"><Home /><span>User Dashboard</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOutClick} tooltip="Logout"><LogOut /><span>Logout</span></SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const db = useFirestore();
  const router = useRouter();
  const pathname = usePathname();
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login?error=You must be logged in to access this page.');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    async function checkAdmin() {
      if (!user || !db) return;
      setIsCheckingAdmin(true);
      try {
        const ownerDoc = await getDoc(doc(db, 'owner_operators', user.uid));
        if (ownerDoc.exists()) {
          const data = ownerDoc.data();
          if (data.isAdmin === true) {
            // Check for new role field, fallback to default for legacy admins
            const role = data.adminRole as AdminRole || getDefaultRoleForLegacyAdmin();
            setAdminRole(role);

            // Check route access based on role
            if (!canAccessRoute(role, pathname)) {
              router.push('/admin');
            }
          } else {
            setAdminRole(null);
            router.push('/dashboard');
          }
        } else {
          setAdminRole(null);
          router.push('/dashboard');
        }
      } catch (error) {
        console.error('Error checking admin:', error);
        setAdminRole(null);
        router.push('/dashboard');
      } finally {
        setIsCheckingAdmin(false);
      }
    }
    if (user && db) checkAdmin();
  }, [user, db, router, pathname]);

  const handleSignOut = async () => {
    try {
      await auth.signOut();
      await fetch('/api/auth/session', { method: 'DELETE' });
      router.push('/login');
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  const contextValue: AdminContextType = {
    adminRole,
    hasPermission: (permission: string) => hasPermission(adminRole || undefined, permission as any),
  };

  if (isUserLoading || isCheckingAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user || !adminRole) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const roleInfo = ROLE_INFO[adminRole];

  return (
    <AdminContext.Provider value={contextValue}>
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center gap-2">
              <Logo linkTo="/admin" forceLight />
              <Badge variant="destructive" className="text-xs">Admin</Badge>
            </div>
          </SidebarHeader>
          <AdminSidebarNav onSignOutClick={() => setShowLogoutDialog(true)} adminRole={adminRole} />
        </Sidebar>
        <SidebarInset>
          <header className="flex h-14 items-center justify-between gap-3 border-b bg-background px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="md:hidden" />
              <Badge variant="destructive"><Shield className="h-3 w-3 mr-1" />Admin Console</Badge>
              <Badge variant={roleInfo.color as any} className="text-xs hidden sm:inline-flex">
                {roleInfo.name}
              </Badge>
            </div>
            <AdminHeaderSearch />
            <div className="text-sm text-muted-foreground hidden sm:block">{user?.email}</div>
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
          <footer className="border-t bg-background px-4 py-3">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
              <p className="text-xs text-muted-foreground">
                &copy; {new Date().getFullYear()} XtraFleet. All rights reserved.
              </p>
              <nav className="flex flex-wrap justify-center gap-3 text-xs">
                <Link href="/legal/terms" className="text-muted-foreground hover:text-foreground transition-colors">Terms of Service</Link>
                <Link href="/legal/privacy" className="text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</Link>
                <Link href="/legal/user-agreement" className="text-muted-foreground hover:text-foreground transition-colors">User Agreement</Link>
                <Link href="/legal/esign-consent" className="text-muted-foreground hover:text-foreground transition-colors">E-Sign Agreement</Link>
              </nav>
            </div>
          </footer>
        </SidebarInset>
        <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure you want to logout?</AlertDialogTitle>
              <AlertDialogDescription>You will need to sign in again to access the admin console.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleSignOut}>Logout</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarProvider>
    </AdminContext.Provider>
  );
}
