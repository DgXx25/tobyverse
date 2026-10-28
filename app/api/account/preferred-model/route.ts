import { FieldValue } from "firebase-admin/firestore";
import { assertAccountRequest } from "@/lib/api/assert";
import { isAllowedModelSelection, isKnownModelSelection, parsePreferredModel } from "@/lib/ai/catalog";
import { getAdminFirestore } from "@/lib/server/firestore-admin";
import { readAccountAccess } from "@/lib/billing/account-server";
import { billingErrorResponse } from "@/lib/billing/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await assertAccountRequest(request);
    const [access, profile] = await Promise.all([
      readAccountAccess(session.uid),
      getAdminFirestore().collection("users").doc(session.uid).get(),
    ]);
    const saved = parsePreferredModel(profile.data()?.preferredModel);
    const model = saved && isAllowedModelSelection(saved, access.plan) ? saved : "auto";
    return Response.json({ model, plan: access.plan }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return billingErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await assertAccountRequest(request);
    const body = await request.json().catch(() => null) as { model?: unknown } | null;
    const model = typeof body?.model === "string" ? body.model : "";
    if (!isKnownModelSelection(model)) {
      return Response.json({ error: "That model is not available." }, { status: 400 });
    }

    // Resolve access before writing. Admin is a server-resolved entitlement and can use all models.
    const access = await readAccountAccess(session.uid);
    if (!isAllowedModelSelection(model, access.plan)) {
      return Response.json({ error: "That model is not included in your plan." }, { status: 403 });
    }

    await getAdminFirestore().collection("users").doc(session.uid).set({
      preferredModel: model,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return Response.json({ ok: true, model });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
