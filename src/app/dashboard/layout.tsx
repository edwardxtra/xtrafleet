'use client';
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useUser, useAuth, useFirestore } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import {
  SidebarProvider, Sidebar, SidebarTrigger, SidebarInset, SidebarHeader, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { HelpWidget } from "@/components/help-widget";
import { OnboardingBanner } from "@/components/onboarding-banner";
import { Home, Users, Truck, Settings, LifeBuoy, BarChart, LogOut, Loader2, FileText, HelpCircle, Shield, MessageSquare, User, ChevronDown, ArrowLeftRight } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useUnreadMessagesCount } from "@/hooks/use-unread-messages";

interface OnboardingStatus {
  profileComplete?: boolean;
  complianceAttested?: boolean;
  fmcsaDesignated?: boolean | string;
  completedAt?: string | null;
}

function SidebarNavLink({ href, children, tooltip, badge }: { href: string; children: React.ReactNode; tooltip: string; badge?: number }) {
  const { setOpenMobile, isMobile } = useSidebar();
  const pathname = usePathname();
  const isActive = pathname === href;
  const handleClick = () => { if (isMobile) setOpenMobile(false); };
  return (
    <SidebarMenuButton asChild tooltip={tooltip} isActive={isActive}>
      <Link href={href} onClick={handleClick} className="flex items-center justify-between w-full">
        <span className="flex items-center gap-2">{children}</span>
        {badge && badge > 0 && <Badge variant="default" className="ml-auto h-5 min-w-5 px-1.5 bg-red-600 hover:bg-red-600">{badge > 99 ? '99+' : badge}</Badge>}
      </Link>
    </SidebarMenuButton>
  );
}

function SidebarNav({ onSignOutClick, isAdmin }: { onSignOutClick: () => void; isAdmin: boolean }) {
  const { setOpenMobile, isMobile } = useSidebar();
  const handleSignOutClick = () => { if (isMobile) setOpenMobile(false); onSignOutClick(); };
  const unreadCount = useUnreadMessagesCount();
  return (
    <>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem><SidebarNavLink href="/dashboard" tooltip="Dashboard"><Home /><span>Dashboard</span></SidebarNavLink></SidebarMenuItem>
          <SidebarMenuItem data-tour="sidebar-drivers"><SidebarNavLink href="/dashboard/drivers" tooltip="Drivers"><Users /><span>Drivers</span></SidebarNavLink></SidebarMenuItem>
          <SidebarMenuItem data-tour="sidebar-loads"><SidebarNavLink href="/dashboard/loads" tooltip="Loads"><Truck /><span>Loads</span></SidebarNavLink></SidebarMenuItem>
          <SidebarMenuItem data-tour="sidebar-matches"><SidebarNavLink href="/dashboard/matches" tooltip="Find Matches"><BarChart /><span>Find Matches</span></SidebarNavLink></SidebarMenuItem>
          <SidebarMenuItem><SidebarNavLink href="/dashboard/requests" tooltip="Requests"><ArrowLeftRight /><span>Requests</span></SidebarNavLink></SidebarMenuItem>
          <SidebarMenuItem><SidebarNavLink href="/dashboard/messages" tooltip="Messages" badge={unreadCount}><MessageSquare /><span>Messages</span></SidebarNavLink></SidebarMenuItem>
          <SidebarMenuItem><SidebarNavLink href="/dashboard/agreements" tooltip="Agreements"><FileText /><span>Agreements</span></SidebarNavLink></SidebarMenuItem>
        </SidebarMenu>
        {isAdmin && (<><Separator className="my-2" /><SidebarMenu><SidebarMenuItem><SidebarNavLink href="/admin" tooltip="Admin Console"><Shield className="text-red-500" /><span className="text-red-500 font-medium">Admin Console</span></SidebarNavLink></SidebarMenuItem></SidebarMenu></>)}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem><SidebarNavLink href="/dashboard/profile" tooltip="Profile"><User /><span>Profile</span></SidebarNavLink></SidebarMenuItem>
          <SidebarMenuItem><SidebarNavLink href="/dashboard/settings" tooltip="Settings"><Settings /><span>Settings</span></SidebarNavLink></SidebarMenuItem>
          <SidebarMenuItem><SidebarNavLink href="/dashboard/billing" tooltip="Billing"><LifeBuoy /><span>Billing & Support</span></SidebarNavLink></SidebarMenuItem>
          <SidebarMenuItem><SidebarNavLink href="/dashboard/contact" tooltip="Contact Us"><HelpCircle /><span>Contact Us</span></SidebarNavLink></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton onClick={handleSignOutClick} tooltip="Logout"><LogOut /><span>Logout</span></SidebarMenuButton></SidebarMenuItem>
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
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | undefined>(undefined);

  useEffect(() => {
    if (!isUserLoading && !user && !isLoggingOut) {
      router.push('/login?error=You must be logged in to access this page.');
    }
  }, [user, isUserLoading, isLoggingOut, router]);

  useEffect(() => {
    async function checkRoleAndOnboarding() {
      if (!user || !db) return;
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.role === 'driver') { router.push('/driver-dashboard'); return; }
        }
        const ownerDoc = await getDoc(doc(db, 'owner_operators', user.uid));
        if (ownerDoc.exists()) {
          const ownerData = ownerDoc.data();
          setIsAdmin(ownerData.isAdmin === true);
          setOnboardingStatus(ownerData.onboardingStatus);
        }
        setRoleChecked(true);
      } catch (error) {
        console.error('Error checking role:', error);
        setRoleChecked(true);
      }
    }
    if (user && db) checkRoleAndOnboarding();
  }, [user, db, router]);

  const handleSignOut = async () => {
    try { setIsLoggingOut(true); await auth.signOut(); router.push('/login'); } catch (error) { console.error("Failed to sign out:", error); setIsLoggingOut(false); }
  };

  if (isUserLoading || !user || !roleChecked) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader><Logo linkTo="/" forceLight /></SidebarHeader>
        <SidebarNav onSignOutClick={() => setShowLogoutDialog(true)} isAdmin={isAdmin} />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 md:h-14 items-center justify-between border-b bg-background px-3 md:px-4">
          <SidebarTrigger className="md:hidden" />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 text-xs md:text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer outline-none">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline truncate max-w-[150px] md:max-w-none">{user?.email}</span>
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild><Link href="/dashboard/profile" className="cursor-pointer"><User className="h-4 w-4 mr-2" />Profile</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/dashboard/settings" className="cursor-pointer"><Settings className="h-4 w-4 mr-2" />Settings</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowLogoutDialog(true)} className="cursor-pointer text-destructive focus:text-destructive"><LogOut className="h-4 w-4 mr-2" />Sign Out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-3 md:p-6">
          <OnboardingBanner onboardingStatus={onboardingStatus} />
          {children}
        </main>
        <footer className="border-t border-border bg-background px-4 py-3">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-muted-foreground">
            <span>&copy; {new Date().getFullYear()} XtraFleet. All rights reserved.</span>
            <nav className="flex flex-wrap justify-center gap-3">
              <Link href="/legal/terms" className="hover:text-foreground transition-colors">Terms</Link>
              <Link href="/legal/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <Link href="/legal/user-agreement" className="hover:text-foreground transition-colors">User Agreement</Link>
              <Link href="/legal/esign-consent" className="hover:text-foreground transition-colors">E-Sign</Link>
            </nav>
          </div>
        </footer>
      </SidebarInset>
      <HelpWidget />
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
