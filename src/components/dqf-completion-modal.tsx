"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DQFCompletionForm } from "./dqf-completion-form";

interface DQFCompletionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function DQFCompletionModal({ open, onOpenChange, onComplete }: DQFCompletionModalProps) {
  const handleComplete = () => {
    onComplete?.();
    onOpenChange(false);
  };

  const handleCancel = () => {
    if (confirm("Are you sure? You won't be able to match with loads until you complete your DQF.")) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) {
        handleCancel();
      } else {
        onOpenChange(open);
      }
    }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-headline">Driver Qualification File Required</DialogTitle>
          <DialogDescription>
            Before you can start matching with loads, please complete your Driver Qualification File (DQF) as required by FMCSA regulations.
          </DialogDescription>
        </DialogHeader>
        <DQFCompletionForm onComplete={handleComplete} onCancel={handleCancel} />
      </DialogContent>
    </Dialog>
  );
}
