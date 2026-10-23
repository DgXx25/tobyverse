import assert from "node:assert/strict";
import test from "node:test";
import { FirestoreJobStore, JobNotFoundError } from "./firestore-store.js";
import { ActiveJobLimitError, MAX_ACTIVE_JOBS_PER_USER } from "./limits.js";
import type { JobPayloadStorage } from "./payload-storage.js";

type FakeData = Record<string, unknown>;

class FakeSnapshot {
  constructor(readonly id: string, private readonly value?: FakeData, readonly ref?: FakeRef) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
  get(field: string) { return this.value?.[field]; }
}

class FakeRef {
  constructor(readonly db: FakeFirestore, readonly path: string, readonly id: string) {}
  async get() { return new FakeSnapshot(this.id, this.db.data.get(this.path), this); }
  async delete() { this.db.data.delete(this.path); }
  collection(name: string) { return new FakeCollection(this.db, `${this.path}/${name}`); }
}

class FakeCollection {
  constructor(private readonly db: FakeFirestore, private readonly name: string) {}
  doc(id?: string) {
    const key = id ?? `auto-${++this.db.nextId}`;
    return new FakeRef(this.db, `${this.name}/${key}`, key);
  }
  async get() { return new FakeQuery(this.db, this.name).get(); }
  where(field: string, operator: string, value: unknown) {
    return new FakeQuery(this.db, this.name).where(field, operator, value);
  }
  limit(count: number) { return new FakeQuery(this.db, this.name).limit(count); }
  orderBy(field: string, direction: "asc" | "desc" = "asc") {
    return new FakeQuery(this.db, this.name).orderBy(field, direction);
  }
}

class FakeQuery {
  private readonly filters: Array<{ field: string; operator: string; value: unknown }> = [];
  private sortField?: string;
  private sortDirection: "asc" | "desc" = "asc";
  private count = Number.POSITIVE_INFINITY;
  constructor(private readonly db: FakeFirestore, private readonly name: string) {}
  where(field: string, operator: string, value: unknown) {
    this.filters.push({ field, operator, value });
    return this;
  }
  orderBy(field: string, direction: "asc" | "desc" = "asc") {
    this.sortField = field;
    this.sortDirection = direction;
    return this;
  }
  limit(count: number) {
    this.count = count;
    return this;
  }
  async get() {
    const prefix = `${this.name}/`;
    let rows = [...this.db.data.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
      .filter(([, data]) => this.filters.every(({ field, operator, value }) => {
        const actual = data[field];
        if (operator === "==") return actual === value;
        if (operator === "in") return Array.isArray(value) && value.includes(actual);
        if (operator === "<=") {
          const left = actual instanceof Date ? actual.getTime() : actual;
          const right = value instanceof Date ? value.getTime() : value;
          return typeof left === "number" && typeof right === "number" && left <= right;
        }
        if (operator === ">") return typeof actual === "number" && typeof value === "number" && actual > value;
        return false;
      }));
    if (this.sortField) {
      rows = rows.sort(([leftPath, left], [rightPath, right]) => {
        const a = left[this.sortField!];
        const b = right[this.sortField!];
        const result = typeof a === "number" && typeof b === "number" ? a - b : 0;
        return this.sortDirection === "asc" ? result : -result;
      });
    }
    const docs = rows.slice(0, this.count).map(([path, value]) => {
      const id = path.slice(prefix.length);
      return new FakeSnapshot(id, value, new FakeRef(this.db, path, id));
    });
    return { docs, empty: docs.length === 0 };
  }
}

class FakeTransaction {
  private readonly writes: Array<{ path: string; value: FakeData }> = [];
  constructor(private readonly db: FakeFirestore) {}
  async get(ref: FakeRef) { return new FakeSnapshot(ref.id, this.db.data.get(ref.path), ref); }
  set(ref: FakeRef, value: FakeData) { this.writes.push({ path: ref.path, value }); }
  update(ref: FakeRef, value: FakeData) {
    this.writes.push({ path: ref.path, value: { ...(this.db.data.get(ref.path) ?? {}), ...value } });
  }
  commit() {
    for (const write of this.writes) this.db.data.set(write.path, structuredClone(write.value));
  }
}

class FakeFirestore {
  readonly data = new Map<string, FakeData>();
  nextId = 0;
  private transactionTail = Promise.resolve();
  collection(name: string) { return new FakeCollection(this, name); }
  batch() {
    const refs: FakeRef[] = [];
    return {
      delete(ref: FakeRef) { refs.push(ref); },
      async commit() { for (const ref of refs) await ref.delete(); },
    };
  }
  async getAll(...refs: FakeRef[]) {
    return refs.map((ref) => new FakeSnapshot(ref.id, this.data.get(ref.path), ref));
  }

  async runTransaction<T>(work: (transaction: FakeTransaction) => Promise<T>) {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const transaction = new FakeTransaction(this);
    try {
      const result = await work(transaction);
      transaction.commit();
      return result;
    } finally {
      release();
    }
  }
}

function memoryStorage() {
  const objects = new Map<string, string>();
  const storage: JobPayloadStorage = {
    async saveJson(path, value) { objects.set(path, JSON.stringify(value)); },
    async readJson(path) { return JSON.parse(objects.get(path) ?? "null") as unknown; },
    async delete(path) { objects.delete(path); },
  };
  return { storage, objects };
}

function makeStore(db = new FakeFirestore(), storage = memoryStorage(), getNow = () => 1_000) {
  return {
    db,
    storage,
    store: new FirestoreJobStore({
      db: db as never,
      storage: storage.storage,
      now: getNow,
    }),
  };
}

function createInput(uid: string, idempotencyKey: string) {
  return { uid, kind: "chat" as const, idempotencyKey, payload: { prompt: "Explain photosynthesis." } };
}

test("concurrent job creation cannot exceed three active jobs for one user", async () => {
  const { store, db } = makeStore();
  const starts = await Promise.allSettled(
    Array.from({ length: MAX_ACTIVE_JOBS_PER_USER + 1 }, (_, index) =>
      store.createJob(createInput("user-1", `request-${index}`)),
    ),
  );

  assert.equal(starts.filter((result) => result.status === "fulfilled").length, 3);
  const rejected = starts.find((result) => result.status === "rejected");
  assert.ok(rejected && rejected.status === "rejected");
  assert.ok(rejected.reason instanceof ActiveJobLimitError);
  assert.equal([...db.data.keys()].filter((key) => key.startsWith("generationJobs/")).length, 3);
  assert.equal(db.data.get("generationJobLimits/user-1")?.activeJobCount, 3);
});

test("the same owner and idempotency key return the original job", async () => {
  const { store, db } = makeStore();
  const input = createInput("user-1", "same-request-123");
  const first = await store.createJob(input);
  const second = await store.createJob(input);

  assert.equal(first.id, second.id);
  assert.equal(db.data.get("generationJobLimits/user-1")?.activeJobCount, 1);
});

test("an oversized job input is persisted in Storage, not the Firestore job document", async () => {
  const { store, db, storage } = makeStore();
  const input = {
    ...createInput("user-1", "large-request-123"),
    payload: { prompt: "x".repeat(300 * 1024) },
  };
  const job = await store.createJob(input);
  const document = db.data.get(`generationJobs/${job.id}`);

  assert.equal(document?.input, undefined);
  assert.equal(document?.inputRef, `users/user-1/generation-jobs/${job.id}/input.json`);
  assert.ok(storage.objects.has(document?.inputRef as string));
});

test("active limits are isolated by authenticated user", async () => {
  const { store, db } = makeStore();
  await Promise.all([
    ...Array.from({ length: 3 }, (_, index) => store.createJob(createInput("user-1", `first-0${index}`))),
    ...Array.from({ length: 3 }, (_, index) => store.createJob(createInput("user-2", `second-0${index}`))),
  ]);

  assert.equal(db.data.get("generationJobLimits/user-1")?.activeJobCount, 3);
  assert.equal(db.data.get("generationJobLimits/user-2")?.activeJobCount, 3);
});

test("job reads and active lists are restricted to the owner", async () => {
  const { store } = makeStore();
  const job = await store.createJob(createInput("user-1", "owner-read-123"));

  assert.equal((await store.getJob("user-1", job.id)).id, job.id);
  await assert.rejects(store.getJob("user-2", job.id), JobNotFoundError);
  assert.deepEqual((await store.listActiveJobs("user-1")).map(({ id }) => id), [job.id]);
  assert.deepEqual(await store.listActiveJobs("user-2"), []);
});

test("queued cancellation is terminal and releases the active slot exactly once", async () => {
  const { store, db } = makeStore();
  const job = await store.createJob(createInput("user-1", "cancel-job-123"));

  const cancelled = await store.requestCancellation("user-1", job.id);
  const repeated = await store.requestCancellation("user-1", job.id);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(repeated.status, "cancelled");
  assert.deepEqual(db.data.get("generationJobLimits/user-1")?.activeJobIds, []);
  assert.equal(db.data.get("generationJobLimits/user-1")?.activeJobCount, 0);
});

test("job event sequence increments while appending a bounded event", async () => {
  const { store, db } = makeStore();
  const job = await store.createJob(createInput("user-1", "append-event-123"));

  const event = await store.appendJobEvent(job.id, { type: "progress", data: { message: "Preparing" } });
  assert.equal(event.sequence, 1);
  assert.equal((await store.getJob("user-1", job.id)).eventSequence, 1);
  assert.deepEqual(db.data.get(`generationJobs/${job.id}/events/000000000001`), event);
});

test("a job claim emits a live running event and is reclaimed only after its lease expires", async () => {
  let now = 1_000;
  const { store, db } = makeStore(new FakeFirestore(), memoryStorage(), () => now);
  const job = await store.createJob(createInput("user-1", "claim-job-123"));

  const first = await store.claimNextJob("worker-a");
  assert.equal(first?.id, job.id);
  assert.equal(first?.attempt, 1);
  assert.equal(first?.eventSequence, 1);
  assert.deepEqual(db.data.get(`generationJobs/${job.id}/events/000000000001`), {
    sequence: 1,
    at: now,
    type: "running",
    data: { attempt: 1 },
  });
  assert.equal(await store.claimNextJob("worker-b"), null);

  now = 122_000;
  const recovered = await store.claimNextJob("worker-b");
  assert.equal(recovered?.id, job.id);
  assert.equal(recovered?.attempt, 2);
  assert.equal(recovered?.eventSequence, 2);
  assert.notEqual(recovered?.attemptId, first?.attemptId);
});

test("a successful terminal transition releases the active job slot once", async () => {
  const { store, db } = makeStore();
  const job = await store.createJob(createInput("user-1", "finish-job-123"));
  const claimed = await store.claimNextJob("worker-a");
  assert.ok(claimed?.attemptId);

  assert.equal(await store.finishJob(job.id, claimed!.attemptId!, { text: "Done" }), true);
  assert.equal(await store.finishJob(job.id, claimed!.attemptId!, { text: "Duplicate" }), false);
  assert.equal((await store.getJob("user-1", job.id)).status, "succeeded");
  assert.equal(db.data.get("generationJobLimits/user-1")?.activeJobCount, 0);
});

test("an oversized result is stored outside Firestore, can be read, and is deleted at retention expiry", async () => {
  let now = 1_000;
  const { store, db, storage } = makeStore(new FakeFirestore(), memoryStorage(), () => now);
  const job = await store.createJob(createInput("user-large-result", "large-result-123"));
  const claimed = await store.claimNextJob("worker-a");
  assert.ok(claimed?.attemptId);
  const result = { text: "y".repeat(300 * 1024) };

  assert.equal(await store.finishJob(job.id, claimed!.attemptId!, result), true);
  const document = db.data.get(`generationJobs/${job.id}`);
  const resultPath = `users/${job.uid}/generation-jobs/${job.id}/result.json`;
  assert.equal(document?.result, undefined);
  assert.equal(document?.resultRef, resultPath);
  assert.deepEqual(await store.readResult(job.uid, job.id), result);

  now += 31 * 24 * 60 * 60 * 1_000;
  assert.equal(await store.cleanupExpiredJobs(), 1);
  assert.equal(storage.objects.has(resultPath), false);
});

test("expired terminal jobs delete their events, private payloads, and idempotency mappings", async () => {
  let now = 1_000;
  const { store, db, storage } = makeStore(new FakeFirestore(), memoryStorage(), () => now);
  const input = {
    ...createInput("user-cleanup", "cleanup-job-123"),
    payload: { prompt: "x".repeat(300 * 1024) },
  };
  const job = await store.createJob(input);
  await store.appendJobEvent(job.id, { type: "delta", data: { delta: "hello" } });
  await store.requestCancellation(job.uid, job.id);
  const payloadPath = `users/${job.uid}/generation-jobs/${job.id}/input.json`;
  assert.equal(storage.objects.has(payloadPath), true);

  now += 31 * 24 * 60 * 60 * 1_000;
  const removed = await store.cleanupExpiredJobs();

  assert.equal(removed, 1);
  assert.equal(db.data.has(`generationJobs/${job.id}`), false);
  assert.equal(db.data.has(`generationJobs/${job.id}/events/000000000001`), false);
  assert.equal(db.data.has(`generationJobs/${job.id}/events/000000000002`), false);
  assert.equal(db.data.has(`generationJobRequests/${job.idempotencyHash}`), false);
  assert.equal(storage.objects.has(payloadPath), false);
});

test("a running cancel request becomes terminal when its worker acknowledges it", async () => {
  const { store, db } = makeStore();
  const job = await store.createJob(createInput("user-1", "cancel-running-123"));
  const claimed = await store.claimNextJob("worker-a");
  assert.ok(claimed?.attemptId);

  const requested = await store.requestCancellation("user-1", job.id);
  assert.equal(requested.status, "running");
  assert.equal(requested.cancelRequested, true);
  assert.equal(await store.markCancelled(job.id, claimed!.attemptId!), true);
  assert.equal((await store.getJob("user-1", job.id)).status, "cancelled");
  assert.equal(db.data.get("generationJobLimits/user-1")?.activeJobCount, 0);
});

test("events can be replayed after the client's last sequence without crossing owners", async () => {
  const { store } = makeStore();
  const job = await store.createJob(createInput("user-1", "event-cursor-123"));
  await store.appendJobEvent(job.id, { type: "delta", data: { text: "A" } });
  await store.appendJobEvent(job.id, { type: "delta", data: { text: "B" } });

  const events = await store.getEvents("user-1", job.id, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].sequence, 2);
  await assert.rejects(store.getEvents("user-2", job.id, 0), JobNotFoundError);
});
