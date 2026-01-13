export default function TermsPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Terms and Conditions</h1>
      
      <div className="prose prose-sm max-w-none space-y-6">
        <p className="text-muted-foreground mb-6">
          Last Updated: January 13, 2026
        </p>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">1. Acceptance of Terms</h2>
          <p className="text-sm text-muted-foreground">
            By accessing and using XtraFleet ("the Platform"), you accept and agree to be bound by these Terms and Conditions. 
            If you do not agree to these terms, please do not use the Platform.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">2. Description of Service</h2>
          <p className="text-sm text-muted-foreground">
            XtraFleet is a digital platform that connects motor carriers ("Load Owners") with independent owner-operators 
            ("Driver Owners") for the purpose of facilitating transportation services. The Platform provides:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Matching services between Load Owners and Driver Owners</li>
            <li>Trip Lease Agreement (TLA) generation and electronic signature capabilities</li>
            <li>Document management and compliance tracking</li>
            <li>Communication tools between parties</li>
            <li>Load and driver management features</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">3. User Accounts</h2>
          <h3 className="text-lg font-semibold mt-3">3.1 Registration</h3>
          <p className="text-sm text-muted-foreground">
            To use certain features of the Platform, you must register for an account. You agree to:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Provide accurate, current, and complete information</li>
            <li>Maintain and promptly update your account information</li>
            <li>Maintain the security of your account credentials</li>
            <li>Notify us immediately of any unauthorized use of your account</li>
          </ul>

          <h3 className="text-lg font-semibold mt-3">3.2 Account Eligibility</h3>
          <p className="text-sm text-muted-foreground">
            You must be at least 18 years old and have the legal authority to enter into contracts to use the Platform. 
            Driver Owners must possess all necessary licenses, permits, and insurance required by federal, state, and local law.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">4. User Responsibilities</h2>
          <h3 className="text-lg font-semibold mt-3">4.1 Compliance with Laws</h3>
          <p className="text-sm text-muted-foreground">
            You agree to comply with all applicable federal, state, and local laws and regulations, including but not limited to:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Federal Motor Carrier Safety Regulations (FMCSRs)</li>
            <li>Department of Transportation (DOT) regulations</li>
            <li>Hours of Service (HOS) regulations</li>
            <li>Vehicle inspection and maintenance requirements</li>
            <li>Insurance and liability requirements</li>
          </ul>

          <h3 className="text-lg font-semibold mt-3">4.2 Documentation</h3>
          <p className="text-sm text-muted-foreground">
            Users are responsible for maintaining current and valid:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Commercial Driver's License (CDL)</li>
            <li>Medical certificates</li>
            <li>Vehicle registrations and inspections</li>
            <li>Insurance policies and certificates</li>
            <li>Any other required permits or certifications</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">5. Platform Usage</h2>
          <h3 className="text-lg font-semibold mt-3">5.1 Prohibited Activities</h3>
          <p className="text-sm text-muted-foreground">You agree NOT to:</p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Provide false or misleading information</li>
            <li>Impersonate another person or entity</li>
            <li>Attempt to gain unauthorized access to the Platform</li>
            <li>Use the Platform for any illegal purpose</li>
            <li>Interfere with or disrupt the Platform's operation</li>
            <li>Harvest or collect information about other users</li>
            <li>Use automated systems (bots) to access the Platform</li>
          </ul>

          <h3 className="text-lg font-semibold mt-3">5.2 Content Standards</h3>
          <p className="text-sm text-muted-foreground">
            All content you post or transmit through the Platform must be accurate, lawful, and not infringe on any 
            third-party rights. You retain ownership of your content but grant XtraFleet a license to use it for 
            Platform operations.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">6. Trip Lease Agreements</h2>
          <p className="text-sm text-muted-foreground">
            Trip Lease Agreements (TLAs) generated through the Platform are legally binding contracts between Load Owners 
            and Driver Owners. XtraFleet is not a party to these agreements and assumes no liability for the performance 
            or breach of TLAs.
          </p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Users are responsible for reviewing TLAs before signing</li>
            <li>Electronic signatures have the same legal effect as handwritten signatures</li>
            <li>Users must comply with all terms of executed TLAs</li>
            <li>Disputes regarding TLAs must be resolved between the parties</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">7. Fees and Payment</h2>
          <p className="text-sm text-muted-foreground">
            XtraFleet may charge fees for use of the Platform. Current fee structures are available on our pricing page. 
            You agree to pay all applicable fees. We reserve the right to change fees with 30 days' notice.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">8. Disclaimers and Limitation of Liability</h2>
          <h3 className="text-lg font-semibold mt-3">8.1 Platform "As Is"</h3>
          <p className="text-sm text-muted-foreground">
            THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. 
            XTRAFLEET DOES NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
          </p>

          <h3 className="text-lg font-semibold mt-3">8.2 User Verification</h3>
          <p className="text-sm text-muted-foreground">
            XtraFleet does not verify the accuracy of information provided by users. We do not conduct background checks, 
            verify licenses, or inspect vehicles. Users are responsible for their own due diligence.
          </p>

          <h3 className="text-lg font-semibold mt-3">8.3 Limitation of Liability</h3>
          <p className="text-sm text-muted-foreground">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, XTRAFLEET SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, 
            CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, OR BUSINESS OPPORTUNITIES.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">9. Indemnification</h2>
          <p className="text-sm text-muted-foreground">
            You agree to indemnify and hold harmless XtraFleet, its officers, directors, employees, and agents from any 
            claims, damages, losses, liabilities, and expenses (including attorneys' fees) arising from:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Your use of the Platform</li>
            <li>Your violation of these Terms</li>
            <li>Your violation of any law or regulation</li>
            <li>Your violation of any third-party rights</li>
            <li>Any transportation services arranged through the Platform</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">10. Insurance and Liability</h2>
          <p className="text-sm text-muted-foreground">
            Users are solely responsible for obtaining and maintaining appropriate insurance coverage for their operations. 
            XtraFleet does not provide insurance and is not responsible for any accidents, injuries, damages, or losses 
            arising from transportation services.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">11. Termination</h2>
          <p className="text-sm text-muted-foreground">
            We reserve the right to suspend or terminate your account at any time for:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Violation of these Terms</li>
            <li>Fraudulent or illegal activity</li>
            <li>Failure to maintain required licenses or insurance</li>
            <li>Any reason at our sole discretion</li>
          </ul>
          <p className="text-sm text-muted-foreground mt-2">
            You may terminate your account at any time by contacting us. Termination does not affect obligations under 
            existing TLAs.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">12. Dispute Resolution</h2>
          <h3 className="text-lg font-semibold mt-3">12.1 Informal Resolution</h3>
          <p className="text-sm text-muted-foreground">
            Before filing any formal claim, you agree to attempt to resolve disputes informally by contacting us at 
            support@xtrafleet.com.
          </p>

          <h3 className="text-lg font-semibold mt-3">12.2 Arbitration</h3>
          <p className="text-sm text-muted-foreground">
            Any disputes not resolved informally shall be resolved through binding arbitration in accordance with the 
            American Arbitration Association's Commercial Arbitration Rules.
          </p>

          <h3 className="text-lg font-semibold mt-3">12.3 Class Action Waiver</h3>
          <p className="text-sm text-muted-foreground">
            You agree to bring claims only in your individual capacity and not as part of any class or representative action.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">13. Modifications to Terms</h2>
          <p className="text-sm text-muted-foreground">
            We reserve the right to modify these Terms at any time. We will notify users of material changes via email 
            or Platform notice. Continued use of the Platform after changes constitutes acceptance of the modified Terms.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">14. Governing Law</h2>
          <p className="text-sm text-muted-foreground">
            These Terms shall be governed by and construed in accordance with the laws of the State of [Your State], 
            without regard to its conflict of law provisions.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">15. Severability</h2>
          <p className="text-sm text-muted-foreground">
            If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">16. Contact Information</h2>
          <p className="text-sm text-muted-foreground">
            For questions about these Terms, please contact us at:
          </p>
          <div className="text-sm text-muted-foreground pl-4">
            <p>XtraFleet</p>
            <p>Email: support@xtrafleet.com</p>
          </div>
        </section>

        <div className="mt-8 p-4 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-lg">
          <p className="text-sm font-medium mb-2">⚠️ Important Legal Notice:</p>
          <p className="text-sm text-muted-foreground">
            These Terms and Conditions are provided as a template and have not been reviewed by legal counsel. 
            XtraFleet strongly recommends that you consult with an attorney before relying on these terms for 
            your business operations. This is particularly important for trucking and transportation services 
            which have specific regulatory and liability considerations.
          </p>
        </div>
      </div>
    </div>
  );
}