import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy · TobyVerse",
  description: "How TobyVerse handles account information, conversations, files, and Memory.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" effective="October 19, 2026">
      <p>
        This policy explains what TobyVerse collects, why it is used, where it may be processed,
        and how you can manage or delete it. It applies to TobyVerse at tobyverse.ge and its related
        features.
      </p>

      <h2>Who is responsible</h2>
      <p>
        TobyVerse operates this service and is responsible for the information described here.
        For privacy questions or requests, email{" "}
        <a href="mailto:hello@tobyverse.app">hello@tobyverse.app</a>. Please do not send passwords,
        identity numbers, or other sensitive details in your request.
      </p>

      <h2>Information TobyVerse handles</h2>
      <ul>
        <li>
          <strong>Account and sign-in details:</strong> your Firebase user identifier and, when
          provided by Google or Apple, your name, email address, and profile image. The sign-in
          provider handles its own sign-in data under its privacy terms.
        </li>
        <li>
          <strong>What you put into TobyVerse:</strong> prompts, conversation history, project names
          and settings, uploaded materials, extracted text, notes, generated study or work items,
          feedback, and files you choose to share. Material text and images can contain personal
          information about you or other people.
        </li>
        <li>
          <strong>Usage and account settings:</strong> model-token usage, chat and generation
          counters, storage size, plan status, selected model and chat mode, theme, and other
          preferences needed to provide the service and enforce its limits.
        </li>
        <li>
          <strong>Memory and adaptation:</strong> preferences you ask TobyVerse to remember, and
          concise patterns about how you communicate, learn, or work. During ordinary signed-in
          conversations, TobyVerse may analyze a bounded sample of recent turns to update these
          notes and project-topic connections. This background process is limited in frequency;
          it stores the resulting notes, not a separate transcript of the sample. It is intended to
          make replies more useful, not to make decisions with legal or similarly significant
          effects about you.
        </li>
        <li>
          <strong>Technical and security information:</strong> authentication/session identifiers,
          request status, upload size and content type, timestamps, and infrastructure logs that
          may include IP address and browser/device details. We use these to operate, troubleshoot,
          and protect the service. We do not use a third-party
          advertising or cross-site analytics service in the current app.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>We use information to:</p>
      <ul>
        <li>Sign you in, maintain your account, and keep your projects and conversations available.</li>
        <li>Read and index materials, answer requests, create notes and other items you ask for.</li>
        <li>Apply your saved preferences and, where relevant, adapt replies to recurring patterns.</li>
        <li>Measure service usage, apply plan limits, prevent abuse, debug failures, and secure TobyVerse.</li>
        <li>Respond to support, legal, and data-rights requests.</li>
      </ul>

      <h2>AI processing, including an important Google setting</h2>
      <p>
        TobyVerse currently sends requests to Google&apos;s Gemini API. Depending on your request,
        that may include your prompt, relevant conversation context, selected project text, and an
        image or other material needed to answer. The model may also receive TobyVerse instructions
        and relevant saved preferences. Google processes these inputs under its Gemini API terms.
      </p>
      <p>
        Google&apos;s terms distinguish paid and unpaid Gemini API usage. For unpaid quota, Google
        says it may use submitted content and generated responses to improve its products and that
        human reviewers may process them. For paid API usage through a Cloud project with active
        billing, Google says it does not use prompts or responses to improve its products and
        processes them under its data-processing terms. The billing mode for TobyVerse&apos;s Google
        API project is not shown in the app. Until the project&apos;s billing configuration is verified,
        treat anything sent to TobyVerse AI as potentially subject to Google&apos;s unpaid-service
        data practices. Do not submit confidential, highly sensitive, or third-party information
        unless you have the right to do so and accept that processing.
      </p>
      <p>
        Read{" "}
        <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">
          Google&apos;s Gemini API terms
        </a>{" "}
        and its linked privacy and data-processing terms for the details that apply to the request.
        TobyVerse does not currently route requests to Grok or OpenAI models.
      </p>

      <h2>Uploads, OCR, and storage</h2>
      <ul>
        <li>
          <strong>Photos:</strong> TobyVerse compresses and re-encodes supported photos before
          storing them. It keeps the compressed image and an extracted-text file for OCR results;
          that text file can be empty when no text is readable. A photo may be sent to Gemini when
          needed for text extraction or when you ask a question that needs visual analysis.
        </li>
        <li>
          <strong>Other documents:</strong> the original file is used for processing and is normally
          removed from material storage after its extracted text has been successfully saved.
          Extracted text remains attached to the material so TobyVerse can search it and answer
          questions. If processing fails, the uploaded file may remain temporarily so processing
          can be retried or the material can be removed.
        </li>
        <li>
          <strong>Deletion:</strong> deleting a material or project removes its active records and
          associated stored objects through the app&apos;s deletion flow. Provider logs, security
          records, or backups may retain limited copies for the time their systems require or the
          law permits. Do not treat deletion as a way to revoke copies someone has already
          downloaded from a shared link.
        </li>
      </ul>

      <h2>Memory and your controls</h2>
      <p>
        Memory is part of normal signed-in use. It can include response instructions you shared,
        useful communication or work preferences, and cautious observations based on conversation
        patterns (up to 14 recent turns per sample, with no more than one observation every 90
        seconds or 12 in a UTC day for an account). Saved preferences and observations are used
        only when relevant, and your current request takes priority. TobyVerse filters recognizable
        sensitive information before Memory updates, but these filters are not perfect and cannot
        guarantee that every sensitive detail will be detected. You can review and remove saved
        entries in Account Settings. Clearing them does
        not prevent future conversations from producing new, relevant Memory entries. A request
        not to remember something, or a confidential marker, is excluded from Memory processing;
        it can still remain in the chat or project where you sent it until you delete that content.
      </p>

      <h2>Sharing</h2>
      <p>
        If you create a public share link, the conversation and the materials or generated items
        selected for that share can be viewed by anyone who has the link. Do not share content you
        want to keep private. You can turn off a link in the app; people may still have copied or
        downloaded content while it was available.
      </p>

      <h2>Service providers and international processing</h2>
      <p>
        TobyVerse shares information with Google services for sign-in, hosting, database and file
        storage, and Gemini AI processing. Each service is governed by its applicable provider
        terms, including the different Gemini API handling described above. Infrastructure and
        model processing may occur in the United States or other countries where Google operates.
        The protections for an international transfer depend on the service and the terms that
        apply to it. We do not sell personal
        information or use it for targeted advertising.
      </p>

      <h2>Cookies and device storage</h2>
      <p>
        TobyVerse uses the browser storage required for sign-in/session handling, theme and display
        preferences, and limited scheduling or interface state. Google sign-in and hosting may also
        use their own essential cookies or similar technologies. You can manage browser storage in
        your browser; removing it may sign you out or reset preferences.
      </p>

      <h2>How long we keep information</h2>
      <p>
        We keep account, project, chat, Memory, and retained material data while your account and
        content remain active, or as needed to provide the feature you chose. Usage counters follow
        the plan periods shown in the app. We remove active account and project data when you delete
        it or delete your account, subject to legal obligations and limited provider log or backup
        retention. Temporary upload files are kept only as needed to complete or retry processing.
      </p>

      <h2>Your choices and rights</h2>
      <p>
        Account Settings lets you export a limited JSON summary of profile, plan, usage, Memory,
        and project metadata, and request account deletion. You can also delete individual chats,
        projects, materials, and Memory entries in the app. For access, correction, deletion,
        restriction, portability, objection, or other rights available under the law that applies
        to you, email{" "}
        <a href="mailto:hello@tobyverse.app">hello@tobyverse.app</a>. We may ask for enough
        information to verify that the request is yours. You may also complain to the competent
        data-protection authority.
      </p>

      <h2>Children</h2>
      <p>
        TobyVerse is not designed for children under 13, and they may not create an account or use
        the service. If you believe a child under 13 has provided personal information, contact us
        so we can review and remove it. A parent or guardian should supervise use by anyone who is
        not yet an adult where local law requires it.
      </p>

      <h2>Security and changes</h2>
      <p>
        We use access controls and service-provider security features to protect information, but
        no internet service can promise absolute security. We will update this page when our data
        practices materially change and revise the date above. If a change requires notice or
        consent, we will provide it as required by law.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy requests or questions, contact{" "}
        <a href="mailto:hello@tobyverse.app">hello@tobyverse.app</a>.
      </p>
    </LegalPage>
  );
}
