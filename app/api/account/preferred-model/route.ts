import { FieldValue } from "firebase-admin/firestore";
import { assertAccountRequest } from "@/lib/api/assert";
import { DEFAULT_AI_EFFORT, isAiEffort, isAllowedModelSelection, isKnownModelSelection, parsePreferredModel } from "@/lib/ai/catalog";
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
    const data = profile.data();
    const saved = parsePreferredModel(data?.preferredModel);
    const model = saved && isAllowedModelSelection(saved, access.plan) ? saved : "auto";
    const effort = isAiEffort(data?.preferredEffort) ? data.preferredEffort : DEFAULT_AI_EFFORT;
    return Response.json({ model, effort, plan: access.plan }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return billingErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await assertAccountRequest(request);
    const body = await request.json().catch(() => null) as { model?: unknown; effort?: unknown } | null;
    const model = typeof body?.model === "string" ? body.model : "";
    const effort = body?.effort === undefined ? undefined : body.effort;
    if (!isKnownModelSelection(model)) {
      return Response.json({ error: "That model is not available." }, { status: 400 });
    }
    if (effort !== undefined && !isAiEffort(effort)) {
      return Response.json({ error: "That effort level is not available." }, { status: 400 });
    }

    // Resolve access before writing. Admin is a server-resolved entitlement and can use all models.
    const access = await readAccountAccess(session.uid);
    if (!isAllowedModelSelection(model, access.plan)) {
      return Response.json({ error: "That model is not included in your plan." }, { status: 403 });
    }

    await getAdminFirestore().collection("users").doc(session.uid).set({
      preferredModel: model,
      ...(effort ? { preferredEffort: effort } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return Response.json({ ok: true, model, effort: effort ?? DEFAULT_AI_EFFORT });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
