import { LegalShell } from '@/components/Legal/LegalShell';

const TermsOfService = () => (
  <LegalShell title="Terms and Conditions" updatedAt="July 13, 2026">
    <section className="jv-legal-section">
      <h2>Acceptance of these terms</h2>
      <p>By creating an account or using JointVibe, you agree to these Terms and Conditions. If you do not agree, do not use the service.</p>
    </section>

    <section className="jv-legal-section">
      <h2>Your account</h2>
      <p>You are responsible for keeping your account credentials confidential and for activity that occurs through your account. Provide accurate information and notify us promptly if you believe your account has been accessed without permission.</p>
    </section>

    <section className="jv-legal-section">
      <h2>Using JointVibe</h2>
      <p>Use the service lawfully and respectfully. Do not misuse the platform, disrupt access, impersonate others, submit misleading information, or use JointVibe to promote unlawful activity.</p>
    </section>

    <section className="jv-legal-section">
      <h2>Venue and advertiser accounts</h2>
      <p>Venue and advertiser account holders are responsible for the accuracy of their listings, campaigns, pricing, and communications. JointVibe may remove content that violates these terms or applicable law.</p>
    </section>

    <section className="jv-legal-section">
      <h2>Changes to the service</h2>
      <p>We may update, suspend, or discontinue features when reasonably necessary. We may also revise these terms and will post the updated version on this page.</p>
    </section>

    <section className="jv-legal-section">
      <h2>Contact</h2>
      <p>Questions about these terms can be sent to <a href="mailto:legal@jointvibe.example">legal@jointvibe.example</a>.</p>
    </section>
  </LegalShell>
);

export default TermsOfService;
