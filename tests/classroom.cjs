const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ClassroomClient,
  normalizeWork,
  SCOPES,
  CONFIG_KEY,
  CACHE_KEY,
  safeLink,
} = require("../classroom.js");
const course = { id: "10", name: "Física", courseState: "ACTIVE" };
function harness() {
  const entries = new Map([["studyflow-v1", "PERSONAL DATA UNCHANGED"]]);
  const storage = {
    getItem: (k) => entries.get(k) || null,
    setItem: (k, v) => entries.set(k, v),
    removeItem: (k) => entries.delete(k),
  };
  let clock = Date.parse("2026-11-15T12:00:00Z"),
    callback,
    revoked = false,
    mode = "ok",
    courses = [course],
    works = [
      {
        id: "a",
        title: "Original",
        state: "PUBLISHED",
        dueDate: { year: 2026, month: 12, day: 25 },
        alternateLink: "https://classroom.google.com/c/10/a/a",
      },
      { id: "b", title: "Sin fecha", state: "PUBLISHED" },
    ];
  const calls = [];
  let pages = false,
    quota = 0;
  const google = {
    accounts: {
      oauth2: {
        initTokenClient: (config) => {
          callback = config.callback;
          return { requestAccessToken: () => {} };
        },
        hasGrantedAllScopes: (response, ...scopes) =>
          scopes.every((scope) =>
            (response.scope || "").split(/\s+/).includes(scope),
          ),
        revoke: (token, cb) => {
          revoked = token === "IN_MEMORY_TOKEN";
          cb({});
        },
      },
    },
  };
  const fetch = async (url, options) => {
    calls.push(url);
    assert.equal(options.headers.Authorization, "Bearer IN_MEMORY_TOKEN");
    assert.equal(options.credentials, "omit");
    if (url.includes("userinfo"))
      return Response.json({ sub: "account-1", email: "student@example.test" });
    if (mode === "401") return new Response("", { status: 401 });
    if (mode === "403") return new Response("", { status: 403 });
    if (mode === "network") throw Error("offline");
    if (mode === "quota" && quota++ < 2)
      return new Response("", { status: 429, headers: { "Retry-After": "1" } });
    if (mode === "broken-submissions" && url.includes("studentSubmissions"))
      return new Response("", { status: 500 });
    if (url.includes("studentSubmissions"))
      return Response.json({
        studentSubmissions: [{ courseWorkId: "a", state: "TURNED_IN" }],
      });
    const getId = new URL(url).pathname.match(/\/courseWork\/([^/]+)$/)?.[1];
    if (getId) {
      const work = works.find(
        (w) => String(w.id) === decodeURIComponent(getId),
      );
      return work ? Response.json(work) : new Response("", { status: 404 });
    }
    if (url.includes("courseWork")) return Response.json({ courseWork: works });
    if (pages && !url.includes("pageToken"))
      return Response.json({ courses, nextPageToken: "second" });
    return Response.json({ courses });
  };
  const client = new ClassroomClient({
    storage,
    fetch,
    now: () => clock,
    identity: async () => google,
    onchange: () => {},
    sleep: async () => {},
  });
  return {
    client,
    entries,
    calls,
    get revoked() {
      return revoked;
    },
    setMode: (m) => (mode = m),
    setWorks: (w) => (works = w),
    setCourses: (c) => (courses = c),
    setPages: () => (pages = true),
    advance: (ms) => (clock += ms),
    async connect() {
      client.saveConfig("test-client.apps.googleusercontent.com", "full");
      await new Promise((r) => setImmediate(r));
      client.connect();
      await callback({
        access_token: "IN_MEMORY_TOKEN",
        expires_in: 3600,
        scope: (mode === "partial"
          ? SCOPES.filter((_, i) => i !== 1)
          : SCOPES
        ).join(" "),
      });
    },
  };
}
test("official endpoints, pagination, duplicate IDs, unknown due dates, own submission state and isolated storage", async () => {
  const h = harness();
  try {
    h.setPages();
    await h.connect();
    assert.equal(h.client.status, "Conectado");
    assert.equal(h.client.cache.courses.length, 1);
    assert.equal(h.client.cache.tasks.length, 2);
    assert.equal(h.client.cache.tasks[0].done, true);
    assert.equal(h.client.cache.tasks[1].due, null);
    assert(h.calls.some((u) => u.includes("studentId=me")));
    assert(
      h.calls.some((u) =>
        u.includes("courseWork/-/studentSubmissions?userId=me"),
      ),
    );
    assert(h.calls.some((u) => u.includes("pageToken=second")));
    assert.equal(h.entries.get("studyflow-v1"), "PERSONAL DATA UNCHANGED");
    assert(![...h.entries.values()].join("").includes("IN_MEMORY_TOKEN"));
    const reloaded = new ClassroomClient({
      storage: { getItem: (k) => h.entries.get(k) },
      fetch: async () => {},
      onchange: () => {},
    });
    assert.equal(reloaded.status, "Desconectado");
    assert.equal(reloaded.cache.tasks.length, 2);
    h.advance(16000);
    h.setWorks([
      {
        id: "a",
        title: "Renombrada",
        state: "PUBLISHED",
        dueDate: { year: 2027, month: 1, day: 8 },
      },
    ]);
    assert.equal(await h.client.sync(), true);
    assert.equal(h.client.cache.tasks.length, 2);
    assert.equal(h.client.cache.tasks[0].name, "Renombrada");
    assert.equal(h.client.cache.tasks[0].due, "2027-01-08");
    assert.equal(h.client.cache.tasks[1].availability, "removed");
    h.advance(16000);
    h.setCourses([{ ...course, courseState: "ARCHIVED" }]);
    await h.client.sync();
    assert(h.client.cache.tasks.every((t) => t.availability === "archived"));
  } finally {
    await h.client.disconnect();
  }
  assert(h.revoked);
  assert.equal(h.entries.has(CACHE_KEY), false);
  assert.equal(h.entries.get("studyflow-v1"), "PERSONAL DATA UNCHANGED");
});
test("403 and partial failures preserve the complete previous snapshot and last successful date", async () => {
  const h = harness();
  try {
    await h.connect();
    const previous = JSON.stringify(h.client.cache);
    for (const mode of ["403", "network", "broken-submissions"]) {
      h.advance(16000);
      h.setMode(mode);
      assert.equal(await h.client.sync(), false);
      assert.equal(JSON.stringify(h.client.cache), previous);
      assert(h.client.error);
      assert.equal(h.entries.get("studyflow-v1"), "PERSONAL DATA UNCHANGED");
    }
  } finally {
    await h.client.disconnect();
  }
});
test("permission denial never shows connected; expired and revoked tokens require reconnect", async () => {
  const h = harness();
  try {
    h.setMode("partial");
    await h.connect();
    assert.equal(h.client.status, "Desconectado");
    assert.match(h.client.error, /Permisos insuficientes/);
    h.setMode("ok");
    await h.connect();
    h.advance(3600000);
    assert.equal(h.client.connected, false);
    assert.equal(await h.client.sync(), false);
    assert.match(h.client.error, /conectar/);
    await h.connect();
    h.advance(16000);
    h.setMode("401");
    assert.equal(await h.client.sync(), false);
    assert.equal(h.client.connected, false);
  } finally {
    await h.client.disconnect();
  }
});
test("bounded retries and repeated sync do not duplicate records", async () => {
  const h = harness();
  try {
    h.setMode("quota");
    await h.connect();
    assert.equal(h.client.cache.tasks.length, 2);
    const before = h.calls.length;
    assert.equal(await h.client.sync(), false);
    assert.equal(h.calls.length, before);
    h.advance(16000);
    h.setMode("ok");
    await Promise.all([h.client.sync(), h.client.sync()]);
    assert.equal(h.client.cache.tasks.length, 2);
  } finally {
    await h.client.disconnect();
  }
});
test("UTC delivery time, safe original links and no invented dates", () => {
  const t = normalizeWork(
    course,
    {
      id: "x",
      title: "UTC",
      dueDate: { year: 2027, month: 1, day: 1 },
      dueTime: { hours: 0, minutes: 30 },
      alternateLink: "javascript:alert(1)",
    },
    { state: "RECLAIMED_BY_STUDENT" },
  );
  assert.equal(t.dueAt, "2027-01-01T00:30:00.000Z");
  assert.equal(t.done, false);
  assert.equal(t.url, "");
  assert.equal(normalizeWork(course, { id: "none" }).due, null);
  assert.equal(safeLink("https://classroom.google.com.evil.test/"), "");
  assert.throws(() =>
    normalizeWork(course, {
      id: "bad",
      dueDate: { year: 2027, month: 2, day: 30 },
    }),
  );
});
test("disconnect during a request prevents stale results from restoring the cache", async () => {
  const h = harness();
  await h.connect();
  h.advance(16000);
  let release;
  h.client.fetch = () => new Promise((r) => (release = r));
  const operation = h.client.sync();
  await h.client.disconnect();
  release(Response.json({ courses: [course] }));
  assert.equal(await operation, false);
  assert.equal(h.client.cache.tasks.length, 0);
  assert.equal(h.entries.has(CACHE_KEY), false);
});
test("storage failures never advance the successful snapshot or modify personal records", async () => {
  const h = harness();
  try {
    await h.connect();
    const original = JSON.stringify(h.client.cache);
    h.advance(16000);
    h.client.storage.setItem = () => {
      throw Error("quota exceeded");
    };
    assert.equal(await h.client.sync(), false);
    assert.equal(JSON.stringify(h.client.cache), original);
    assert.match(h.client.error, /espacio del navegador/);
    assert.equal(h.entries.get("studyflow-v1"), "PERSONAL DATA UNCHANGED");
  } finally {
    await h.client.disconnect();
  }
});
test("invalid imported cache is preserved rather than overwritten or rendered", async () => {
  const entries = new Map([
    [
      CONFIG_KEY,
      JSON.stringify({
        clientId: "test.apps.googleusercontent.com",
        mapping: {},
        accessMode: "full",
      }),
    ],
    [CACHE_KEY, '{"tasks":[null],"courses":[]}'],
  ]);
  let calls = 0;
  const client = new ClassroomClient({
    storage: {
      getItem: (k) => entries.get(k),
      setItem: () => {
        throw Error("must not write");
      },
    },
    identity: async () => {
      calls++;
    },
    fetch: async () => {},
    onchange: () => {},
  });
  assert.equal(client.corrupt, true);
  assert.deepEqual(client.cache.tasks, []);
  await client.prepare();
  client.connect();
  assert.equal(calls, 0);
  assert.equal(entries.get(CACHE_KEY), '{"tasks":[null],"courses":[]}');
});
