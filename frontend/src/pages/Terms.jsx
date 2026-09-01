import React from 'react';
import PolicyPage, { Section } from './PolicyPage.jsx';

export default function Terms() {
  return (
    <PolicyPage title="Terms of Service" updated="September 1, 2026">
      <Section h="1. Acceptance">
        <p>
          By creating an account or using Waguan you agree to these Terms. If you do not agree, do not use the service.
          We may update these Terms; continued use after an update means you accept the new version.
        </p>
      </Section>

      <Section h="2. The service">
        <p>
          Waguan provides end-to-end encrypted messaging, media sharing, and voice/video calls between registered users.
          Free features may change; abusive or automated use may be rate-limited.
        </p>
      </Section>

      <Section h="3. Eligibility">
        <p>
          You must be at least 13 years old (or the minimum age set by your local law), and you must provide a phone number
          that is your own and an accurate name.
        </p>
      </Section>

      <Section h="4. Your account">
        <p>
          You are responsible for keeping your account credentials and devices secure. Do not share your session, lend your
          account, or use someone else's phone number. You are responsible for everything done from your account.
        </p>
      </Section>

      <Section h="5. Acceptable use — what you must not do">
        <ul className="list-disc pl-5 space-y-1">
          <li>Send spam, unsolicited mass messages, or automated/scraping traffic.</li>
          <li>Harass, threaten, or bully others; or share content that is illegal, defamatory, or infringes rights.</li>
          <li>Impersonate people, run scams or phishing, or spread malware.</li>
          <li>Share child sexual abuse material or other illegal content. We co-operate with law enforcement.</li>
          <li>Attempt to break, reverse-engineer, or bypass the encryption, rate limits, or security of the service.</li>
          <li>Interfere with other users' devices, accounts, or the infrastructure of the service.</li>
        </ul>
      </Section>

      <Section h="6. Content">
        <p>
          You keep all rights to what you send and share. You grant us the limited permission needed to store and deliver it
          (see the Privacy Policy). Because messages are end-to-end encrypted, we cannot see or moderate their content — but
          we can and will act on reports and on abuse visible in account behaviour.
        </p>
      </Section>

      <Section h="7. Enforcement">
        <p>
          We may warn, suspend, or permanently terminate accounts that violate these Terms, and may report serious illegal
          activity to authorities. Calls and messages to someone who blocked you will not be delivered.
        </p>
      </Section>

      <Section h="8. Termination">
        <p>
          You can stop using Waguan at any time. To delete your account and associated data, contact us at
          <span className="text-accentDark dark:text-accent"> privacy@example.com</span>; we will action deletion within 30 days.
        </p>
      </Section>

      <Section h="9. Disclaimers">
        <p>
          The service is provided "as is" and "as available". We do not guarantee that the service will be uninterrupted,
          error-free, or that messages or calls will always be delivered on time.
        </p>
      </Section>

      <Section h="10. Limitation of liability">
        <p>
          To the maximum extent permitted by law, Waguan is not liable for indirect or consequential losses, lost data, or
          lost profit arising from use of the service.
        </p>
      </Section>

      <Section h="11. Governing law">
        <p>
          These Terms are governed by the laws applicable where Waguan is registered. Nothing in these Terms affects
          rights you cannot waive by law.
        </p>
      </Section>

      <Section h="12. Contact">
        <p>
          Questions about these Terms or the Service — email <span className="text-accentDark dark:text-accent">privacy@example.com</span>.
        </p>
      </Section>
    </PolicyPage>
  );
}