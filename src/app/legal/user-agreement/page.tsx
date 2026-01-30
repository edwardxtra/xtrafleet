import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'User Agreement | XtraFleet',
  description: 'XtraFleet User Agreement for Carriers and Drivers',
};

export default function UserAgreementPage() {
  return (
    <div className="prose prose-slate dark:prose-invert max-w-4xl mx-auto">
      <h1>User Agreement</h1>
      <p className="text-sm text-muted-foreground">Last Updated: October 17, 2025</p>

      <section>
        <h2>1. Purpose</h2>
        <p>
          This User Agreement governs the participation of Carriers and Drivers on the XtraFleet Platform. 
          It establishes roles, duties, and compliance attestations necessary for safe and lawful operation.
        </p>
      </section>

      <section>
        <h2>2. Account Verification</h2>
        <h3>All Carriers must provide:</h3>
        <ul>
          <li>FMCSA registration, if applicable, and active USDOT/MC numbers,</li>
          <li>Proof of insurance (Certificate of Insurance),</li>
          <li>Tax identification (W-9),</li>
          <li>Company contact information, and</li>
          <li>Summary Driver qualification file</li>
        </ul>

        <h3>Drivers must provide:</h3>
        <ul>
          <li>Commercial Driver's License (CDL),</li>
          <li>Medical certificate,</li>
          <li>Employment verification,</li>
          <li>Drug and alcohol testing history if required, and</li>
          <li>Consent for background/Pre-employment Screening Program/drug & alcohol checks.</li>
        </ul>
      </section>

      <section>
        <h2>3. Role Definitions</h2>
        <ul>
          <li><strong>Fleet A (Lessor Carrier):</strong> A motor carrier that supplies a qualified driver to another carrier.</li>
          <li><strong>Fleet B (Lessee Carrier):</strong> A motor carrier that temporarily leases a driver from Fleet A for a specific trip.</li>
          <li><strong>Driver:</strong> The individual authorized by Fleet A and accepted by Fleet B for the defined lease period.</li>
        </ul>
      </section>

      <section>
        <h2>4. Compliance Attestation</h2>
        <p>By using the Platform, each Carrier certifies that:</p>
        <ul>
          <li>All uploaded documentation is current, accurate, and authentic.</li>
          <li>All drivers meet the standards of qualification.</li>
          <li>Each carrier maintains required insurance and compliance documentation.</li>
        </ul>
      </section>

      <section>
        <h2>5. Data Sharing and Privacy</h2>
        <ul>
          <li>Carriers consent to limited sharing of compliance data (e.g., COI, CDL validity, MVR status) to enable matching and verification.</li>
          <li>XtraFleet stores this information securely and does not sell or share data beyond compliance use cases.</li>
        </ul>
      </section>

      <section>
        <h2>6. Ratings & Reviews</h2>
        <ul>
          <li>You may leave reviews for other users based on actual experiences.</li>
          <li>Reviews must be honest, respectful, and comply with our content guidelines.</li>
          <li>We may remove reviews that are false, offensive, or violate this Agreement.</li>
          <li>XtraFleet is not responsible and/or liable for any reviews and ratings placed on the platform.</li>
        </ul>
      </section>

      <section>
        <h2>7. Insurance Confirmation (Digital Checkbox)</h2>
        <p>Before initiating any trip or lease, Fleet B must complete the following:</p>
        <ul>
          <li>I confirm that my existing insurance policy covers leased or temporary drivers for the duration of this trip.</li>
          <li>OR I elect to purchase trip-based coverage through an approved XtraFleet third-party partner.</li>
        </ul>
        <p className="text-sm italic">
          XtraFleet does not verify or guarantee coverage sufficiency and is not responsible for the accuracy of any attestation.
        </p>
      </section>

      <section>
        <h2>8. Conduct, Cancellations, and Penalties</h2>
        <ul>
          <li>Fleets are expected to communicate clearly and professionally.</li>
          <li>Cancellation after trip activation may result in administrative penalties.</li>
          <li>Drivers who fail to report or abandon assignments may be flagged for compliance review.</li>
        </ul>
      </section>

      <section>
        <h2>9. Termination</h2>
        <p>XtraFleet may suspend or terminate access for:</p>
        <ul>
          <li>False documentation,</li>
          <li>Insurance misrepresentation, or</li>
          <li>Non-compliance with FMCSA or state laws.</li>
        </ul>
      </section>

      <section>
        <h2>10. Acknowledgment</h2>
        <p className="font-medium">
          By checking acceptance, each Carrier acknowledges: "I understand XtraFleet is a technology platform 
          that facilitates carrier-to-carrier driver lease transactions and does not act as a broker, employer, or carrier."
        </p>
      </section>
    </div>
  );
}
