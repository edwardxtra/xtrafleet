export default function TermsPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
      
      <div className="prose prose-sm max-w-none space-y-6 dark:prose-invert">
        <p className="text-muted-foreground mb-6">
          XtraFleet Technologies, Inc.<br />
          Governing Law: Delaware, United States<br />
          Effective Date: October 17, 2025
        </p>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">1. Introduction</h2>
          <p className="text-sm text-muted-foreground">
            This Terms of Service Agreement ("Terms") is entered into by and between XtraFleet Technologies, Inc. 
            ("XtraFleet," "we," "our," or "us"), a Delaware corporation, and any user ("you," "Fleet A," "Fleet B," 
            "driver," or collectively, the "Users") who accesses or uses the XtraFleet digital Platform, mobile 
            application, website, or related services (the "Platform").
          </p>
          <p className="text-sm text-muted-foreground">
            By creating an account or using the Platform, you agree to comply with and be bound by these Terms.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">2. Platform Role</h2>
          
          <h3 className="text-lg font-semibold mt-3">Nature of Service</h3>
          <p className="text-sm text-muted-foreground">
            XtraFleet is a technology Platform that provides a digital facilitation service that enables registered 
            motor carriers ("Carriers") to enter into short-term driver lease arrangements with one another.
          </p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>"Fleet A" refers to a Carrier that supplies one or more qualified drivers for short-term lease.</li>
            <li>"Fleet B" refers to a Carrier that temporarily leases such driver(s) for a defined trip under Fleet B's active operating authority.</li>
          </ul>

          <h3 className="text-lg font-semibold mt-3">No Broker or Carrier Role</h3>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>XtraFleet does not act as a motor carrier, broker, freight forwarder, employer, or leasing company under federal or state transportation law.</li>
            <li>XtraFleet does not transport freight, dispatch drivers, or exercise operational control over any trip, driver, or vehicle.</li>
          </ul>

          <h3 className="text-lg font-semibold mt-3">Platform Functionality</h3>
          <p className="text-sm text-muted-foreground">The Platform facilitates:</p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Carrier registration and verification,</li>
            <li>Driver documentation exchange,</li>
            <li>Digital compliance scorecards,</li>
            <li>Trip lease agreement generation, and</li>
            <li>Third-party payment processing integrations.</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            All contracts, agreements, and driver leases arranged through the Platform are between you and other users.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">3. Eligibility</h2>
          <p className="text-sm text-muted-foreground">You must:</p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Be at least 18 years old (or the age of majority in your state).</li>
            <li>Hold any required insurance, licenses, permits, or authority to operate in your role (e.g., valid CDL, FMCSA authority if applicable).</li>
            <li>Provide accurate registration information and maintain updated records.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">4. User Responsibilities</h2>
          <p className="text-sm text-muted-foreground">Each Carrier must:</p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Provide truthful information in profiles, postings, and communications.</li>
            <li>Maintain an active USDOT and/or Master Carrier number in good standing with the FMCSA.</li>
            <li>Comply with all applicable FMCSA, DOT, OSHA, and state transportation regulations.</li>
            <li>Maintain up-to-date driver qualification files and insurance documentation.</li>
            <li>Maintain required insurance and safety certifications.</li>
            <li>Ensure all data submitted through the Platform is true and accurate.</li>
            <li>Refrain from using the Platform for illegal or non-compliant purposes.</li>
            <li>Fulfill commitments made through the Platform or promptly cancel if necessary.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">5. Non-Circumvention</h2>
          <p className="text-sm text-muted-foreground">
            Any drivers, carriers, or owner-operators introduced through the Platform may not be engaged directly 
            or indirectly for employment, leasing, or contracting outside of the Platform for a period of 12 months. 
            Circumvention to avoid fees is prohibited. Violators may be suspended or terminated.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">6. User Accounts</h2>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>You are responsible for safeguarding your account credentials.</li>
            <li>You may not share your account with another person or entity without our permission.</li>
            <li>You agree to notify us immediately if you suspect unauthorized account activity.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">7. Compliance Verification</h2>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>XtraFleet automates certain aspects of compliance validation, including document uploads, optical character recognition (OCR) checks, and FMCSA data synchronization.</li>
            <li>XtraFleet's system generates compliance scorecards for reference but does not certify compliance and shall not be liable for any inaccuracies posted.</li>
            <li>Carriers remain solely responsible for ensuring their drivers and vehicles meet all applicable standards.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">8. Payments & Fees</h2>
          
          <h3 className="text-lg font-semibold mt-3">Payments</h3>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>All payments between Fleet A and Fleet B are facilitated through our third-party payment processor.</li>
            <li>XtraFleet does not hold, control, or escrow funds.</li>
            <li>XtraFleet does not guarantee payment.</li>
            <li>Payment disputes are the responsibility of the parties involved.</li>
          </ul>

          <h3 className="text-lg font-semibold mt-3">Fees</h3>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Fees for subscriptions, matches, or premium services are disclosed at the time of purchase.</li>
            <li>Fees are collected through our third-party payment processor.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">9. Insurance Requirements</h2>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Each Carrier must maintain valid and active insurance meeting FMCSA minimums and state-level requirements.</li>
            <li>Fleet B must confirm coverage for any leased driver before trip activation (see Driver Lease Agreement).</li>
            <li>XtraFleet may provide access to third-party trip-based coverage options, but XtraFleet does not issue, underwrite, or guarantee insurance coverage.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">10. Liability and Indemnification</h2>
          <p className="text-sm text-muted-foreground">
            Each Carrier agrees to indemnify, defend, and hold harmless XtraFleet, its affiliates, employees, 
            and officers from any losses, liabilities, or claims arising from:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Vehicle operations,</li>
            <li>Driver conduct,</li>
            <li>Misrepresentation of compliance or insurance, or</li>
            <li>Violation of federal or state regulations.</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            XtraFleet assumes no liability for acts or omissions of any Carrier or Driver.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">11. Dispute Resolution</h2>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>This Agreement shall be governed by and construed under the laws of the State of Delaware.</li>
            <li>All disputes shall be resolved through binding arbitration conducted in Wilmington, Delaware, in accordance with the rules of the American Arbitration Association.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">12. Termination</h2>
          <p className="text-sm text-muted-foreground">We may suspend or terminate your account if:</p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>You violate these Terms.</li>
            <li>We suspect fraudulent or unlawful activity.</li>
            <li>Required by law or government order.</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            You may terminate your account at any time by contacting support.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">13. State Addenda</h2>
          
          <h3 className="text-lg font-semibold mt-3">Florida Addendum</h3>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Insurance: Must comply with Fla. Stat. § 627.7415 (motor carrier minimum coverage).</li>
            <li>Workers' Compensation: Required under Fla. Stat. § 440.02 for any leased driver.</li>
            <li>Record Retention: Trip lease documents must be stored for at least 12 months.</li>
          </ul>

          <h3 className="text-lg font-semibold mt-3">Massachusetts Addendum</h3>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Insurance: Must meet 540 CMR 6.02 coverage levels.</li>
            <li>Workers' Compensation: Mandatory for all leased drivers; no contractor exemption.</li>
            <li>Tax Reporting: Depending on Fleet B's payment method, a 1099 or W-2 must be issued.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">14. Changes to Terms</h2>
          <p className="text-sm text-muted-foreground">
            We may update these Terms from time to time. Changes take effect upon posting to our website or app. 
            Continued use after changes means you accept the new Terms.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">15. Contact Information</h2>
          <p className="text-sm text-muted-foreground">
            XtraFleet Technologies Inc.<br />
            Email: support@xtrafleet.com
          </p>
        </section>
      </div>
    </div>
  );
}
