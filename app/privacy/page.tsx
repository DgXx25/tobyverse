import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy · TobyVerse",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" effective="September 8, 2026">
      <p>
        This Privacy Policy explains how TobyVerse collects, uses, and shares information when you
        use our website, apps, and related services.
      </p>
      <p>
        We design TobyVerse as a study partner. We collect only what we need to run the product,
        keep it secure, and improve how it helps you learn.
      </p>

      <h2>Information we collect</h2>
      <p>Depending on how you use TobyVerse, we may collect:</p>
      <ul>
        <li>
          <strong>Account information.</strong> If you sign in with Google or Apple, we receive
          your name, email address, and profile image as provided by that service.
        </li>
        <li>
          <strong>Content you provide.</strong> Prompts, chats, files, notes, and other materials
          you upload or generate while using the product.
        </li>
        <li>
          <strong>Usage data.</strong> Basic product analytics such as feature use, device type,
          and approximate location derived from IP address.
        </li>
        <li>
          <strong>Technical data.</strong> Logs needed to operate, debug, and protect the service.
        </li>
      </ul>

      <h2>How we use information</h2>
      <p>We use information to:</p>
      <ul>
        <li>Provide, maintain, and improve TobyVerse</li>
        <li>Generate study materials, answers, and related features you request</li>
        <li>Authenticate you and keep your account secure</li>
        <li>Understand how the product is used and fix problems</li>
        <li>Communicate about the service when needed</li>
      </ul>

      <h2>AI processing</h2>
      <p>
        Prompts, files, and related context may be sent to our model providers so TobyVerse can
        generate responses. We use this information to fulfill your request and to operate the
        product. Do not submit information you are not comfortable sharing with a study tool.
      </p>

      <h2>How we share information</h2>
      <p>
        We do not sell your personal information. We share information with service providers that
        help us run TobyVerse, such as authentication, hosting, storage, and model inference, and
        only as needed to provide the service or comply with law.
      </p>

      <h2>Retention</h2>
      <p>
        We keep account and project data while your account is active. You can delete chats,
        projects, and other content from the product. If you delete your account, we remove
        associated data except where we must keep it for security or legal reasons.
      </p>

      <h2>Your choices</h2>
      <p>
        You can access or delete much of your data from your account. You can also sign out or
        stop using the service at any time. If you signed in with Google or Apple, you can manage
        those connections in that provider&apos;s settings.
      </p>

      <h2>Children</h2>
      <p>
        TobyVerse is not directed at children under 13, and we do not knowingly collect personal
        information from children under 13.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this policy from time to time. We will post the updated version on this page
        and change the effective date.
      </p>

      <h2>Contact</h2>
      <p>
        If you have questions about this policy, contact us at{" "}
        <a href="mailto:hello@tobyverse.app">hello@tobyverse.app</a>.
      </p>
    </LegalPage>
  );
}
