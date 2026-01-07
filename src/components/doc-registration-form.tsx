"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UploadCloud } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function DocRegistrationForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null);
  const [complianceFile, setComplianceFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    if (!insuranceFile && !complianceFile) {
      toast({
        title: "No files selected",
        description: "Please select at least one document to upload.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    // In a real application, you would handle the file upload to a service like Firebase Storage here.
    // For this example, we'll simulate the upload process.
    console.log("Uploading files:", {
      insurance: insuranceFile?.name,
      compliance: complianceFile?.name,
    });

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    toast({
      title: "Documents Uploaded",
      description: "Your documents have been submitted successfully.",
    });

    setIsSubmitting(false);
    // Redirect to the main dashboard after successful upload
    router.push("/dashboard");
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle className="font-headline text-2xl">
              Document Registration
            </CardTitle>
            <CardDescription>
              Upload your insurance and compliance documents. This will be
              stored securely.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="space-y-2">
              <Label htmlFor="insurance-cert" className="text-base">
                Certificate of Insurance
              </Label>
              <Input
                id="insurance-cert"
                type="file"
                onChange={(e) =>
                  setInsuranceFile(e.target.files ? e.target.files[0] : null)
                }
              />
              <p className="text-sm text-muted-foreground">
                Please upload your most recent certificate of insurance (e.g.,
                PDF, JPG, PNG).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="compliance-docs" className="text-base">
                Compliance Documents
              </Label>
              <Input
                id="compliance-docs"
                type="file"
                onChange={(e) =>
                  setComplianceFile(e.target.files ? e.target.files[0] : null)
                }
              />
              <p className="text-sm text-muted-foreground">
                Upload any other required compliance documents (e.g., W-9, operating authority).
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
             <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/dashboard")}
            >
              Skip for now
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Uploading..." : "Upload and Finish"}
              {!isSubmitting && <UploadCloud className="ml-2 h-4 w-4" />}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
