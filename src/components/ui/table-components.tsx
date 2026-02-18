'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Edit, Trash2, Eye } from 'lucide-react';
import { getInitials, stringToColor, formatCurrency, formatRelativeTime } from '@/lib/utils';
import Link from 'next/link';

interface TableAvatarProps {
  name: string;
  subtitle?: string;
}

export function TableAvatar({ name, subtitle }: TableAvatarProps) {
  const initials = getInitials(name);
  const colorClass = stringToColor(name);

  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-8 w-8">
        <AvatarFallback className={`${colorClass} text-white text-xs font-medium`}>
          {initials}
        </AvatarFallback>
      </Avatar>
      <div>
        <div className="font-medium text-sm">{name}</div>
        {subtitle && (
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        )}
      </div>
    </div>
  );
}

interface TableStatusBadgeProps {
  status: string;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

export function TableStatusBadge({ status, variant = 'default' }: TableStatusBadgeProps) {
  // Auto-determine variant based on status
  let badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' = variant;
  
  const lowerStatus = status.toLowerCase();
  if (lowerStatus.includes('available') || lowerStatus.includes('active') || lowerStatus.includes('completed') || lowerStatus.includes('signed')) {
    badgeVariant = 'default';
  } else if (lowerStatus.includes('pending') || lowerStatus.includes('in-transit') || lowerStatus.includes('on-trip') || lowerStatus.includes('in_progress')) {
    badgeVariant = 'secondary';
  } else if (lowerStatus.includes('inactive') || lowerStatus.includes('declined') || lowerStatus.includes('unavailable') || lowerStatus.includes('rejected') || lowerStatus.includes('cancelled')) {
    badgeVariant = 'destructive';
  } else {
    badgeVariant = 'outline';
  }

  return (
    <Badge variant={badgeVariant} className="capitalize">
      {status}
    </Badge>
  );
}

interface TableActionsProps {
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  viewHref?: string;
  editHref?: string;
}

export function TableActions({ onView, onEdit, onDelete, viewHref, editHref }: TableActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(onView || viewHref) && (
          <DropdownMenuItem asChild={!!viewHref}>
            {viewHref ? (
              <Link href={viewHref}>
                <Eye className="mr-2 h-4 w-4" />
                View
              </Link>
            ) : (
              <button onClick={onView} className="w-full">
                <Eye className="mr-2 h-4 w-4" />
                View
              </button>
            )}
          </DropdownMenuItem>
        )}
        {(onEdit || editHref) && (
          <DropdownMenuItem asChild={!!editHref}>
            {editHref ? (
              <Link href={editHref}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Link>
            ) : (
              <button onClick={onEdit} className="w-full">
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </button>
            )}
          </DropdownMenuItem>
        )}
        {onDelete && (
          <DropdownMenuItem onClick={onDelete} className="text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface TableCurrencyProps {
  amount: number;
}

export function TableCurrency({ amount }: TableCurrencyProps) {
  return (
    <span className="font-medium tabular-nums">
      {formatCurrency(amount)}
    </span>
  );
}

interface TableDateProps {
  date: Date | string;
  relative?: boolean;
}

export function TableDate({ date, relative = true }: TableDateProps) {
  if (relative) {
    return (
      <span className="text-sm text-muted-foreground">
        {formatRelativeTime(date)}
      </span>
    );
  }
  
  const dateObj = new Date(date);
  return (
    <span className="text-sm">
      {dateObj.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      })}
    </span>
  );
}
