const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ClassroomClient,
  SCOPES,
  SUBMISSION_SCOPES,
  inspectScopes,
  normalizeSubmission,
  CONFIG_KEY,
  CACHE_KEY,
} = require("../classroom.js");
test("own-submissions permission is accepted only for the separate limited profile", () => {
  const response = { scope: SUBMISSION_SCOPES.join(" ") };
  const sdk = { hasGrantedAllScopes: (r, s) => r.scope.split(" ").includes(s) };
  assert.deepEqual(inspectScopes(response, sdk, SUBMISSION_SCOPES).missing, []);
  assert.deepEqual(inspectScopes(response, sdk, SCOPES).missing, [SCOPES[1]]);
  const row = normalizeSubmission(
    { id: "c", name: "Clase" },
    {
      id: "s",
      courseWorkId: "w",
      state: "CREATED",
      late: true,
      alternateLink: "https://classroom.google.com/a/w",
    },
  );
  assert.equal(row.due, null);
  assert.equal(row.dueAt, null);
  assert.equal(row.limited, true);
  assert.equal(row.late, true);
  assert.match(row.name, /actividad w/);
  assert.match(row.description, /no permite consultar/);
});
test("limited mode uses only documented endpoints, deduplicates own submissions, preserves old metadata and all personal data", async () => {
  const previous = {
    account: { sub: "student" },
    courses: [],
    tasks: [
      {
        id: "classroom:c:w",
        courseId: "c",
        name: "Título anterior",
        description: "Descripción anterior",
        due: "2027-01-08",
        dueAt: null,
        origin: "classroom",
        availability: "active",
      },
    ],
    lastSync: null,
  };
  const entries = new Map([
    [
      CONFIG_KEY,
      JSON.stringify({
        clientId: "test.apps.googleusercontent.com",
        mapping: { c: "personal-subject" },
      }),
    ],
    [CACHE_KEY, JSON.stringify(previous)],
    ["studyflow-v1", "PERSONAL_UNCHANGED"],
  ]);
  let callback,
    now = Date.now(),
    fail = false,
    items = [
      {
        id: "s",
        courseWorkId: "w",
        state: "CREATED",
        late: true,
        alternateLink: "https://classroom.google.com/a/w",
      },
      { id: "s", courseWorkId: "w", state: "TURNED_IN", late: true },
    ];
  const requests = [];
  const sdk = {
    accounts: {
      oauth2: {
        hasGrantedAllScopes: (r, s) => r.scope.split(" ").includes(s),
        initTokenClient: (c) => {
          callback = c.callback;
          assert.equal(c.scope, SUBMISSION_SCOPES.join(" "));
          return { requestAccessToken() {} };
        },
        revoke: (t, c) => c({ successful: true }),
      },
    },
  };
  const client = new ClassroomClient({
    storage: {
      getItem: (k) => entries.get(k) || null,
      setItem: (k, v) => entries.set(k, v),
      removeItem: (k) => entries.delete(k),
    },
    identity: async () => sdk,
    now: () => now,
    onchange: () => {},
    fetch: async (url) => {
      requests.push(url);
      if (url.includes("userinfo")) return Response.json({ sub: "student" });
      if (fail)
        return Response.json(
          { error: { status: "PERMISSION_DENIED" } },
          { status: 403 },
        );
      if (url.includes("studentSubmissions")) {
        const u = new URL(url);
        assert.equal(u.searchParams.get("userId"), "me");
        assert(u.searchParams.get("fields").includes("courseWorkId"));
        return Response.json({ studentSubmissions: items });
      }
      assert(!url.includes("/courseWork"));
      return Response.json({
        courses: [{ id: "c", name: "Clase", courseState: "ACTIVE" }],
      });
    },
  });
  try {
    assert.equal(client.accessMode, "submissions");
    await client.prepare();
    client.connect();
    await callback({
      access_token: "TEST_MEMORY_ONLY",
      expires_in: 3600,
      scope: SUBMISSION_SCOPES.join(" "),
    });
    assert.equal(client.connected, true);
    assert.equal(client.cache.tasks.length, 1);
    const row = client.cache.tasks[0];
    assert.equal(row.done, true);
    assert.equal(row.due, null);
    assert.equal(row.previousMetadata.name, "Título anterior");
    assert.equal(row.previousMetadata.due, "2027-01-08");
    assert.equal(entries.get("studyflow-v1"), "PERSONAL_UNCHANGED");
    assert.equal(client.config.mapping.c, "personal-subject");
    assert.equal(requests.length, 3);
    const successful = JSON.stringify(client.cache);
    now += 16000;
    fail = true;
    assert.equal(await client.sync(), false);
    assert.equal(JSON.stringify(client.cache), successful);
    now += 16000;
    fail = false;
    items = [];
    await client.sync();
    assert.equal(client.cache.tasks[0].availability, "unavailable");
    assert.equal(entries.get("studyflow-v1"), "PERSONAL_UNCHANGED");
    assert(![...entries.values()].join("").includes("TEST_MEMORY_ONLY"));
  } finally {
    await client.disconnect();
  }
});
