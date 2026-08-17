import { LegalShell } from '@/components/Legal/LegalShell';

const PrivacyPolicy = () => (
  <LegalShell title="Privacy Policy" updatedAt="July 13, 2026">
    <section className="jv-legal-section">
      <h2>Information we collect</h2>
      <p>We collect information you provide when you create an account, contact us, or use JointVibe, including your name, email address, account type, and activity on the service.</p>
    </section>

    <section className="jv-legal-section">
      <h2>How we use information</h2>
      <p>We use information to operate and improve JointVibe, personalize relevant experiences, communicate with you, protect the service, and meet legal obligations.</p>
    </section>

    <section className="jv-legal-section">
      <h2>Information we share</h2>
      <p>We do not sell your personal information. We may share information with service providers that help us run JointVibe, when required by law, or as part of a business transfer.</p>
    </section>

    <section className="jv-legal-section">
      <h2>Your choices</h2>
      <ul>
        <li>Update account details through your account settings.</li>
        <li>Control promotional communications using the unsubscribe option provided in those messages.</li>
        <li>Request access, correction, or deletion of your personal information where applicable.</li>
      </ul>
    </section>

    <section className="jv-legal-section">
      <h2>Data security and retention</h2>
      <p>We use reasonable safeguards to protect personal information. We retain information only for as long as needed to provide the service, comply with law, and resolve disputes.</p>
    </section>

    <section className="jv-legal-section">
      <h2>Contact</h2>
      <p>For privacy questions or requests, contact <a href="mailto:privacy@jointvibe.example">privacy@jointvibe.example</a>.</p>
    </section>
  </LegalShell>
);

export default PrivacyPolicy;
