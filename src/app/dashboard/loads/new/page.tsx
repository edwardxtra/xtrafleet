'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { showSuccess, showError } from '@/lib/toast-utils';
import { ArrowLeft, Loader2, MapPin, Truck, Clock, DollarSign, AlertCircle, CheckCircle } from 'lucide-react';
import { TRAILER_TYPES } from '@/lib/trailer-types';
import Link from 'next/link';

interface RoutePreview {
  distanceMiles: number;
  distanceText: string;
  durationSeconds: number;
  durationText: string;
  costPerMile?: string;
}

export default function PostLoadPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routePreview, setRoutePreview] = useState<RoutePreview | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    origin: '',
    destination: '',
    cargo: '',
    weight: '',
    price: '',
    pickupDate: '',
    trailerType: '',
    additionalDetails: '',
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear route preview if origin/destination changes
    if (field === 'origin' || field === 'destination') {
      setRoutePreview(null);
      setRouteError(null);
    }
  };

  const calculateRoute = async () => {
    if (!formData.origin || !formData.destination) {
      showError('Please enter both origin and destination');
      return;
    }

    setIsCalculatingRoute(true);
    setRouteError(null);

    try {
      const response = await fetch('/api/calculate-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: formData.origin,
          destination: formData.destination,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to calculate route');
      }

      const data = await response.json();
      
      // Calculate cost per mile if price is entered
      let costPerMile;
      if (formData.price) {
        const priceNum = parseFloat(formData.price);
        if (!isNaN(priceNum) && data.distance.value > 0) {
          const cpm = priceNum / data.distance.value;
          costPerMile = `$${cpm.toFixed(2)}/mi`;
        }
      }

      setRoutePreview({
        distanceMiles: Math.round(data.distance.value / 1609.34),
        distanceText: data.distance.text,
        durationSeconds: data.duration.value,
        durationText: data.duration.text,
        costPerMile,
      });

      showSuccess('Route calculated successfully!');
    } catch (error) {
      console.error('Route calculation error:', error);
      setRouteError('Could not calculate route. Load will be posted without route information.');
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.origin || !formData.destination || !formData.cargo || 
        !formData.weight || !formData.price || !formData.pickupDate) {
      showError('Please fill in all required fields');
      return;
    }

    const weight = parseFloat(formData.weight);
    const price = parseFloat(formData.price);

    if (isNaN(weight) || weight <= 0) {
      showError('Please enter a valid weight');
      return;
    }

    if (isNaN(price) || price <= 0) {
      showError('Please enter a valid price');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/loads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: formData.origin,
          destination: formData.destination,
          cargo: formData.cargo,
          weight,
          price,
          pickupDate: formData.pickupDate,
          trailerType: formData.trailerType || undefined,
          additionalDetails: formData.additionalDetails,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create load');
      }

      const data = await response.json();
      showSuccess('Load posted successfully!');
      
      // Redirect to loads page
      router.push('/dashboard/loads');
    } catch (error) {
      console.error('Submit error:', error);
      showError(error instanceof Error ? error.message : 'Failed to post load');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate minimum pickup date (tomorrow)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-6">
        <Link href="/dashboard/loads">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Loads
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-headline">Post New Load</CardTitle>
          <CardDescription>
            Create a new freight load and calculate the route distance automatically
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Route Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Route Information</h3>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="origin">
                    Origin <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="origin"
                    placeholder="e.g., Miami, FL"
                    value={formData.origin}
                    onChange={(e) => handleInputChange('origin', e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="destination">
                    Destination <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="destination"
                    placeholder="e.g., Atlanta, GA"
                    value={formData.destination}
                    onChange={(e) => handleInputChange('destination', e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Calculate Route Button */}
              <Button
                type="button"
                variant="outline"
                onClick={calculateRoute}
                disabled={!formData.origin || !formData.destination || isCalculatingRoute}
                className="w-full md:w-auto"
              >
                {isCalculatingRoute ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Calculating Route...
                  </>
                ) : (
                  <>
                    <Truck className="h-4 w-4 mr-2" />
                    Calculate Route
                  </>
                )}
              </Button>

              {/* Route Preview */}
              {routePreview && (
                <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-semibold text-green-900 dark:text-green-100">
                        Route Calculated
                      </p>
                      <div className="grid gap-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-green-600 dark:text-green-400" />
                          <span className="font-medium">Distance:</span>
                          <span>{routePreview.distanceText}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-green-600 dark:text-green-400" />
                          <span className="font-medium">Duration:</span>
                          <span>{routePreview.durationText}</span>
                        </div>
                        {routePreview.costPerMile && (
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
                            <span className="font-medium">Cost per mile:</span>
                            <span>{routePreview.costPerMile}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Route Error */}
              {routeError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{routeError}</AlertDescription>
                </Alert>
              )}
            </div>

            {/* Load Details Section */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-lg font-semibold">Load Details</h3>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cargo">
                    Cargo Type <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="cargo"
                    placeholder="e.g., Electronics, Food, Machinery"
                    value={formData.cargo}
                    onChange={(e) => handleInputChange('cargo', e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="weight">
                    Weight (lbs) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="weight"
                    type="number"
                    placeholder="e.g., 20000"
                    value={formData.weight}
                    onChange={(e) => handleInputChange('weight', e.target.value)}
                    required
                    min="1"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="price">
                    Price ($) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="price"
                    type="number"
                    placeholder="e.g., 1500"
                    value={formData.price}
                    onChange={(e) => handleInputChange('price', e.target.value)}
                    required
                    min="1"
                    step="0.01"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pickupDate">
                    Pickup Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="pickupDate"
                    type="date"
                    value={formData.pickupDate}
                    onChange={(e) => handleInputChange('pickupDate', e.target.value)}
                    required
                    min={minDate}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="trailerType">Trailer Type</Label>
                  <Select
                    value={formData.trailerType}
                    onValueChange={(value) => handleInputChange('trailerType', value)}
                  >
                    <SelectTrigger id="trailerType">
                      <SelectValue placeholder="Select trailer type (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {TRAILER_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="additionalDetails">Additional Details</Label>
                <Textarea
                  id="additionalDetails"
                  placeholder="Any special requirements, handling instructions, or notes..."
                  value={formData.additionalDetails}
                  onChange={(e) => handleInputChange('additionalDetails', e.target.value)}
                  rows={4}
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex gap-4 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/dashboard/loads')}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Posting Load...
                  </>
                ) : (
                  'Post Load'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
