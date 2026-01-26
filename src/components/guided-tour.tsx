'use client';

import { useEffect, useState, useCallback } from 'react';
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

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
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
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [tooltipPlacement, setTooltipPlacement] = useState<'top' | 'bottom' | 'left' | 'right'>('bottom');

  useEffect(() => {
    // Check if user has seen this tour
    const hasSeenTour = localStorage.getItem(`tour_${tourKey}`);
    if (!hasSeenTour && autoStart) {
      // Small delay to let page render
      setTimeout(() => setIsActive(true), 1000);
    }
  }, [tourKey, autoStart]);

  const updatePosition = useCallback(() => {
    if (!isActive) return;

    const step = steps[currentStep];
    const element = document.querySelector(step.target);

    if (element) {
      const rect = element.getBoundingClientRect();
      const padding = 8; // Padding around the spotlight

      // Calculate spotlight rectangle (viewport-relative for the overlay)
      setSpotlightRect({
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      });

      // Calculate tooltip position
      const placement = step.placement || 'bottom';
      setTooltipPlacement(placement);

      let top = 0;
      let left = 0;
      const tooltipWidth = 320; // w-80 = 20rem = 320px
      const tooltipHeight = 200; // Approximate height
      const margin = 16;

      switch (placement) {
        case 'bottom':
          top = rect.bottom + margin;
          left = rect.left + rect.width / 2;
          // Check if tooltip would go off-screen bottom
          if (top + tooltipHeight > window.innerHeight) {
            top = rect.top - tooltipHeight - margin;
            setTooltipPlacement('top');
          }
          break;
        case 'top':
          top = rect.top - margin;
          left = rect.left + rect.width / 2;
          // Check if tooltip would go off-screen top
          if (top - tooltipHeight < 0) {
            top = rect.bottom + margin;
            setTooltipPlacement('bottom');
          }
          break;
        case 'right':
          top = rect.top + rect.height / 2;
          left = rect.right + margin;
          // Check if tooltip would go off-screen right
          if (left + tooltipWidth > window.innerWidth) {
            left = rect.left - tooltipWidth - margin;
            setTooltipPlacement('left');
          }
          break;
        case 'left':
          top = rect.top + rect.height / 2;
          left = rect.left - margin;
          // Check if tooltip would go off-screen left
          if (left - tooltipWidth < 0) {
            left = rect.right + margin;
            setTooltipPlacement('right');
          }
          break;
      }

      // Ensure tooltip stays within horizontal bounds
      if (placement === 'top' || placement === 'bottom') {
        const halfWidth = tooltipWidth / 2;
        if (left - halfWidth < margin) {
          left = halfWidth + margin;
        } else if (left + halfWidth > window.innerWidth - margin) {
          left = window.innerWidth - halfWidth - margin;
        }
      }

      setTooltipPosition({ top, left });

      // Scroll element into view if needed (with padding for the tooltip)
      const elementTop = rect.top;
      const elementBottom = rect.bottom;
      const viewportHeight = window.innerHeight;

      if (elementTop < 100 || elementBottom > viewportHeight - 100) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [isActive, currentStep, steps]);

  useEffect(() => {
    if (!isActive) return;

    // Initial position update
    updatePosition();

    // Update on scroll and resize
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true); // capture phase for nested scrolls

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isActive, updatePosition]);

  // Update position when step changes
  useEffect(() => {
    if (isActive) {
      // Small delay to allow any animations to complete
      setTimeout(updatePosition, 100);
    }
  }, [currentStep, isActive, updatePosition]);

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
    setSpotlightRect(null);
    onComplete?.();
  };

  const handleSkip = () => {
    localStorage.setItem(`tour_${tourKey}`, 'skipped');
    setIsActive(false);
    setSpotlightRect(null);
  };

  if (!isActive || !spotlightRect) return null;

  const step = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  // Calculate tooltip transform based on placement
  const getTooltipTransform = () => {
    switch (tooltipPlacement) {
      case 'top':
        return 'translate(-50%, -100%)';
      case 'bottom':
        return 'translate(-50%, 0)';
      case 'left':
        return 'translate(-100%, -50%)';
      case 'right':
        return 'translate(0, -50%)';
      default:
        return 'translate(-50%, 0)';
    }
  };

  return (
    <>
      {/* SVG Overlay with spotlight cutout */}
      <svg
        className="fixed inset-0 z-40 pointer-events-none"
        style={{ width: '100vw', height: '100vh' }}
      >
        <defs>
          <mask id="spotlight-mask">
            {/* White = visible, black = hidden */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={spotlightRect.left}
              y={spotlightRect.top}
              width={spotlightRect.width}
              height={spotlightRect.height}
              rx="8"
              fill="black"
            />
          </mask>
        </defs>
        {/* Dark overlay with cutout */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.6)"
          mask="url(#spotlight-mask)"
          className="pointer-events-auto"
          onClick={handleSkip}
        />
      </svg>

      {/* Spotlight border highlight */}
      <div
        className="fixed z-40 pointer-events-none rounded-lg"
        style={{
          top: spotlightRect.top,
          left: spotlightRect.left,
          width: spotlightRect.width,
          height: spotlightRect.height,
          boxShadow: '0 0 0 3px hsl(var(--primary)), 0 0 20px rgba(0, 0, 0, 0.3)',
          transition: 'all 0.3s ease-out',
        }}
      />

      {/* Tooltip */}
      <Card
        className="fixed z-50 w-80 shadow-xl animate-in fade-in-0 zoom-in-95"
        style={{
          top: `${tooltipPosition.top}px`,
          left: `${tooltipPosition.left}px`,
          transform: getTooltipTransform(),
          transition: 'top 0.3s ease-out, left 0.3s ease-out',
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
    </>
  );
}
