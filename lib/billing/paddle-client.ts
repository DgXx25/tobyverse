"use client";

type PaddleSdk = {
  Environment: { set(environment: "sandbox"): void };
  Initialize(options: { token: string; eventCallback?: (event: PaddleEvent) => void }): void;
  Checkout: { open(options: { transactionId: string; settings: { showAddDiscounts: boolean } }): void; close(): void };
};
type PaddleWindow = Window & { Paddle?: PaddleSdk };
type CheckoutInput = { transactionId: string; clientToken: string; environment: "sandbox" | "production" };
type PaddleEvent = { name: string; data?: { transaction_id?: string } };

const SCRIPT_URL = "https://cdn.paddle.com/paddle/v2/paddle.js";
let sdkPromise: Promise<PaddleSdk> | null = null;
let initialized: { environment: CheckoutInput["environment"]; clientToken: string } | null = null;
let checkoutCompleted: ((event: PaddleEvent) => void) | null = null;

function loadPaddle(): Promise<PaddleSdk> {
  if (typeof window === "undefined") return Promise.reject(new Error("Paddle checkout requires a browser."));
  if ((window as PaddleWindow).Paddle) return Promise.resolve((window as PaddleWindow).Paddle!);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<PaddleSdk>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    const timeout = window.setTimeout(() => fail(), 20000);
    const cleanup = () => { window.clearTimeout(timeout); script.onload = null; script.onerror = null; };
    const fail = () => { cleanup(); script.remove(); reject(new Error("Paddle checkout could not be loaded.")); };
    script.onload = () => {
      const sdk = (window as PaddleWindow).Paddle;
      if (!sdk?.Initialize || !sdk?.Checkout?.open || !sdk?.Environment?.set) { fail(); return; }
      cleanup(); resolve(sdk);
    };
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch((error: unknown) => { sdkPromise = null; throw error; });
  return sdkPromise;
}

/** Opens a server-created transaction. Completion in the browser never grants plan access. */
export async function openPaddleCheckout(input: CheckoutInput, onCompleted?: (event: PaddleEvent) => void): Promise<void> {
  const sdk = await initializePaddleCheckout(input, onCompleted);
  // Keep Paddle's discount-code field visible so customers can apply an offer
  // during the hosted checkout (required for the zero-cost live verification).
  sdk.Checkout.open({ transactionId: input.transactionId, settings: { showAddDiscounts: true } });
}

/** Initializes Paddle.js on the default payment-link page, which receives `_ptxn`. */
export async function initializePaddleCheckout(input: Omit<CheckoutInput, "transactionId">, onCompleted?: (event: PaddleEvent) => void): Promise<PaddleSdk> {
  if (input.environment !== "sandbox" && input.environment !== "production") throw new Error("Unsupported Paddle environment.");
  const prefix = input.environment === "sandbox" ? "test" : "live";
  if (!new RegExp(`^${prefix}_[a-zA-Z\\d_-]+$`).test(input.clientToken)) throw new Error("Invalid Paddle checkout configuration.");
  const sdk = await loadPaddle();
  checkoutCompleted = onCompleted ?? null;
  if (initialized && (initialized.environment !== input.environment || initialized.clientToken !== input.clientToken)) throw new Error("Paddle checkout configuration changed. Reload the page.");
  if (!initialized) {
    if (input.environment === "sandbox") sdk.Environment.set("sandbox");
    sdk.Initialize({ token: input.clientToken, eventCallback: (event) => {
      if (event.name === "checkout.completed") checkoutCompleted?.(event);
    } });
    initialized = { environment: input.environment, clientToken: input.clientToken };
  }
  return sdk;
}

export function closePaddleCheckout(): void {
  (window as PaddleWindow).Paddle?.Checkout.close();
}
