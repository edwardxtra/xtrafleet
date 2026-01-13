export default function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      
      <div className="prose prose-sm max-w-none space-y-6">
        <p className="text-muted-foreground mb-6">
          Last Updated: January 13, 2026
        </p>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">1. Introduction</h2>
          <p className="text-sm text-muted-foreground">
            XtraFleet ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains 
            how we collect, use, disclose, and safeguard your information when you use our platform.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">2. Information We Collect</h2>
          
          <h3 className="text-lg font-semibold mt-3">2.1 Information You Provide</h3>
          <p className="text-sm text-muted-foreground">We collect information you provide directly, including:</p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li><strong>Account Information:</strong> Name, email address, phone number, company name, DOT number</li>
            <li><strong>Profile Information:</strong> Business details, preferences, company logo</li>
            <li><strong>Driver Information:</strong> Driver names, CDL numbers, license expiry dates, medical certificates</li>
            <li><strong>Vehicle Information:</strong> Vehicle type, VIN, registration, insurance details</li>
            <li><strong>Load Information:</strong> Origin, destination, cargo details, rates</li>
            <li><strong>Documents:</strong> Uploaded files including licenses, certificates, and insurance documents</li>
            <li><strong>Communications:</strong> Messages sent through our platform</li>
          </ul>

          <h3 className="text-lg font-semibold mt-3">2.2 Automatically Collected Information</h3>
          <p className="text-sm text-muted-foreground">When you use our platform, we automatically collect:</p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li><strong>Device Information:</strong> IP address, browser type, operating system, device identifiers</li>
            <li><strong>Usage Data:</strong> Pages viewed, time spent, clicks, features used</li>
            <li><strong>Location Data:</strong> General location derived from IP address</li>
            <li><strong>Authentication Data:</strong> Login timestamps, authentication tokens</li>
          </ul>

          <h3 className="text-lg font-semibold mt-3">2.3 Electronic Signature Data</h3>
          <p className="text-sm text-muted-foreground">When you sign documents electronically, we collect:</p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Your typed name</li>
            <li>Date and time of signature</li>
            <li>IP address from which you signed</li>
            <li>Browser and device information</li>
            <li>Consent acknowledgments</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">3. How We Use Your Information</h2>
          <p className="text-sm text-muted-foreground">We use your information to:</p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Provide and maintain the XtraFleet platform</li>
            <li>Match Load Owners with Driver Owners</li>
            <li>Generate and manage Trip Lease Agreements</li>
            <li>Facilitate communication between users</li>
            <li>Track document expiration dates and send compliance reminders</li>
            <li>Process payments and maintain financial records</li>
            <li>Send transactional emails and notifications</li>
            <li>Improve and personalize your experience</li>
            <li>Analyze usage patterns and platform performance</li>
            <li>Detect and prevent fraud or security issues</li>
            <li>Comply with legal obligations</li>
            <li>Enforce our Terms and Conditions</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">4. How We Share Your Information</h2>
          
          <h3 className="text-lg font-semibold mt-3">4.1 With Other Users</h3>
          <p className="text-sm text-muted-foreground">
            When you create a match or sign a TLA, certain information is shared with the other party, including:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Company name and contact information</li>
            <li>Driver details (for Driver Owners)</li>
            <li>Load details (for Load Owners)</li>
            <li>Communication messages</li>
          </ul>

          <h3 className="text-lg font-semibold mt-3">4.2 With Service Providers</h3>
          <p className="text-sm text-muted-foreground">
            We share information with third-party service providers who perform services on our behalf:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li><strong>Firebase/Google Cloud:</strong> Hosting, database, authentication, file storage</li>
            <li><strong>Email Services:</strong> Transactional email delivery</li>
            <li><strong>Payment Processors:</strong> Payment processing (when applicable)</li>
            <li><strong>Analytics Providers:</strong> Usage analytics and platform improvements</li>
          </ul>

          <h3 className="text-lg font-semibold mt-3">4.3 For Legal Reasons</h3>
          <p className="text-sm text-muted-foreground">We may disclose your information if required to:</p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Comply with legal obligations or court orders</li>
            <li>Respond to government requests</li>
            <li>Enforce our Terms and Conditions</li>
            <li>Protect our rights, property, or safety</li>
            <li>Prevent fraud or security threats</li>
          </ul>

          <h3 className="text-lg font-semibold mt-3">4.4 Business Transfers</h3>
          <p className="text-sm text-muted-foreground">
            If XtraFleet is involved in a merger, acquisition, or sale of assets, your information may be transferred 
            as part of that transaction.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">5. Data Security</h2>
          <p className="text-sm text-muted-foreground">
            We implement appropriate technical and organizational measures to protect your information, including:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Encryption of data in transit and at rest</li>
            <li>Secure authentication using Firebase Authentication</li>
            <li>Regular security audits and updates</li>
            <li>Access controls and monitoring</li>
            <li>Firestore security rules to protect user data</li>
          </ul>
          <p className="text-sm text-muted-foreground mt-2">
            However, no method of transmission over the internet is 100% secure. While we strive to protect your 
            information, we cannot guarantee absolute security.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">6. Data Retention</h2>
          <p className="text-sm text-muted-foreground">
            We retain your information for as long as necessary to:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Provide our services</li>
            <li>Comply with legal obligations (e.g., DOT record-keeping requirements)</li>
            <li>Resolve disputes and enforce agreements</li>
            <li>Maintain audit trails for signed agreements</li>
          </ul>
          <p className="text-sm text-muted-foreground mt-2">
            Trip Lease Agreements and related signature data are retained indefinitely for legal compliance purposes.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">7. Your Rights and Choices</h2>
          
          <h3 className="text-lg font-semibold mt-3">7.1 Access and Update</h3>
          <p className="text-sm text-muted-foreground">
            You can access and update your account information through your profile settings at any time.
          </p>

          <h3 className="text-lg font-semibold mt-3">7.2 Account Deletion</h3>
          <p className="text-sm text-muted-foreground">
            You may request deletion of your account by contacting support@xtrafleet.com. Note that:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Signed agreements and audit trails will be retained for legal compliance</li>
            <li>Some information may be retained in backup systems</li>
            <li>Deletion may not be possible while you have active TLAs or disputes</li>
          </ul>

          <h3 className="text-lg font-semibold mt-3">7.3 Communications</h3>
          <p className="text-sm text-muted-foreground">
            You may opt out of promotional emails, but you cannot opt out of transactional emails related to your 
            account or platform usage.
          </p>

          <h3 className="text-lg font-semibold mt-3">7.4 State-Specific Rights</h3>
          <p className="text-sm text-muted-foreground">
            Depending on your location, you may have additional rights under state privacy laws (e.g., CCPA, GDPR). 
            Contact us to exercise these rights.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">8. Cookies and Tracking</h2>
          <p className="text-sm text-muted-foreground">
            We use cookies and similar technologies to:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
            <li>Maintain your session and authentication</li>
            <li>Remember your preferences</li>
            <li>Analyze usage and improve the platform</li>
            <li>Provide security features</li>
          </ul>
          <p className="text-sm text-muted-foreground mt-2">
            You can control cookies through your browser settings, but disabling cookies may limit platform functionality.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">9. Children's Privacy</h2>
          <p className="text-sm text-muted-foreground">
            XtraFleet is not intended for use by individuals under 18 years of age. We do not knowingly collect 
            information from children. If we become aware that we have collected information from a child, we will 
            delete it promptly.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">10. Third-Party Links</h2>
          <p className="text-sm text-muted-foreground">
            Our platform may contain links to third-party websites or services. We are not responsible for the privacy 
            practices of these third parties. We encourage you to review their privacy policies.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">11. International Data Transfers</h2>
          <p className="text-sm text-muted-foreground">
            Your information may be transferred to and processed in countries other than your own. By using XtraFleet, 
            you consent to such transfers. We ensure appropriate safeguards are in place for international data transfers.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">12. Changes to This Privacy Policy</h2>
          <p className="text-sm text-muted-foreground">
            We may update this Privacy Policy from time to time. We will notify you of material changes via email or 
            platform notice. The "Last Updated" date at the top indicates when changes were last made.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">13. Contact Us</h2>
          <p className="text-sm text-muted-foreground">
            For questions about this Privacy Policy or to exercise your privacy rights, contact us at:
          </p>
          <div className="text-sm text-muted-foreground pl-4">
            <p>XtraFleet</p>
            <p>Email: support@xtrafleet.com</p>
            <p>Privacy Inquiries: privacy@xtrafleet.com</p>
          </div>
        </section>

        <div className="mt-8 p-4 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-lg">
          <p className="text-sm font-medium mb-2">⚠️ Important Legal Notice:</p>
          <p className="text-sm text-muted-foreground">
            This Privacy Policy is provided as a template and has not been reviewed by legal counsel. XtraFleet 
            strongly recommends consulting with a privacy attorney to ensure compliance with applicable privacy laws, 
            including state-specific regulations (CCPA, GDPR, etc.) and industry-specific requirements for 
            transportation and logistics.
          </p>
        </div>
      </div>
    </div>
  );
}