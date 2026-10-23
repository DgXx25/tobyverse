import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Refund Policy · TobyVerse",
  description: "How to cancel a TobyVerse plan and request a refund.",
};

export default function RefundsPage() {
  return (
    <LegalPage title="Refund Policy" effective="October 20, 2026">
      <p>
        This policy explains how cancellations and refund requests work for paid TobyVerse plans.
        It applies to purchases made directly from TobyVerse. If you purchased through another
        provider, that provider&apos;s refund process may also apply.
      </p>

      <h2>Cancel a plan</h2>
      <p>
        To cancel, email{" "}
        <a href="mailto:hello.tobyverse@gmail.com?subject=Cancel%20TobyVerse%20subscription">hello.tobyverse@gmail.com</a>{" "}
        from the address on your account before the next renewal. Cancellation stops future
        renewals. Unless the checkout terms say otherwise, paid access remains available until the
        end of the current billing period; cancelling does not by itself refund a payment that has
        already been made.
      </p>

      <h2>Request a refund</h2>
      <p>
        To ask us to review a payment, email{" "}
        <a href="mailto:hello.tobyverse@gmail.com?subject=TobyVerse%20refund%20request">hello.tobyverse@gmail.com</a>{" "}
        from the address on your account. Include the plan name, payment date, and a short
        description of the issue. Do not send your full card number or password.
      </p>
      <p>
        We review requests individually, taking into account the circumstances, the time since
        purchase, and any use of the paid plan. If approved, a refund is sent to the original
        payment method. The time it takes to appear depends on your payment provider.
      </p>

      <h2>Billing errors</h2>
      <p>
        Contact us if you believe you were charged twice, charged the wrong amount, or billed after
        a cancellation. We will check the transaction and correct confirmed billing errors.
      </p>

      <h2>Your legal rights</h2>
      <p>
        This policy does not limit any cancellation, withdrawal, refund, or other consumer rights
        that apply to you under local law. Where the law gives you a right that differs from this
        policy, the law applies.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about a payment or refund request? Email{" "}
        <a href="mailto:hello.tobyverse@gmail.com">hello.tobyverse@gmail.com</a>.
      </p>
    </LegalPage>
  );
}
