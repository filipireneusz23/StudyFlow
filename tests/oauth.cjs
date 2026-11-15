const test = require("node:test");
const assert = require("node:assert/strict");
const { ClassroomClient, CONFIG_KEY, SCOPES } = require("../classroom.js");
const TOKEN = "DO_NOT_EXPOSE_TEST_TOKEN";
function fixture(options = {}) {
  const store = new Map([
    [
      CONFIG_KEY,
      JSON.stringify({
        clientId: "test.apps.googleusercontent.com",
        mapping: {},
      }),
    ],
    ["studyflow-v1", "personal data"],
  ]);
  let callbacks;
  const api = {
    accounts: {
      oauth2: {
        initTokenClient: (c) => {
          callbacks = c;
          return { requestAccessToken() {} };
        },
        hasGrantedAllScopes: (response, ...scopes) =>
          scopes.every((scope) =>
            (response.scope || "").split(/\s+/).includes(scope),
          ),
        revoke: (token, cb) => cb({ successful: true }),
      },
    },
  };
  const client = new ClassroomClient({
    storage: {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    },
    identity: async () => api,
    onchange: () => {},
    authTimeoutMs: 30,
    requestTimeoutMs: 30,
    fetch:
      options.fetch ||
      (async (url) =>
        Response.json(
          url.includes("userinfo")
            ? { sub: "student", email: "student@example.test" }
            : { courses: [] },
        )),
  });
  return {
    client,
    store,
    get callbacks() {
      return callbacks;
    },
    async start() {
      await client.prepare();
      client.connect();
    },
    complete(
      response = {
        access_token: TOKEN,
        expires_in: 3600,
        scope: (options.scopes === false
          ? SCOPES.filter((_, i) => i !== 1)
          : SCOPES
        ).join(" "),
      },
    ) {
      return callbacks.callback(response);
    },
  };
}
test("missing SDK callbacks time out, release busy state and ignore a late success", async () => {
  const h = fixture();
  await h.start();
  assert.equal(h.client.phase, "waiting");
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(h.client.busy, false);
  assert.equal(h.client.connected, false);
  assert.equal(h.client.diagnostics.callbackReceived, false);
  assert.equal(h.client.diagnostics.code, "oauth_timeout");
  assert.match(h.client.error, /no ha devuelto una respuesta/);
  await h.complete();
  assert.equal(h.client.connected, false);
  assert.equal(h.store.get("studyflow-v1"), "personal data");
});
test("popup blocked and closed errors are visible and allow retry", async () => {
  for (const type of ["popup_failed_to_open", "popup_closed", "unknown"]) {
    const h = fixture();
    await h.start();
    h.callbacks.error_callback({ type });
    assert.equal(h.client.busy, false);
    assert.equal(h.client.diagnostics.callbackReceived, false);
    assert.match(h.client.error, /ventana|emergente/);
    await h.client.disconnect();
  }
});
test("callback distinguishes absent token, denied consent, invalid client, and partial scopes without echoing raw responses", async () => {
  for (const [response, code] of [
    [{}, "missing_token"],
    [{ error: "access_denied", error_description: TOKEN }, "access_denied"],
    [{ error: "invalid_client", error_description: TOKEN }, "invalid_client"],
  ]) {
    const h = fixture();
    await h.start();
    await h.complete(response);
    assert.equal(h.client.diagnostics.callbackReceived, true);
    assert.equal(h.client.diagnostics.code, code);
    assert.equal(h.client.connected, false);
    assert(!h.client.error.includes(TOKEN));
    assert.equal(h.client.busy, false);
  }
  const h = fixture({ scopes: false });
  await h.start();
  await h.complete();
  assert.equal(h.client.diagnostics.tokenReceived, true);
  assert.equal(h.client.diagnostics.code, "insufficient_scope");
  assert.equal(h.client.connected, false);
  assert(!JSON.stringify(h.client.diagnostics).includes(TOKEN));
});
test("popup closure after callback cannot cancel identity verification; duplicate callbacks are ignored", async () => {
  let release;
  const h = fixture({
    fetch: async (url) =>
      url.includes("userinfo")
        ? new Promise((r) => (release = r))
        : Response.json({ courses: [] }),
  });
  try {
    await h.start();
    const completion = h.complete();
    assert.equal(h.client.connected, false);
    assert.equal(h.client.phase, "identity");
    // Returning focus from Google's popup must not start Classroom queries before identity is verified.
    h.client.autoSync();
    assert.equal(h.client.phase, "identity");
    assert.equal(h.client.diagnostics.apiStep, "identity");
    h.callbacks.error_callback({ type: "popup_closed" });
    assert.equal(h.client.error, "");
    release(Response.json({ sub: "student" }));
    await completion;
    assert.equal(h.client.connected, true);
    assert.equal(h.client.phase, "complete");
    assert.deepEqual(h.client.diagnostics, {
      callbackReceived: true,
      tokenReceived: true,
      identityVerified: true,
      apiStep: "courses",
      code: "",
      requestedScopes: [...SCOPES],
      grantedScopes: [...SCOPES],
      missingScopes: [],
      unconfirmedScopes: [],
      scopesReported: true,
    });
    await h.complete({ error: "invalid_client" });
    assert.equal(h.client.phase, "complete");
    assert(![...h.store.values()].join("").includes(TOKEN));
  } finally {
    await h.client.disconnect();
  }
});
test("identity 403 is distinguished from Classroom API rejection", async () => {
  const h = fixture({
    fetch: async () =>
      Response.json(
        { error: { status: "PERMISSION_DENIED", message: TOKEN } },
        { status: 403 },
      ),
  });
  await h.start();
  await h.complete();
  assert.equal(h.client.diagnostics.apiStep, "identity");
  assert.equal(h.client.diagnostics.tokenReceived, true);
  assert.equal(h.client.connected, false);
  assert.match(h.client.error, /identidad.*403/);
  assert(!h.client.error.includes(TOKEN));
  assert.equal(h.client.busy, false);
});
test("disabled Classroom API keeps OAuth connection while reporting the actual service error", async () => {
  const h = fixture({
    fetch: async (url) =>
      url.includes("userinfo")
        ? Response.json({ sub: "student" })
        : Response.json(
            {
              error: {
                details: [{ reason: "SERVICE_DISABLED" }],
                message: TOKEN,
              },
            },
            { status: 403 },
          ),
  });
  try {
    await h.start();
    await h.complete();
    assert.equal(h.client.connected, true);
    assert.equal(h.client.phase, "failed");
    assert.equal(h.client.diagnostics.code, "SERVICE_DISABLED");
    assert.match(h.client.error, /API no está habilitada/);
    assert.match(h.client.progress, /autorizada.*sincronización ha fallado/);
    assert(!h.client.error.includes(TOKEN));
    assert.equal(h.client.cache.lastSync, null);
  } finally {
    await h.client.disconnect();
  }
});
test("invalid JSON, stalled body and network failure cannot leave the OAuth attempt busy", async () => {
  for (const fetch of [
    async () => new Response("not json"),
    async () => ({ ok: true, json: () => new Promise(() => {}) }),
    async () => {
      throw Error(TOKEN);
    },
  ]) {
    const h = fixture({ fetch });
    await h.start();
    await h.complete();
    assert.equal(h.client.busy, false);
    assert.equal(h.client.connected, false);
    assert(h.client.error);
    assert(!h.client.error.includes(TOKEN));
    assert.notEqual(h.client.diagnostics.code, "");
  }
});
test("cancelled authorization cannot restore a connection from a late callback", async () => {
  const h = fixture();
  await h.start();
  h.client.cancelConnect();
  await h.complete();
  assert.equal(h.client.phase, "cancelled");
  assert.equal(h.client.busy, false);
  assert.equal(h.client.connected, false);
  assert.equal(h.store.get("studyflow-v1"), "personal data");
});
