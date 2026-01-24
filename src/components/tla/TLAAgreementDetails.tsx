import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { User, Truck, DollarSign, Shield, Timer, MapPin, RotateCcw } from "lucide-react";
import type { TLA } from "@/lib/data";
import { formatTLADate, formatTripDuration } from "@/lib/tla-utils";

interface TLAAgreementDetailsProps {
  tla: TLA;
}

export function TLAAgreementDetails({ tla }: TLAAgreementDetailsProps) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Agreement Details</CardTitle>
        <CardDescription>
          FMCSA-Compliant Short-Term Lease – Driver Only
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-6 text-sm">
            {/* Parties */}
            <div>
              <h3 className="font-semibold mb-3">Parties</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">
                    Fleet A (Lessor - Driver Provider)
                  </p>
                  <p className="font-semibold">{tla.lessor.legalName}</p>
                  <p className="text-muted-foreground text-xs">{tla.lessor.address}</p>
                  {tla.lessor.dotNumber && (
                    <p className="text-xs">DOT: {tla.lessor.dotNumber}</p>
                  )}
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">
                    Fleet B (Lessee - Hiring Carrier)
                  </p>
                  <p className="font-semibold">{tla.lessee.legalName}</p>
                  <p className="text-muted-foreground text-xs">{tla.lessee.address}</p>
                  {tla.lessee.dotNumber && (
                    <p className="text-xs">DOT: {tla.lessee.dotNumber}</p>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Driver */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <User className="h-4 w-4" />
                Driver
              </h3>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="font-semibold">{tla.driver.name}</p>
                {tla.driver.cdlNumber && <p className="text-xs">CDL: {tla.driver.cdlNumber}</p>}
                {tla.driver.medicalCardExpiry && (
                  <p className="text-xs">
                    Medical Card Expires: {formatTLADate(tla.driver.medicalCardExpiry)}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Trip Details */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Trip Details
              </h3>
              <div className="grid gap-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Route:</span>
                  <span className="font-medium">
                    {tla.trip.origin} → {tla.trip.destination}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cargo:</span>
                  <span>{tla.trip.cargo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Weight:</span>
                  <span>{tla.trip.weight.toLocaleString()} lbs</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Start Date:</span>
                  <span>{formatTLADate(tla.trip.startDate)}</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Location Details (if provided) */}
            {tla.locations?.pickup && (
              <>
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Location Details
                  </h3>
                  <div className="space-y-4">
                    {/* Pickup Location */}
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                      <p className="text-xs font-semibold text-blue-600 mb-2 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        PICKUP
                      </p>
                      <p className="font-medium">{tla.locations.pickup.address}</p>
                      <p className="text-sm">
                        {tla.locations.pickup.city}, {tla.locations.pickup.state} {tla.locations.pickup.zip}
                      </p>
                      {tla.locations.pickup.contactName && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Contact: {tla.locations.pickup.contactName}
                          {tla.locations.pickup.contactPhone && ` - ${tla.locations.pickup.contactPhone}`}
                        </p>
                      )}
                      {tla.locations.pickup.instructions && (
                        <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-950/20 rounded text-xs">
                          <span className="font-medium">Instructions: </span>
                          {tla.locations.pickup.instructions}
                        </div>
                      )}
                    </div>

                    {/* Delivery Location */}
                    {tla.locations?.delivery && (
                      <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                        <p className="text-xs font-semibold text-green-600 mb-2 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          DELIVERY
                        </p>
                        <p className="font-medium">{tla.locations.delivery.address}</p>
                        <p className="text-sm">
                          {tla.locations.delivery.city}, {tla.locations.delivery.state} {tla.locations.delivery.zip}
                        </p>
                        {tla.locations.delivery.contactName && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Contact: {tla.locations.delivery.contactName}
                            {tla.locations.delivery.contactPhone && ` - ${tla.locations.delivery.contactPhone}`}
                          </p>
                        )}
                        {tla.locations.delivery.instructions && (
                          <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-950/20 rounded text-xs">
                            <span className="font-medium">Instructions: </span>
                            {tla.locations.delivery.instructions}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Truck Return Location (if different from delivery) */}
                    {tla.locations?.truckReturn?.differentFromDelivery && tla.locations.truckReturn.address && (
                      <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                        <p className="text-xs font-semibold text-purple-600 mb-2 flex items-center gap-1">
                          <RotateCcw className="h-3 w-3" />
                          TRUCK RETURN
                        </p>
                        <p className="font-medium">{tla.locations.truckReturn.address}</p>
                        <p className="text-sm">
                          {tla.locations.truckReturn.city}, {tla.locations.truckReturn.state} {tla.locations.truckReturn.zip}
                        </p>
                        {tla.locations.truckReturn.instructions && (
                          <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-950/20 rounded text-xs">
                            <span className="font-medium">Instructions: </span>
                            {tla.locations.truckReturn.instructions}
                          </div>
                        )}
                      </div>
                    )}

                    {/* If truck returns to delivery location */}
                    {tla.locations?.truckReturn && !tla.locations.truckReturn.differentFromDelivery && (
                      <p className="text-xs text-muted-foreground">
                        <RotateCcw className="h-3 w-3 inline mr-1" />
                        Truck returns to delivery location
                      </p>
                    )}
                  </div>
                </div>

                <Separator />
              </>
            )}

            {/* Payment */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Payment Terms
              </h3>
              <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                <p className="text-2xl font-bold text-green-600">
                  ${tla.payment.amount.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">Due upon trip completion</p>
              </div>
            </div>

            <Separator />

            {/* Insurance */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Insurance & Liability
              </h3>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>
                  Fleet B assumes liability for all vehicle and driver operations during the
                  trip.
                </p>
                <p>
                  Fleet A confirms that the Driver holds a valid CDL, possesses a current
                  medical certificate, and has a compliant driver qualification file.
                </p>
                {tla.insurance?.option && (
                  <div className="mt-3 p-2 bg-muted rounded">
                    <p className="font-medium text-foreground">
                      {tla.insurance.option === 'existing_policy'
                        ? '☑ Lessee confirms existing insurance policy covers this trip'
                        : '☑ Lessee elected trip-based coverage'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Trip Tracking Info (if started) */}
            {tla.tripTracking?.startedAt && (
              <>
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Timer className="h-4 w-4" />
                    Trip Tracking
                  </h3>
                  <div className="grid gap-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Started:</span>
                      <span>{formatTLADate(tla.tripTracking.startedAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Started By:</span>
                      <span>{tla.tripTracking.startedByName}</span>
                    </div>
                    {tla.tripTracking.endedAt && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Ended:</span>
                          <span>{formatTLADate(tla.tripTracking.endedAt)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Ended By:</span>
                          <span>{tla.tripTracking.endedByName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Duration:</span>
                          <span className="font-medium">
                            {formatTripDuration(tla.tripTracking.durationMinutes || 0)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Legal Terms Summary */}
            <div>
              <h3 className="font-semibold mb-3">Terms & Conditions</h3>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>
                  <strong>Control:</strong> Fleet B has exclusive possession, control, and
                  responsibility for the Driver during the trip.
                </p>
                <p>
                  <strong>Indemnification:</strong> Each party agrees to indemnify and hold
                  harmless the other against claims caused by its negligence.
                </p>
                <p>
                  <strong>Platform:</strong> XtraFleet Technologies, Inc. is a neutral
                  technology facilitator and assumes no liability.
                </p>
                <p>
                  <strong>Retention:</strong> Both parties shall retain documentation for a
                  minimum of three (3) years.
                </p>
                <p>
                  <strong>Governing Law:</strong> This Agreement is governed by Delaware law
                  and applicable FMCSA regulations.
                </p>
              </div>
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
