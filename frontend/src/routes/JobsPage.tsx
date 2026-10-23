import { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider, type User } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFirebaseAuth } from "../auth/firebase";
import { createJobClient, JobApiError, type ConnectionState, type GenerationJob } from "../jobs/job-client";

const LAST_JOB_KEY = "tobyverse.background-job.last";
const cursorKey = (jobId: string) => `tobyverse.background-job.${jobId}.cursor`;
const activeStatuses = new Set(["queued", "running"]);

function messageFor(error: unknown) {
  if (error instanceof JobApiError) return error.message;
  return error instanceof Error ? error.message : "The request could not be completed.";
}

export function Component() {
  const auth = useMemo(() => getFirebaseAuth(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [liveText, setLiveText] = useState("");
  const [connection, setConnection] = useState<{ state: ConnectionState; message?: string }>({ state: "closed" });
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reconnectEpoch, setReconnectEpoch] = useState(0);
  const selectedIdRef = useRef("");
  const activeLoadRef = useRef<Promise<void> | null>(null);
  const selected = jobs.find((job) => job.id === selectedId);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  const client = useMemo(() => createJobClient({
    getIdToken: async () => {
      const currentUser = auth?.currentUser;
      if (!currentUser) throw new JobApiError("auth_required", "Sign in to use background generation.", 401);
      return currentUser.getIdToken();
    },
  }), [auth]);

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      setAuthMessage("Firebase is not configured. Add the NEXT_PUBLIC_FIREBASE_* values to the project root .env.local file.");
      return;
    }
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      setAuthMessage("");
      setErrorMessage("");
    }, (error) => {
      setAuthReady(true);
      setAuthMessage(error.message || "Could not restore your sign-in session.");
    });
  }, [auth]);

  const refreshJobs = useCallback(async () => {
    if (!auth?.currentUser) return;
    if (activeLoadRef.current) return activeLoadRef.current;
    const load = async () => {
      setErrorMessage("");
      try {
        const active = await client.active();
        const savedId = localStorage.getItem(LAST_JOB_KEY) ?? "";
        const restore = savedId && !active.some((job) => job.id === savedId)
          ? await client.status(savedId).catch(() => undefined)
          : undefined;
        const restoredJobs = restore?.status === "succeeded" || restore?.status === "failed" || restore?.status === "cancelled"
          ? [restore, ...active]
          : active;
        setJobs(restoredJobs);
        const nextSelected = restoredJobs.find((job) => job.id === selectedIdRef.current)?.id
          ?? restoredJobs[0]?.id
          ?? "";
        setSelectedId(nextSelected);
        if (nextSelected) localStorage.setItem(LAST_JOB_KEY, nextSelected);
      } catch (error) {
        setErrorMessage(messageFor(error));
      }
    };
    const inFlight = load();
    activeLoadRef.current = inFlight;
    void inFlight.finally(() => {
      if (activeLoadRef.current === inFlight) activeLoadRef.current = null;
    });
    return inFlight;
  }, [auth, client]);

  useEffect(() => {
    if (!user) {
      setJobs([]);
      setSelectedId("");
      return;
    }
    void refreshJobs();
  }, [user, refreshJobs]);

  useEffect(() => {
    if (!selected || !activeStatuses.has(selected.status)) {
      setConnection({ state: "closed" });
      return;
    }
    const controller = new AbortController();
    let latestText = "";
    const initialCursor = Number(localStorage.getItem(cursorKey(selected.id)) ?? 0) || 0;
    setLiveText("");
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      void client.events(selected.id, initialCursor, controller.signal, (event) => {
        localStorage.setItem(cursorKey(selected.id), String(event.id));
        if (event.type === "running") {
          setJobs((current) => current.map((item) => item.id === selected.id ? { ...item, status: "running" } : item));
        }
        if (event.type === "delta" && event.data && typeof event.data === "object" && "delta" in event.data && typeof event.data.delta === "string") {
          latestText += event.data.delta;
          setLiveText(latestText);
        }
        if (["succeeded", "failed", "cancelled"].includes(event.type)) {
          const status = event.type as GenerationJob["status"];
          const eventFailure = event.data && typeof event.data === "object"
            ? event.data as { code?: unknown; retryable?: unknown }
            : undefined;
          setJobs((current) => current.map((item) => item.id === selected.id ? {
            ...item,
            status,
            ...(status === "failed" ? {
              error: {
                code: typeof eventFailure?.code === "string" ? eventFailure.code : "generation_failed",
                message: "Generation failed. Loading the full error details…",
                retryable: eventFailure?.retryable === true,
              },
            } : {}),
          } : item));
          void client.status(selected.id).then((job) => {
            setJobs((current) => current.map((item) => item.id === job.id ? job : item));
            if (job.status === "succeeded") setLiveText(job.result?.text ?? latestText);
          }).catch((error) => setErrorMessage(`The job finished, but its final result could not be loaded: ${messageFor(error)}`));
        }
      }, (state, message) => setConnection({ state, message }));
    });
    return () => { mounted = false; controller.abort(); };
  }, [client, selected?.id, selected?.status, reconnectEpoch]);

  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt.trim()) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const created = await client.start({ prompt: prompt.trim() }, crypto.randomUUID());
      localStorage.setItem(LAST_JOB_KEY, created.jobId);
      localStorage.setItem(cursorKey(created.jobId), "0");
      setPrompt("");
      setLiveText("");
      setSelectedId(created.jobId);
      await refreshJobs();
      const job = await client.status(created.jobId);
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      setSelectedId(job.id);
    } catch (error) {
      setErrorMessage(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!selected) return;
    setBusy(true);
    setErrorMessage("");
    try {
      await client.cancel(selected.id);
      const job = await client.status(selected.id);
      setJobs((current) => current.map((item) => item.id === job.id ? job : item));
    } catch (error) {
      setErrorMessage(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    if (!selected) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const created = await client.retry(selected.id);
      localStorage.setItem(LAST_JOB_KEY, created.jobId);
      localStorage.setItem(cursorKey(created.jobId), "0");
      const job = await client.status(created.jobId);
      setJobs((current) => [job, ...current]);
      setSelectedId(job.id);
      setLiveText("");
    } catch (error) {
      setErrorMessage(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    if (!auth) return;
    setAuthMessage("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      setAuthMessage(messageFor(error));
    }
  }

  return (
    <section className="jobs-page">
      <div className="welcome-card jobs-card">
        <p className="eyebrow">Background work</p>
        <h1>Generation jobs</h1>
        <p>Start a response and leave this page. The backend keeps working and saves the result for when you return.</p>
        <div className="account-row">
          {!authReady ? <span className="status">Restoring sign-in…</span> : user ? (
            <>
              <span className="status">Signed in as {user.displayName || user.email || "your account"}</span>
              <button className="quiet-button" onClick={() => auth && void signOut(auth)}>Sign out</button>
            </>
          ) : <button className="primary-link" disabled={!auth} onClick={() => void signIn()}>Continue with Google</button>}
        </div>
        {authMessage && <p className="error-note" role="alert">{authMessage}</p>}
        {errorMessage && <p className="error-note" role="alert">{errorMessage}</p>}
        {user && (
          <form className="job-form" onSubmit={start}>
            <label htmlFor="job-prompt">What would you like to understand?</label>
            <textarea id="job-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask Tobyverse a question…" rows={4} />
            <button className="primary-link" disabled={busy || !prompt.trim()}>{busy ? "Working…" : "Start background response"}</button>
          </form>
        )}
      </div>

      {user && <section className="job-list" aria-label="Your generation jobs">
        <div className="job-list-heading">
          <h2>Your jobs</h2>
          <button className="quiet-button" onClick={() => void refreshJobs()}>Refresh</button>
        </div>
        {!jobs.length ? <p className="status">No recent jobs. New and active jobs will appear here.</p> : jobs.map((job) => (
          <button key={job.id} className={`job-row ${job.id === selectedId ? "selected" : ""}`} onClick={() => setSelectedId(job.id)}>
            <span>{job.result?.text?.slice(0, 70) || job.error?.message || `${job.kind} generation`}</span>
            <strong className={`job-state state-${job.status}`}>{job.status}</strong>
          </button>
        ))}
      </section>}

      {selected && <section className="job-detail" aria-live="polite">
        <div className="job-list-heading">
          <div><p className="eyebrow">Job status</p><h2>{selected.status === "running" ? "Generating your response" : selected.status[0].toUpperCase() + selected.status.slice(1)}</h2></div>
          {activeStatuses.has(selected.status) && <button className="quiet-button" disabled={busy} onClick={() => void cancel()}>Stop job</button>}
          {selected.status === "failed" && selected.error?.retryable && <button className="primary-link" disabled={busy} onClick={() => void retry()}>Retry job</button>}
        </div>
        {activeStatuses.has(selected.status) && <p className={`connection connection-${connection.state}`}>
          {connection.state === "connected" ? "Connected to live updates" : connection.state === "reconnecting" ? "Connection interrupted. Reconnecting…" : connection.state === "paused" ? `Updates paused: ${connection.message ?? "Connection could not be restored."}` : connection.state === "connecting" ? "Connecting to saved job…" : "Job continues on the server."}
          {connection.state === "paused" && <button className="inline-button" onClick={() => setReconnectEpoch((value) => value + 1)}>Reconnect</button>}
        </p>}
        {selected.status === "failed" && <p className="error-note" role="alert">{selected.error?.message ?? "Generation failed."}{selected.error?.retryable ? " You can retry this job." : ""}</p>}
        {selected.status === "cancelled" && <p className="status">This job was stopped.</p>}
        {(selected.result?.text || liveText) && <pre className="job-output">{selected.result?.text ?? liveText}</pre>}
      </section>}
    </section>
  );
}
