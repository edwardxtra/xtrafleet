'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrendIndicatorProps {
  value: number;
  label?: string;
  suffix?: string;
  className?: string;
}

export function TrendIndicator({ value, label, suffix = '%', className }: TrendIndicatorProps) {
  const isPositive = value > 0;
  const isNeutral = value === 0;
  
  const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;
  
  const colorClass = isNeutral 
    ? 'text-muted-foreground' 
    : isPositive 
      ? 'text-green-600 dark:text-green-500' 
      : 'text-red-600 dark:text-red-500';
  
  const bgClass = isNeutral
    ? 'bg-muted'
    : isPositive
      ? 'bg-green-50 dark:bg-green-950/20'
      : 'bg-red-50 dark:bg-red-950/20';

  return (
    <div className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-md flex-shrink-0', bgClass, className)}>
      <Icon className={cn('h-3 w-3 flex-shrink-0', colorClass)} />
      <span className={cn('text-xs font-medium whitespace-nowrap', colorClass)}>
        {isPositive && '+'}{value}{suffix}
      </span>
      {label && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {label}
        </span>
      )}
    </div>
  );
}
