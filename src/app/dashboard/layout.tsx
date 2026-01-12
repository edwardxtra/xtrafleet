'use client';
import { useEffect, useState } from "react";
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
import { Home, Users, Truck, Settings, LifeBuoy, BarChart, LogOut, Inbox, Loader2, FileText, HelpCircle, Shield, MessageSquare } from "lucide-react";
import { Separator } from "@/components/ui/separator";

function SidebarNavLink({ href, children, tooltip }: { href: string; children: React.ReactNode; tooltip: string; }) {
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

function SidebarNav({ onSignOutClick, isAdmin }: { onSignOutClick: () => void; isAdmin: boolean }) {
  const { setOpenMobile, isMobile } = useSidebar();
  const handleSignOutClick = () => { if (isMobile) setOpenMobile(false); onSignOutClick(); };
  return (
    <>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarNavLink href="/dashboard" tooltip="Dashboard"><Home /><span>Dashboard</span></SidebarNavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarNavLink href="/dashboard/drivers" tooltip="Drivers"><Users /><span>Drivers</span></SidebarNavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarNavLink href="/dashboard/loads" tooltip="Loads"><Truck /><span>Loads</span></SidebarNavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarNavLink href="/dashboard/matches" tooltip="Find Matches"><BarChart /><span>Find Matches</span></SidebarNavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarNavLink href="/dashboard/incoming-matches" tooltip="Incoming Requests"><Inbox /><span>Incoming Requests</span></SidebarNavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarNavLink href="/dashboard/messages" tooltip="Messages"><MessageSquare /><span>Messages</span></SidebarNavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarNavLink href="/dashboard/agreements" tooltip="Agreements"><FileText /><span>Agreements</span></SidebarNavLink>
          </SidebarMenuItem>
        </SidebarMenu>
        {isAdmin && (
          <>
            <Separator className="my-2" />
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarNavLink href="/admin" tooltip="Admin Console">
                  <Shield className="text-red-500" /><span className="text-red-500 font-medium">Admin Console</span>
                </SidebarNavLink>
              </SidebarMenuItem>
            </SidebarMenu>
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarNavLink href="/dashboard/settings" tooltip="Settings"><Settings /><span>Settings</span></SidebarNavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarNavLink href="/dashboard/billing" tooltip="Billing"><LifeBuoy /><span>Billing & Support</span></SidebarNavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarNavLink href="/dashboard/contact" tooltip="Contact Us"><HelpCircle /><span>Contact Us</span></SidebarNavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOutClick} tooltip="Logout"><LogOut /><span>Logout</span></SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const db = useFirestore();
  const router = useRouter();
  const [roleChecked, setRoleChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login?error=You must be logged in to access this page.');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    async function checkRole() {
      if (!user || !db) return;
      try {
        // Check users collection for driver role
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.role === 'driver') {
            router.push('/driver-dashboard');
            return;
          }
        }
        // Check owner_operators for admin flag
        const ownerDoc = await getDoc(doc(db, 'owner_operators', user.uid));
        if (ownerDoc.exists()) {
          const ownerData = ownerDoc.data();
          setIsAdmin(ownerData.isAdmin === true);
        }
        setRoleChecked(true);
      } catch (error) {
        console.error('Error checking role:', error);
        setRoleChecked(true);
      }
    }
    if (user && db) checkRole();
  }, [user, db, router]);

  const handleSignOut = async () => {
    try {
      await auth.signOut();
      await fetch('/api/auth/session', { method: 'DELETE' });
      router.push('/login');
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  if (isUserLoading) {
    return (<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>);
  }

  if (!user) {
    return (<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>);
  }

  if (!roleChecked) {
    return (<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>);
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <Link href="/" passHref><Logo /></Link>
        </SidebarHeader>
        <SidebarNav onSignOutClick={() => setShowLogoutDialog(true)} isAdmin={isAdmin} />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center justify-between border-b bg-background px-4">
          <SidebarTrigger className="md:hidden" />
          <div className="ml-auto text-sm text-muted-foreground">{user?.email}</div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </SidebarInset>
      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to logout?</AlertDialogTitle>
            <AlertDialogDescription>You will need to sign in again to access your dashboard.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSignOut}>Logout</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
