'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  href: string;
  ctaLabel: string;
}

interface OnboardingChecklistProps {
  items: ChecklistItem[];
  className?: string;
}

export function OnboardingChecklist({ items, className }: OnboardingChecklistProps) {
  const completedCount = items.filter(item => item.completed).length;
  const totalCount = items.length;
  const progressPercentage = (completedCount / totalCount) * 100;
  const isFullyComplete = completedCount === totalCount;

  if (isFullyComplete) {
    return null; // Hide checklist when everything is complete
  }

  return (
    <Card className={cn('border-primary/50 bg-primary/5', className)}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="font-headline">Getting Started</CardTitle>
            <CardDescription>
              Complete these steps to activate your account
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">
              {completedCount}/{totalCount}
            </div>
            <div className="text-xs text-muted-foreground">completed</div>
          </div>
        </div>
        <Progress value={progressPercentage} className="h-2 mt-4" />
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'flex items-start gap-3 p-3 rounded-lg border transition-all',
              item.completed 
                ? 'bg-muted/50 border-muted' 
                : 'bg-background border-border hover:border-primary/50 hover:bg-primary/5'
            )}
          >
            <div className="pt-0.5">
              {item.completed ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className={cn(
                  'font-medium text-sm',
                  item.completed && 'text-muted-foreground line-through'
                )}>
                  {item.title}
                </h4>
                {!item.completed && (
                  <Button asChild size="sm" variant="ghost" className="h-auto py-1 px-2">
                    <Link href={item.href} className="flex items-center gap-1 text-xs">
                      {item.ctaLabel}
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </Button>
                )}
              </div>
              <p className={cn(
                'text-xs',
                item.completed ? 'text-muted-foreground' : 'text-muted-foreground'
              )}>
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
