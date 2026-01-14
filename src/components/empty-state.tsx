'use client';

import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  icon?: ReactNode;
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  actions?: EmptyStateAction[];
  tip?: string;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actions = [],
  tip,
  className,
}: EmptyStateProps) {
  return (
    <Card className={cn('border-dashed', className)}>
      <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <div className="h-8 w-8 text-muted-foreground">
            {icon}
          </div>
        </div>
        
        <h3 className="font-semibold text-lg mb-2">{title}</h3>
        
        <p className="text-sm text-muted-foreground max-w-sm mb-6">
          {description}
        </p>

        {actions.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {actions.map((action, index) => {
              const ButtonContent = (
                <Button
                  key={index}
                  variant={action.variant || 'default'}
                  onClick={action.onClick}
                  className="gap-2"
                >
                  {action.icon}
                  {action.label}
                </Button>
              );

              if (action.href) {
                return (
                  <Link key={index} href={action.href}>
                    {ButtonContent}
                  </Link>
                );
              }

              return ButtonContent;
            })}
          </div>
        )}

        {tip && (
          <div className="mt-6 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">💡 Pro tip:</span> {tip}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
