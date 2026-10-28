import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service · TobyVerse",
  description: "Terms for using TobyVerse to work with your materials, conversations, and AI tools.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" effective="October 19, 2026">
      <p>
        These Terms apply when you use TobyVerse at tobyverse.ge and related features. By using
        TobyVerse, you agree to these Terms and the{" "}
        <a href="/privacy">Privacy Policy</a>. If you do not agree, do not use the service.
      </p>

      <h2>What TobyVerse does</h2>
      <p>
        TobyVerse is an AI workspace for learning and everyday work. You can chat about your
        materials, organize sources, create simple notes and study materials, and ask AI to help
        draft, explain, compare, plan, or solve. Features and model availability may change during
        the beta. Current usage and storage limits are shown in the app and may depend on your plan.
      </p>

      <h2>Eligibility and your account</h2>
      <p>
        You must be at least 13 to use TobyVerse. If you are not yet an adult where you live, use
        the service only with a parent or guardian&apos;s permission and supervision where required
        by law. Sign-in is provided through Google or Apple when available. Keep your account secure
        and tell us if you believe someone else has accessed it. You are responsible for activity
        under your account.
      </p>

      <h2>Your materials and instructions</h2>
      <p>
        You keep your rights to prompts, conversations, photographs, documents, notes, and other
        content you provide. You give TobyVerse permission to host, reproduce, transform, extract
        text from, and display that content only as reasonably needed to operate the features you
        use, respond to your requests, maintain security, and comply with law. This permission
        includes processing through the AI and infrastructure providers described in the{" "}
        <a href="/privacy">Privacy Policy</a>. It ends when the content is deleted, except for
        limited copies retained for legal, security, or provider-backup purposes.
      </p>
      <p>
        You are responsible for having permission to upload, process, and share each item. Before
        sending confidential or highly sensitive information to an AI feature, read the provider
        handling described in the <a href="/privacy">Privacy Policy</a> and make sure you are
        authorized to share it. Respect other people&apos;s privacy and copyright rights; do not use
        TobyVerse to violate them.
      </p>

      <h2>AI responses and generated items</h2>
      <p>
        TobyVerse uses Anthropic Claude to generate text responses and Google Gemini 3.1 Flash Lite
        to understand images. AI can misunderstand your request, alter wording you meant to
        preserve, produce incorrect or incomplete material, or generate content similar to
        content provided to other users. You should check important names,
        numbers, quotations, edits, calculations, and source references before relying on or sending
        an output. When asking for a narrow edit, review the result against your original.
      </p>
      <p>
        AI output is assistance, not a guarantee of accuracy or professional advice. Do not rely on
        it as the sole basis for legal, medical, financial, employment, safety, academic grading,
        or other consequential decisions. You are responsible for deciding whether an output is
        appropriate for your use and for reviewing it before publication or submission.
      </p>

      <h2>Sharing</h2>
      <p>
        A public share link makes the selected conversation and included materials or generated
        items viewable by anyone with that link. You are responsible for what you choose to share
        and for giving recipients access only to content they may see. You can turn off the link in
        TobyVerse, but this cannot remove copies another person already made.
      </p>

      <h2>Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Break applicable law, infringe rights, or upload material you are not authorized to use.</li>
        <li>Attempt to access another person&apos;s account, project, files, or private data.</li>
        <li>Use the service to distribute malware, interfere with its operation, or evade security.</li>
        <li>Bypass plan, rate, or storage limits, or misuse the AI or its providers.</li>
        <li>Use outputs or uploaded content in a way that violates academic, workplace, or other rules that apply to you.</li>
      </ul>

      <h2>Plans, limits, and availability</h2>
      <p>
        TobyVerse is in beta. Features, available models, usage budgets, storage limits, and plan
        terms may change. The limits and any price shown in the app when you use a feature are the
        ones that apply to that use. A feature may be unavailable, interrupted, or retired. We will
        give notice or obtain consent for a material change where applicable law requires it.
        There is no paid subscription unless a paid plan is explicitly offered to you in the app.
      </p>

      <h2>Privacy, Memory, and deletion</h2>
      <p>
        The <a href="/privacy">Privacy Policy</a> describes how content is processed by TobyVerse
        Anthropic Claude and Google Gemini, how photos and documents are stored after processing,
        and how automatic Memory works. Use Account Settings to export the available account summary or delete your
        account. You can also delete individual content in the app. Deletion may not remove copies
        already shared or limited provider logs and backups; details are in the Privacy Policy.
      </p>

      <h2>Our service and intellectual property</h2>
      <p>
        TobyVerse, its software, name, and interface are protected by applicable intellectual
        property laws. These Terms do not transfer ownership of TobyVerse to you. We give you a
        limited, personal, revocable right to use the service as these Terms allow. You may not
        copy, resell, reverse engineer, or use TobyVerse branding without permission, except where
        applicable law permits it.
      </p>

      <h2>Suspension and ending use</h2>
      <p>
        You can stop using TobyVerse and delete your account at any time through Account Settings.
        We may restrict or suspend access when reasonably necessary to address a breach of these
        Terms, security or abuse risks, legal requirements, or material disruption. Where
        practical and legally permitted, we will explain the reason and provide a way to contact
        us. Sections that by their nature need to continue, including content rights already
        granted, disclaimers, and liability limits, continue after access ends.
      </p>

      <h2>Disclaimers and liability</h2>
      <p>
        To the extent permitted by law, TobyVerse is provided “as is” and “as available.” We do not
        promise that it will be uninterrupted, error-free, secure in every circumstance, or that an
        AI response will meet your requirements. Nothing in these Terms excludes a consumer right,
        warranty, or liability that cannot legally be excluded. To the extent permitted by law,
        TobyVerse will not be responsible for indirect or consequential losses arising from use of
        the service. These limits do not apply where the law does not allow them.
      </p>

      <h2>Changes to these Terms</h2>
      <p>
        We may update these Terms as TobyVerse changes. The revised date will appear above. If a
        change materially affects your rights, we will provide notice or obtain your agreement
        where required by law. Continued use after an update takes effect means you accept the
        updated Terms only to the extent that is permitted by applicable law.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms can be sent to{" "}
        <a href="mailto:hello.tobyverse@gmail.com">hello.tobyverse@gmail.com</a>.
      </p>
    </LegalPage>
  );
}
