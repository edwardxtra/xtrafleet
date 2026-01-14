'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TourStep {
  target: string; // CSS selector
  title: string;
  content: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  disableBeacon?: boolean;
}

interface GuidedTourProps {
  steps: TourStep[];
  tourKey: string; // Unique key for this tour (stored in localStorage)
  autoStart?: boolean;
  onComplete?: () => void;
}

export function GuidedTour({ 
  steps, 
  tourKey, 
  autoStart = false,
  onComplete 
}: GuidedTourProps) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    // Check if user has seen this tour
    const hasSeenTour = localStorage.getItem(`tour_${tourKey}`);
    if (!hasSeenTour && autoStart) {
      // Small delay to let page render
      setTimeout(() => setIsActive(true), 1000);
    }
  }, [tourKey, autoStart]);

  useEffect(() => {
    if (!isActive) return;

    const updatePosition = () => {
      const step = steps[currentStep];
      const element = document.querySelector(step.target);
      
      if (element) {
        const rect = element.getBoundingClientRect();
        const placement = step.placement || 'bottom';
        
        let top = 0;
        let left = 0;

        switch (placement) {
          case 'bottom':
            top = rect.bottom + window.scrollY + 10;
            left = rect.left + window.scrollX + rect.width / 2;
            break;
          case 'top':
            top = rect.top + window.scrollY - 10;
            left = rect.left + window.scrollX + rect.width / 2;
            break;
          case 'right':
            top = rect.top + window.scrollY + rect.height / 2;
            left = rect.right + window.scrollX + 10;
            break;
          case 'left':
            top = rect.top + window.scrollY + rect.height / 2;
            left = rect.left + window.scrollX - 10;
            break;
        }

        setTooltipPosition({ top, left });

        // Highlight the element
        element.classList.add('guided-tour-highlight');
        
        // Scroll element into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
      
      // Remove highlight from all elements
      document.querySelectorAll('.guided-tour-highlight').forEach(el => {
        el.classList.remove('guided-tour-highlight');
      });
    };
  }, [isActive, currentStep, steps]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem(`tour_${tourKey}`, 'completed');
    setIsActive(false);
    onComplete?.();
  };

  const handleSkip = () => {
    localStorage.setItem(`tour_${tourKey}`, 'skipped');
    setIsActive(false);
  };

  if (!isActive) return null;

  const step = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={handleSkip}
      />

      {/* Tooltip */}
      <Card
        className="fixed z-50 w-80 shadow-xl animate-in fade-in-0 zoom-in-95"
        style={{
          top: `${tooltipPosition.top}px`,
          left: `${tooltipPosition.left}px`,
          transform: 'translateX(-50%)',
        }}
      >
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <h3 className="font-semibold text-base mb-1">{step.title}</h3>
              <p className="text-sm text-muted-foreground">
                Step {currentStep + 1} of {steps.length}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 -mt-1 -mr-1"
              onClick={handleSkip}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <p className="text-sm mb-4">{step.content}</p>

          {/* Progress */}
          <div className="flex gap-1 mb-4">
            {steps.map((_, index) => (
              <div
                key={index}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  index <= currentStep ? 'bg-primary' : 'bg-muted'
                )}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
            >
              Skip Tour
            </Button>
            
            <div className="flex gap-2">
              {!isFirstStep && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevious}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
              
              <Button
                size="sm"
                onClick={handleNext}
              >
                {isLastStep ? 'Finish' : 'Next'}
                {!isLastStep && <ChevronRight className="h-4 w-4 ml-1" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Global styles for highlighting */}
      <style jsx global>{`
        .guided-tour-highlight {
          position: relative;
          z-index: 45;
          box-shadow: 0 0 0 4px rgba(var(--primary), 0.3), 
                      0 0 0 9999px rgba(0, 0, 0, 0.5);
          border-radius: 0.5rem;
          transition: box-shadow 0.3s ease;
        }
      `}</style>
    </>
  );
}
