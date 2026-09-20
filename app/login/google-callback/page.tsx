"use client";

import { useEffect } from "react";

const ID_KEY = "tv.google-id-token";
const ERR_KEY = "tv.google-oauth-error";
const PENDING_KEY = "tv.google-oidc";

export default function GoogleCallbackPage() {
  useEffect(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const params = new URLSearchParams(hash);
    if (!params.get("id_token") && !params.get("error")) {
      const query = new URLSearchParams(window.location.search);
      for (const [key, value] of query) params.set(key, value);
    }
    try {
      const idToken = params.get("id_token");
      const error = params.get("error");
      if (idToken) {
        sessionStorage.setItem(ID_KEY, idToken);
        sessionStorage.setItem(PENDING_KEY, "1");
      }
      if (error) sessionStorage.setItem(ERR_KEY, error);
    } catch {
      /* ignore */
    }
    window.location.replace("/");
  }, []);

  return <p className="p-6 text-sm text-muted">Signing in…</p>;
}
