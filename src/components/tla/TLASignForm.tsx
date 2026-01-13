import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, PenLine } from "lucide-react";
import type { TLA, InsuranceOption } from "@/lib/data";
import { useUser, useFirestore } from "@/firebase";
import { signTLA } from "@/lib/tla-actions";
import { showError } from "@/lib/toast-utils";

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
  const [insuranceOption, setInsuranceOption] = useState<InsuranceOption | "">("");

  const needsInsuranceSelection = signingRole === 'lessee' && !tla.insurance?.option;

  const handleSign = async () => {
    if (!firestore || !user) return;

    if (!signatureName.trim()) {
      showError("Please enter your name to sign");
      return;
    }

    if (!agreeToTerms) {
      showError("Please agree to the terms to sign");
      return;
    }

    if (needsInsuranceSelection && !insuranceOption) {
      showError("Please select an insurance option");
      return;
    }

    setIsSigning(true);

    try {
      const updatedTLA = await signTLA({
        firestore,
        tlaId,
        tla,
        userId: user.uid,
        signatureName: signatureName.trim(),
        role: signingRole,
        insuranceOption: insuranceOption || undefined,
      });

      if (updatedTLA) {
        setSignatureName("");
        setAgreeToTerms(false);
        setInsuranceOption("");
        onSignSuccess(updatedTLA);
      }
    } catch (error) {
      // Error already handled in signTLA
    } finally {
      setIsSigning(false);
    }
  };

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
            placeholder="Type your full name to sign"
            value={signatureName}
            onChange={(e) => setSignatureName(e.target.value)}
          />
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
      </CardContent>
      <CardFooter>
        <Button
          onClick={handleSign}
          disabled={isSigning || !signatureName || !agreeToTerms || (needsInsuranceSelection && !insuranceOption)}
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
              Sign Agreement
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
