import { Card } from "@/components/ui/card";

export default function ESignConsentPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Electronic Signature Consent</h1>
      
      <div className="prose prose-sm max-w-none space-y-6">
        <section>
          <h2 className="text-xl font-semibold mb-3">Electronic Signature Disclosure and Consent</h2>
          <p className="text-muted-foreground mb-4">
            Last Updated: January 13, 2026
          </p>

          <div className="space-y-4 text-sm">
            <p>
              By checking the consent box and electronically signing documents through XtraFleet, 
              you agree to conduct business electronically and accept electronic signatures as legally binding.
            </p>

            <h3 className="font-semibold mt-4 mb-2">1. Consent to Electronic Signatures</h3>
            <p className="text-muted-foreground">
              You agree that your electronic signature is the legal equivalent of your manual signature 
              on this agreement. By clicking the "Sign" button and providing your electronic signature, 
              you consent to be legally bound by the agreement's terms and conditions.
            </p>

            <h3 className="font-semibold mt-4 mb-2">2. How Electronic Signatures Work</h3>
            <p className="text-muted-foreground mb-2">
              When you sign a document electronically on XtraFleet, we capture:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li>Your typed full legal name</li>
              <li>Date and time of signature</li>
              <li>IP address from which you signed</li>
              <li>Device and browser information</li>
              <li>Your explicit consent to sign electronically</li>
              <li>The user ID associated with your account</li>
            </ul>

            <h3 className="font-semibold mt-4 mb-2">3. Legal Effect</h3>
            <p className="text-muted-foreground">
              Your electronic signature on documents through XtraFleet has the same legal effect, validity, 
              and enforceability as a handwritten signature, in accordance with the federal Electronic 
              Signatures in Global and National Commerce Act (ESIGN Act) and the Uniform Electronic 
              Transactions Act (UETA).
            </p>

            <h3 className="font-semibold mt-4 mb-2">4. Hardware and Software Requirements</h3>
            <p className="text-muted-foreground mb-2">
              To access and sign documents electronically, you need:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li>A device with internet access (computer, tablet, or smartphone)</li>
              <li>A current web browser (Chrome, Firefox, Safari, or Edge)</li>
              <li>A valid email address to receive notifications</li>
              <li>Sufficient storage to save or download copies of agreements</li>
            </ul>

            <h3 className="font-semibold mt-4 mb-2">5. Right to Withdraw Consent</h3>
            <p className="text-muted-foreground">
              You may withdraw your consent to receive documents electronically at any time by contacting 
              us at support@xtrafleet.com. However, withdrawal of consent will not affect the legal validity 
              of documents you have already signed electronically.
            </p>

            <h3 className="font-semibold mt-4 mb-2">6. Document Retention</h3>
            <p className="text-muted-foreground">
              All electronically signed documents are securely stored in your XtraFleet account. You can 
              download PDF copies of signed agreements at any time. We recommend you maintain your own 
              copies of all signed documents for your records.
            </p>

            <h3 className="font-semibold mt-4 mb-2">7. Audit Trail</h3>
            <p className="text-muted-foreground">
              Each electronic signature includes a complete audit trail showing:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li>Who signed the document</li>
              <li>When they signed (date and time)</li>
              <li>From what IP address</li>
              <li>What device and browser were used</li>
              <li>Confirmation that they consented to sign electronically</li>
            </ul>

            <h3 className="font-semibold mt-4 mb-2">8. Questions</h3>
            <p className="text-muted-foreground">
              If you have questions about electronic signatures or this consent, please contact us at 
              support@xtrafleet.com or call our support line.
            </p>

            <div className="mt-6 p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-2">Important Notice:</p>
              <p className="text-sm text-muted-foreground">
                By proceeding to sign documents electronically on XtraFleet, you confirm that you have 
                read, understand, and agree to this Electronic Signature Consent. You also confirm that 
                you have the necessary equipment and technical capabilities to access and retain electronic 
                documents.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}