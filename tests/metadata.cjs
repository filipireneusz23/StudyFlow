const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ClassroomClient,
  SCOPES,
  SUBMISSION_SCOPES,
  CONFIG_KEY,
  CACHE_KEY,
  normalizeWork,
} = require("../classroom.js");
function fixture() {
  const cache = {
    account: { sub: "student" },
    courses: [{ id: "c1", name: "Redes", courseState: "ACTIVE" }],
    tasks: [
      {
        id: "classroom:c1:w",
        courseId: "c1",
        workId: "w",
        name: "Entrega propia · actividad w",
        limited: true,
        origin: "classroom",
        availability: "active",
        due: null,
        dueAt: null,
        status: "CREATED",
        done: false,
      },
    ],
    lastSync: "2026-11-15T12:00:00Z",
  };
  const store = new Map([
    [
      CONFIG_KEY,
      JSON.stringify({
        clientId: "test.apps.googleusercontent.com",
        mapping: {},
        accessMode: "submissions",
      }),
    ],
    [CACHE_KEY, JSON.stringify(cache)],
    ["studyflow-v1", "PERSONAL_UNCHANGED"],
  ]);
  let callback,
    clock = Date.now(),
    changed = false,
    getFailure = 0;
  const calls = [];
  const work = (course, id) => ({
    id,
    courseId: course,
    title:
      course === "c2"
        ? "Otra clase, mismo ID"
        : id === "extra"
          ? "Actividad recuperada por GET"
          : changed
            ? "Entrega P04 - BIND9 - Transferencia de zona (revisada)"
            : "Entrega P04 - BIND9 - Transferencia de zona",
    description: "Configura BIND9 y la transferencia de zona.",
    ...(id === "extra"
      ? {}
      : {
          dueDate: { year: 2026, month: 11, day: changed ? 19 : 18 },
          dueTime: { hours: 22, minutes: 59 },
        }),
    alternateLink: `https://classroom.google.com/c/${course}/a/${id}`,
    state: "PUBLISHED",
  });
  const google = {
    accounts: {
      oauth2: {
        hasGrantedAllScopes: (r, s) => r.scope.split(" ").includes(s),
        initTokenClient: (c) => {
          callback = c.callback;
          return { requestAccessToken() {} };
        },
        revoke: (t, c) => c({ successful: true }),
      },
    },
  };
  const client = new ClassroomClient({
    storage: {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    },
    identity: async () => google,
    now: () => clock,
    onchange: () => {},
    fetch: async (url) => {
      calls.push(url);
      if (url.includes("userinfo")) return Response.json({ sub: "student" });
      const u = new URL(url),
        course = u.pathname.split("/")[3];
      if (url.includes("studentSubmissions"))
        return Response.json({
          studentSubmissions: [
            {
              courseId: course,
              courseWorkId: "w",
              state: course === "c2" ? "TURNED_IN" : "CREATED",
            },
            ...(course === "c1"
              ? [{ courseId: course, courseWorkId: "extra", state: "CREATED" }]
              : []),
          ],
        });
      if (/\/courseWork\/[^/]+$/.test(u.pathname)) {
        if (getFailure)
          return Response.json(
            { error: { status: "PERMISSION_DENIED" } },
            { status: getFailure },
          );
        return Response.json(work(course, u.pathname.split("/").at(-1)));
      }
      if (u.pathname.endsWith("/courseWork"))
        return Response.json({
          courseWork: [work(course, "w"), work(course, "w")],
        });
      return Response.json({
        courses: [
          { id: "c1", name: "Redes", courseState: "ACTIVE" },
          { id: "c2", name: "Sistemas", courseState: "ACTIVE" },
        ],
      });
    },
  });
  return {
    client,
    store,
    calls,
    cache,
    async start(scopes = SCOPES) {
      await client.prepare();
      client.connectWithMode("full");
      await callback({
        access_token: "MEMORY_ONLY_TEST",
        expires_in: 3600,
        scope: scopes.join(" "),
      });
    },
    change() {
      changed = true;
      clock += 16000;
    },
    failGet(status) {
      getFailure = status;
      clock += 16000;
    },
  };
}
test("upgrade asks for actual coursework permission, and denied scope preserves the exact cached snapshot", async () => {
  const h = fixture();
  await h.start(SUBMISSION_SCOPES);
  assert.equal(h.client.connected, false);
  assert.deepEqual(h.client.diagnostics.missingScopes, [SCOPES[1]]);
  assert.equal(h.calls.length, 0);
  assert.equal(h.store.get(CACHE_KEY), JSON.stringify(h.cache));
  assert.equal(h.store.get("studyflow-v1"), "PERSONAL_UNCHANGED");
});
test("list and get resources retain exact title, description, UTC time, source link and compound-key submission state; updates replace without duplication", async () => {
  const h = fixture();
  try {
    await h.start();
    assert.equal(h.client.metadataAccess.list, "confirmed");
    assert.equal(h.client.metadataAccess.get, "confirmed");
    assert.equal(h.client.cache.tasks.length, 3);
    let item = h.client.cache.tasks.find((t) => t.id === "classroom:c1:w");
    assert.equal(item.name, "Entrega P04 - BIND9 - Transferencia de zona");
    assert.equal(
      item.description,
      "Configura BIND9 y la transferencia de zona.",
    );
    assert.equal(item.dueAt, "2026-11-18T22:59:00.000Z");
    assert.equal(item.url, "https://classroom.google.com/c/c1/a/w");
    assert.equal(item.done, false);
    assert.equal(
      h.client.cache.tasks.find((t) => t.id === "classroom:c2:w").done,
      true,
    );
    assert.equal(
      h.client.cache.tasks.find((t) => t.workId === "extra").name,
      "Actividad recuperada por GET",
    );
    assert.equal(
      h.client.cache.tasks.find((t) => t.workId === "extra").due,
      null,
    );
    h.change();
    assert.equal(await h.client.sync(), true);
    item = h.client.cache.tasks.find((t) => t.id === "classroom:c1:w");
    assert.equal(
      item.name,
      "Entrega P04 - BIND9 - Transferencia de zona (revisada)",
    );
    assert.equal(item.dueAt, "2026-11-19T22:59:00.000Z");
    assert.equal(h.client.cache.tasks.length, 3);
    assert.equal(h.store.get("studyflow-v1"), "PERSONAL_UNCHANGED");
    assert(![...h.store.values()].join("").includes("MEMORY_ONLY_TEST"));
  } finally {
    await h.client.disconnect();
  }
});
test("GET rejection fails safely without replacing the last successful data", async () => {
  const h = fixture();
  try {
    await h.start();
    const old = h.store.get(CACHE_KEY);
    h.failGet(403);
    assert.equal(await h.client.sync(), false);
    assert.equal(h.client.metadataAccess.get, "failed");
    assert.equal(h.store.get(CACHE_KEY), old);
    assert.equal(h.store.get("studyflow-v1"), "PERSONAL_UNCHANGED");
  } finally {
    await h.client.disconnect();
  }
});
test("different courses or coursework IDs cannot be joined by accident", () => {
  assert.throws(() =>
    normalizeWork({ id: "c" }, { id: "w", courseId: "other" }),
  );
  assert.throws(() =>
    normalizeWork({ id: "c" }, { id: "w" }, { courseWorkId: "different" }),
  );
});
