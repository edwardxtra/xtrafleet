"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Star, User, Truck, MapPin } from "lucide-react";
import { useFirestore } from "@/firebase";
import { doc, updateDoc, getDoc, addDoc, collection, runTransaction } from "firebase/firestore";
import { showSuccess, showError } from "@/lib/toast-utils";
import type { TLA } from "@/lib/data";

interface DriverRatingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tla: TLA;
  onSuccess?: () => void;
}

export function DriverRatingModal({
  open,
  onOpenChange,
  tla,
  onSuccess,
}: DriverRatingModalProps) {
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [comment, setComment] = useState<string>("");

  const handleSubmit = async () => {
    if (!firestore) return;

    if (rating === 0) {
      showError("Please select a rating");
      return;
    }

    setIsSubmitting(true);

    try {
      // Use a transaction to ensure atomic update of driver rating
      await runTransaction(firestore, async (transaction) => {
        // Get driver document
        const driverRef = doc(
          firestore,
          `owner_operators/${tla.lessor.ownerOperatorId}/drivers/${tla.driver.id}`
        );
        const driverDoc = await transaction.get(driverRef);

        if (!driverDoc.exists()) {
          throw new Error("Driver not found");
        }

        const driverData = driverDoc.data();
        const currentRating = driverData.rating || 0;
        const ratingCount = driverData.ratingCount || 0;

        // Calculate new average rating
        const newRatingCount = ratingCount + 1;
        const newAvgRating = ((currentRating * ratingCount) + rating) / newRatingCount;

        // Update driver with new rating
        transaction.update(driverRef, {
          rating: Math.round(newAvgRating * 10) / 10, // Round to 1 decimal
          ratingCount: newRatingCount,
          lastRatedAt: new Date().toISOString(),
        });

        // Update TLA to mark as rated
        const tlaRef = doc(firestore, `tlas/${tla.id}`);
        transaction.update(tlaRef, {
          rated: true,
          ratingGiven: rating,
          ratingComment: comment || null,
          ratedAt: new Date().toISOString(),
        });
      });

      // Create a rating record for history
      await addDoc(collection(firestore, "ratings"), {
        tlaId: tla.id,
        driverId: tla.driver.id,
        driverOwnerId: tla.lessor.ownerOperatorId,
        ratedByOwnerId: tla.lessee.ownerOperatorId,
        ratedByCompany: tla.lessee.legalName,
        rating,
        comment: comment || null,
        tripOrigin: tla.trip.origin,
        tripDestination: tla.trip.destination,
        createdAt: new Date().toISOString(),
      });

      showSuccess("Thank you for rating the driver!");
      onOpenChange(false);
      setRating(0);
      setComment("");
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error("Error submitting rating:", error);
      showError(error.message || "Failed to submit rating. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            Rate Driver
          </DialogTitle>
          <DialogDescription>
            How was your experience with this driver?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Trip Summary */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">{tla.driver.name}</p>
                <p className="text-xs text-muted-foreground">
                  {tla.lessor.legalName}
                </p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t">
              <div className="flex items-center gap-2 text-sm">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <span>
                  {tla.trip.origin} → {tla.trip.destination}
                </span>
              </div>
            </div>
          </div>

          {/* Star Rating */}
          <div className="space-y-2">
            <Label>Your Rating</Label>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="p-1 focus:outline-none focus:ring-2 focus:ring-primary rounded"
                >
                  <Star
                    className={`h-8 w-8 transition-colors ${
                      star <= (hoveredRating || rating)
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-gray-300"
                    }`}
                  />
                </button>
              ))}
            </div>
            <p className="text-center text-sm text-muted-foreground">
              {rating === 0
                ? "Click to rate"
                : rating === 1
                ? "Poor"
                : rating === 2
                ? "Fair"
                : rating === 3
                ? "Good"
                : rating === 4
                ? "Very Good"
                : "Excellent"}
            </p>
          </div>

          {/* Comment */}
          <div className="space-y-2">
            <Label htmlFor="comment">Comments (Optional)</Label>
            <Textarea
              id="comment"
              placeholder="Share your experience with this driver..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || rating === 0}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Rating"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
