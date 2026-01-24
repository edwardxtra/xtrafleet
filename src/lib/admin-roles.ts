/**
 * Admin Role Types and Permissions System
 *
 * Role Hierarchy:
 * - super_admin: Full access to everything including admin management
 * - admin: Full operational access but cannot manage other admins
 * - support: View access + limited actions (no editing, deleting, suspending)
 * - billing_admin: Only access to billing/subscription management
 */

export type AdminRole = 'super_admin' | 'admin' | 'support' | 'billing_admin';

export type AdminPermission =
  // User Management
  | 'users:view'
  | 'users:create'
  | 'users:edit'
  | 'users:delete'
  | 'users:suspend'
  // Driver Management
  | 'drivers:view'
  | 'drivers:edit'
  | 'drivers:delete'
  // Load Management
  | 'loads:view'
  | 'loads:edit'
  | 'loads:delete'
  // Match Management
  | 'matches:view'
  | 'matches:cancel'
  // TLA Management
  | 'tlas:view'
  | 'tlas:void'
  // Billing Management
  | 'billing:view'
  | 'billing:refund'
  | 'billing:manage_subscriptions'
  // Audit
  | 'audit:view'
  // Admin Management (Super Admin only)
  | 'admin:manage_roles'
  | 'admin:grant_access'
  | 'admin:revoke_access'
  // Data Management (Super Admin only)
  | 'data:clear_all';

// Role to Permissions Mapping
export const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  super_admin: [
    // Full access to everything
    'users:view', 'users:create', 'users:edit', 'users:delete', 'users:suspend',
    'drivers:view', 'drivers:edit', 'drivers:delete',
    'loads:view', 'loads:edit', 'loads:delete',
    'matches:view', 'matches:cancel',
    'tlas:view', 'tlas:void',
    'billing:view', 'billing:refund', 'billing:manage_subscriptions',
    'audit:view',
    'admin:manage_roles', 'admin:grant_access', 'admin:revoke_access',
    'data:clear_all',
  ],
  admin: [
    // Full operational access, no admin management
    'users:view', 'users:create', 'users:edit', 'users:delete', 'users:suspend',
    'drivers:view', 'drivers:edit', 'drivers:delete',
    'loads:view', 'loads:edit', 'loads:delete',
    'matches:view', 'matches:cancel',
    'tlas:view', 'tlas:void',
    'billing:view', 'billing:refund', 'billing:manage_subscriptions',
    'audit:view',
  ],
  support: [
    // View-only + limited actions
    'users:view',
    'drivers:view',
    'loads:view',
    'matches:view',
    'tlas:view',
    'billing:view',
    'audit:view',
  ],
  billing_admin: [
    // Billing only
    'users:view', // Need to see users to manage billing
    'billing:view',
    'billing:refund',
    'billing:manage_subscriptions',
    'audit:view', // Can view audit log for billing actions
  ],
};

// Role display names and descriptions
export const ROLE_INFO: Record<AdminRole, { name: string; description: string; color: string }> = {
  super_admin: {
    name: 'Super Admin',
    description: 'Full access including admin management',
    color: 'destructive',
  },
  admin: {
    name: 'Admin',
    description: 'Full operational access',
    color: 'default',
  },
  support: {
    name: 'Support',
    description: 'View-only access with limited actions',
    color: 'secondary',
  },
  billing_admin: {
    name: 'Billing Admin',
    description: 'Billing and subscription management only',
    color: 'outline',
  },
};

// Check if a role has a specific permission
export function hasPermission(role: AdminRole | undefined, permission: AdminPermission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

// Check if a role has any of the specified permissions
export function hasAnyPermission(role: AdminRole | undefined, permissions: AdminPermission[]): boolean {
  if (!role) return false;
  return permissions.some(permission => hasPermission(role, permission));
}

// Check if a role has all of the specified permissions
export function hasAllPermissions(role: AdminRole | undefined, permissions: AdminPermission[]): boolean {
  if (!role) return false;
  return permissions.every(permission => hasPermission(role, permission));
}

// Get the navigation items a role can access
export function getAccessibleNavItems(role: AdminRole | undefined): string[] {
  if (!role) return [];

  const navItems: string[] = ['/admin']; // Dashboard always accessible

  if (hasPermission(role, 'users:view')) navItems.push('/admin/users');
  if (hasPermission(role, 'drivers:view')) navItems.push('/admin/drivers');
  if (hasPermission(role, 'loads:view')) navItems.push('/admin/loads');
  if (hasPermission(role, 'matches:view')) navItems.push('/admin/matches');
  if (hasPermission(role, 'tlas:view')) navItems.push('/admin/tlas');
  if (hasPermission(role, 'audit:view')) navItems.push('/admin/audit');
  if (hasPermission(role, 'billing:view')) navItems.push('/admin/billing');
  if (hasPermission(role, 'admin:manage_roles')) navItems.push('/admin/settings');

  return navItems;
}

// Check if user can access a specific admin route
export function canAccessRoute(role: AdminRole | undefined, route: string): boolean {
  const accessibleNavItems = getAccessibleNavItems(role);
  // Check if the route starts with any accessible nav item
  return accessibleNavItems.some(item => route === item || route.startsWith(item + '/'));
}

// Get the default role for legacy admin users (isAdmin: true but no role)
export function getDefaultRoleForLegacyAdmin(): AdminRole {
  return 'admin';
}

// All available admin roles for selection
export const ALL_ADMIN_ROLES: AdminRole[] = ['super_admin', 'admin', 'support', 'billing_admin'];
