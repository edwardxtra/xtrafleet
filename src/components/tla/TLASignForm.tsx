import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, PenLine, FileText, MapPin, ChevronDown, ChevronUp, Truck } from "lucide-react";
import Link from "next/link";
import type { TLA, InsuranceOption } from "@/lib/data";
import { useUser, useFirestore } from "@/firebase";
import { signTLA } from "@/lib/tla-actions";
import { showError } from "@/lib/toast-utils";

// Location data type
type LocationData = {
  address: string;
  city: string;
  state: string;
  zip: string;
  instructions?: string;
  contactName?: string;
  contactPhone?: string;
};

const emptyLocation: LocationData = {
  address: "",
  city: "",
  state: "",
  zip: "",
  instructions: "",
  contactName: "",
  contactPhone: "",
};

interface TLASignFormProps {
  tla: TLA;
  tlaId: string;
  signingRole: 'lessor' | 'lessee';
  onSignSuccess: (updatedTLA: TLA) => void;
}

export function TLASignForm({ tla, tlaId, signingRole, onSignSuccess }: TLASignFormProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const [isSigning, setIsSigning] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [consentToEsign, setConsentToEsign] = useState(false);
  const [insuranceOption, setInsuranceOption] = useState<InsuranceOption | "">("");

  // Location state (for lessee signing)
  const [pickupLocation, setPickupLocation] = useState<LocationData>(
    tla.locations?.pickup || { ...emptyLocation, city: tla.trip.origin.split(',')[0].trim() }
  );
  const [deliveryLocation, setDeliveryLocation] = useState<LocationData>(
    tla.locations?.delivery || { ...emptyLocation, city: tla.trip.destination.split(',')[0].trim() }
  );
  const [differentReturnLocation, setDifferentReturnLocation] = useState(
    tla.locations?.truckReturn?.differentFromDelivery || false
  );
  const [truckReturnLocation, setTruckReturnLocation] = useState<LocationData>(
    tla.locations?.truckReturn ? {
      address: tla.locations.truckReturn.address || "",
      city: tla.locations.truckReturn.city || "",
      state: tla.locations.truckReturn.state || "",
      zip: tla.locations.truckReturn.zip || "",
      instructions: tla.locations.truckReturn.instructions || "",
      contactName: "",
      contactPhone: "",
    } : emptyLocation
  );

  // Collapsible state
  const [locationsOpen, setLocationsOpen] = useState(true);

  const needsInsuranceSelection = signingRole === 'lessee' && !tla.insurance?.option;
  const needsLocationCapture = signingRole === 'lessee' && !tla.locations?.pickup;

  const validateLocations = () => {
    if (!needsLocationCapture) return true;

    // Validate pickup
    if (!pickupLocation.address.trim() || !pickupLocation.city.trim() ||
        !pickupLocation.state.trim() || !pickupLocation.zip.trim()) {
      showError("Please complete all required pickup location fields");
      return false;
    }

    // Validate delivery
    if (!deliveryLocation.address.trim() || !deliveryLocation.city.trim() ||
        !deliveryLocation.state.trim() || !deliveryLocation.zip.trim()) {
      showError("Please complete all required delivery location fields");
      return false;
    }

    // Validate truck return if different
    if (differentReturnLocation) {
      if (!truckReturnLocation.address.trim() || !truckReturnLocation.city.trim() ||
          !truckReturnLocation.state.trim() || !truckReturnLocation.zip.trim()) {
        showError("Please complete all required truck return location fields");
        return false;
      }
    }

    return true;
  };

  const handleSign = async () => {
    if (!firestore || !user) return;

    if (!signatureName.trim()) {
      showError("Please enter your full legal name");
      return;
    }

    if (!agreeToTerms) {
      showError("Please agree to the terms of the agreement");
      return;
    }

    if (!consentToEsign) {
      showError("Please consent to use electronic signatures");
      return;
    }

    if (needsInsuranceSelection && !insuranceOption) {
      showError("Please select an insurance option");
      return;
    }

    if (!validateLocations()) {
      return;
    }

    setIsSigning(true);

    try {
      // Build locations data for lessee
      const locationsData = needsLocationCapture ? {
        pickup: {
          address: pickupLocation.address.trim(),
          city: pickupLocation.city.trim(),
          state: pickupLocation.state.trim().toUpperCase(),
          zip: pickupLocation.zip.trim(),
          instructions: pickupLocation.instructions?.trim() || undefined,
          contactName: pickupLocation.contactName?.trim() || undefined,
          contactPhone: pickupLocation.contactPhone?.trim() || undefined,
        },
        delivery: {
          address: deliveryLocation.address.trim(),
          city: deliveryLocation.city.trim(),
          state: deliveryLocation.state.trim().toUpperCase(),
          zip: deliveryLocation.zip.trim(),
          instructions: deliveryLocation.instructions?.trim() || undefined,
          contactName: deliveryLocation.contactName?.trim() || undefined,
          contactPhone: deliveryLocation.contactPhone?.trim() || undefined,
        },
        truckReturn: {
          differentFromDelivery: differentReturnLocation,
          ...(differentReturnLocation ? {
            address: truckReturnLocation.address.trim(),
            city: truckReturnLocation.city.trim(),
            state: truckReturnLocation.state.trim().toUpperCase(),
            zip: truckReturnLocation.zip.trim(),
            instructions: truckReturnLocation.instructions?.trim() || undefined,
          } : {}),
        },
      } : undefined;

      const updatedTLA = await signTLA({
        firestore,
        tlaId,
        tla,
        userId: user.uid,
        signatureName: signatureName.trim(),
        role: signingRole,
        insuranceOption: insuranceOption || undefined,
        locations: locationsData,
      });

      if (updatedTLA) {
        setSignatureName("");
        setAgreeToTerms(false);
        setConsentToEsign(false);
        setInsuranceOption("");
        onSignSuccess(updatedTLA);
      }
    } catch (error) {
      // Error already handled in signTLA
    } finally {
      setIsSigning(false);
    }
  };

  const LocationFields = ({
    title,
    location,
    setLocation,
    showContact = true,
  }: {
    title: string;
    location: LocationData;
    setLocation: (loc: LocationData) => void;
    showContact?: boolean;
  }) => (
    <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
      <h4 className="font-medium flex items-center gap-2">
        <MapPin className="h-4 w-4" />
        {title}
      </h4>

      <div className="space-y-2">
        <Label>Street Address *</Label>
        <Input
          placeholder="123 Main St, Suite 100"
          value={location.address}
          onChange={(e) => setLocation({ ...location, address: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-2">
          <Label>City *</Label>
          <Input
            placeholder="City"
            value={location.city}
            onChange={(e) => setLocation({ ...location, city: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>State *</Label>
          <Input
            placeholder="TX"
            maxLength={2}
            value={location.state}
            onChange={(e) => setLocation({ ...location, state: e.target.value.toUpperCase() })}
          />
        </div>
        <div className="space-y-2">
          <Label>ZIP *</Label>
          <Input
            placeholder="12345"
            value={location.zip}
            onChange={(e) => setLocation({ ...location, zip: e.target.value })}
          />
        </div>
      </div>

      {showContact && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label>Contact Name</Label>
            <Input
              placeholder="John Doe"
              value={location.contactName || ""}
              onChange={(e) => setLocation({ ...location, contactName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Contact Phone</Label>
            <Input
              placeholder="(555) 123-4567"
              value={location.contactPhone || ""}
              onChange={(e) => setLocation({ ...location, contactPhone: e.target.value })}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Special Instructions</Label>
        <Textarea
          placeholder="Dock number, gate code, delivery hours, etc."
          value={location.instructions || ""}
          onChange={(e) => setLocation({ ...location, instructions: e.target.value })}
          rows={2}
        />
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <PenLine className="h-5 w-5" />
          Sign Agreement
        </CardTitle>
        <CardDescription>
          {signingRole === 'lessor'
            ? 'Sign as the driver provider (Lessor)'
            : 'Sign as the hiring carrier (Lessee)'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Location Details (Lessee only) */}
        {needsLocationCapture && (
          <Collapsible open={locationsOpen} onOpenChange={setLocationsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Trip Location Details
                </span>
                {locationsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Please provide exact addresses for pickup and delivery so the driver can navigate to the correct locations.
              </p>

              <LocationFields
                title="Pickup Location"
                location={pickupLocation}
                setLocation={setPickupLocation}
              />

              <LocationFields
                title="Delivery Location"
                location={deliveryLocation}
                setLocation={setDeliveryLocation}
              />

              <div className="flex items-center space-x-2 p-4 bg-muted/30 rounded-lg">
                <Checkbox
                  id="differentReturn"
                  checked={differentReturnLocation}
                  onCheckedChange={(checked) => setDifferentReturnLocation(checked === true)}
                />
                <Label htmlFor="differentReturn" className="text-sm cursor-pointer">
                  Truck returns to a different location (not delivery address)
                </Label>
              </div>

              {differentReturnLocation && (
                <LocationFields
                  title="Truck Return Location"
                  location={truckReturnLocation}
                  setLocation={setTruckReturnLocation}
                  showContact={false}
                />
              )}

              <Separator />
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Insurance Selection (Lessee only) */}
        {needsInsuranceSelection && (
          <div className="space-y-3">
            <Label>Insurance Confirmation *</Label>
            <RadioGroup
              value={insuranceOption}
              onValueChange={(v) => setInsuranceOption(v as InsuranceOption)}
            >
              <div className="flex items-start space-x-2">
                <RadioGroupItem value="existing_policy" id="existing" />
                <Label htmlFor="existing" className="text-sm font-normal cursor-pointer">
                  I confirm that my active insurance policy includes leased or temporary drivers for this trip.
                </Label>
              </div>
              <div className="flex items-start space-x-2">
                <RadioGroupItem value="trip_coverage" id="trip" />
                <Label htmlFor="trip" className="text-sm font-normal cursor-pointer">
                  I elect to obtain trip-based coverage through an approved third-party provider.
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {/* Signature Name */}
        <div className="space-y-2">
          <Label htmlFor="signatureName">Full Legal Name *</Label>
          <Input
            id="signatureName"
            placeholder="Type your full name exactly as it appears on your license"
            value={signatureName}
            onChange={(e) => setSignatureName(e.target.value)}
            autoComplete="name"
          />
          <p className="text-xs text-muted-foreground">
            Your typed name will serve as your electronic signature
          </p>
        </div>

        {/* Agreement Checkbox */}
        <div className="flex items-start space-x-2">
          <Checkbox
            id="agreeToTerms"
            checked={agreeToTerms}
            onCheckedChange={(checked) => setAgreeToTerms(checked === true)}
          />
          <Label htmlFor="agreeToTerms" className="text-sm font-normal cursor-pointer">
            I have read and agree to all terms and conditions of this Trip Lease Agreement.
          </Label>
        </div>

        {/* E-Sign Consent Checkbox */}
        <div className="flex items-start space-x-2">
          <Checkbox
            id="consentToEsign"
            checked={consentToEsign}
            onCheckedChange={(checked) => setConsentToEsign(checked === true)}
          />
          <Label htmlFor="consentToEsign" className="text-sm font-normal cursor-pointer">
            I consent to use electronic signatures and understand that my electronic signature is
            legally binding.{" "}
            <Link
              href="/legal/esign-consent"
              target="_blank"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Learn more
              <FileText className="h-3 w-3" />
            </Link>
          </Label>
        </div>

        {/* Audit Trail Notice */}
        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
          <p className="font-medium mb-1">Signature Audit Trail:</p>
          <p>
            Your signature will include your name, current date/time, IP address, and device information
            for legal compliance and verification purposes.
          </p>
        </div>
      </CardContent>
      <CardFooter>
        <Button
          onClick={handleSign}
          disabled={isSigning || !signatureName.trim() || !agreeToTerms || !consentToEsign || (needsInsuranceSelection && !insuranceOption)}
          className="w-full"
        >
          {isSigning ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Signing...
            </>
          ) : (
            <>
              <PenLine className="h-4 w-4 mr-2" />
              Sign Agreement Electronically
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
