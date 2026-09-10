"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { useAuth } from "@/components/auth-provider";
import { reauthenticateCurrentUser } from "@/lib/auth";
import { deleteAccountData, exportAccountMetadata } from "@/lib/account/store";
import { writeSignedInCookie } from "@/lib/signed-in-cookie";

export function AccountDataControls() {
  const { user } = useAuth();
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onExport() {
    if (!user || exporting) return;
    setError(null);
    setExporting(true);
    try {
      const payload = await exportAccountMetadata(user.uid);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "tobyverse-account.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export account data.");
    } finally {
      setExporting(false);
    }
  }

  async function onDelete() {
    if (!user || deleting) return;
    setError(null);
    setDeleting(true);
    try {
      await reauthenticateCurrentUser(user);
      await deleteAccountData(user);
      writeSignedInCookie(false);
      await signOut(getFirebaseAuth()).catch(() => undefined);
      router.replace("/login");
    } catch (err) {
      const code = typeof err === "object" && err && "code" in err ? String((err as { code: string }).code) : "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        setDeleting(false);
        return;
      }
      if (code === "auth/requires-recent-login") {
        setError("Sign in again, then delete your account.");
      } else {
        setError(err instanceof Error ? err.message : "Could not delete account.");
      }
      setDeleting(false);
    }
  }

  return (
    <div className="divide-y divide-border">
      <div className="flex items-start justify-between gap-4 py-5">
        <div>
          <p className="text-[15px] font-medium text-foreground">Export account data</p>
          <p className="mt-1 text-[13px] leading-6 text-muted">
            Download a JSON file of your profile, plan, usage, memories, learning profile, and project metadata.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onExport()}
          disabled={exporting}
          className="shrink-0 rounded-full border border-border px-4 py-1.5 text-[13px] text-foreground hover:bg-surface-2 disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "Export"}
        </button>
      </div>

      <div className="py-5">
        <p className="text-[15px] font-medium text-foreground">Delete account</p>
        <p className="mt-1 text-[13px] leading-6 text-muted">
          Removes your chats, materials, notes, memories, learning profile, and account. This cannot be undone.
        </p>
        {error ? <p className="mt-2 text-[13px] text-red-400">{error}</p> : null}
        {confirmDelete ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="rounded-full border border-border px-4 py-1.5 text-[13px] text-foreground hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onDelete()}
              disabled={deleting}
              className="rounded-full border border-red-500/40 px-4 py-1.5 text-[13px] text-red-400 hover:bg-red-500/10 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Confirm delete"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="mt-4 rounded-full border border-border px-4 py-1.5 text-[13px] text-foreground hover:bg-surface-2"
          >
            Delete account
          </button>
        )}
      </div>
    </div>
  );
}
