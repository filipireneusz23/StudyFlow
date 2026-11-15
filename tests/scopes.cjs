const test = require("node:test");
const assert = require("node:assert/strict");
const {
  inspectScopes,
  SCOPES,
  ClassroomClient,
  CONFIG_KEY,
} = require("../classroom.js");
const sdk = {
  hasGrantedAllScopes: (response, ...scopes) =>
    scopes.every((scope) => response.scope.split(/\s+/).includes(scope)),
};
test("the exact four requested scopes are required, and each partial grant names precisely the missing scope", () => {
  assert.deepEqual(SCOPES, [
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
    "openid",
    "email",
  ]);
  for (const missing of SCOPES) {
    const response = { scope: SCOPES.filter((s) => s !== missing).join(" ") };
    const report = inspectScopes(response, sdk);
    assert.deepEqual(report.missing, [missing]);
    assert.deepEqual(report.unconfirmed, []);
  }
  const complete = inspectScopes({ scope: SCOPES.join(" ") }, sdk);
  assert.deepEqual(complete.missing, []);
  assert.deepEqual(complete.unconfirmed, []);
});
test("Google canonical userinfo.email alias, whitespace and duplicated scopes are handled without accepting a different Classroom scope", () => {
  const canonical = SCOPES.map((s) =>
    s === "email" ? "https://www.googleapis.com/auth/userinfo.email" : s,
  );
  const report = inspectScopes(
    { scope: " " + canonical.join("  \n ") + " openid " },
    sdk,
  );
  assert.equal(report.granted.length, 4);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.unconfirmed, []);
  const other = inspectScopes(
    {
      scope: [
        SCOPES[0],
        "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly",
        "openid",
        "email",
      ].join(" "),
    },
    sdk,
  );
  assert.deepEqual(other.missing, [SCOPES[1]]);
});
test("unknown or absent scope metadata and contradictions in GIS are never accepted as authorization", () => {
  assert.equal(inspectScopes({}, sdk).reported, false);
  const report = inspectScopes(
    { scope: SCOPES.join(" ") },
    { hasGrantedAllScopes: () => false },
  );
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.unconfirmed, SCOPES);
  const sensitive = "DO_NOT_DISPLAY_THIS_VALUE";
  const safe = inspectScopes(
    { access_token: sensitive, scope: sensitive + " email" },
    sdk,
  );
  assert(!JSON.stringify(safe).includes(sensitive));
  assert.deepEqual(safe.granted, ["email"]);
});
test("realistic callback scopes gate identity, preserve data, and a fresh consent retry succeeds", async () => {
  const stored = new Map([
    [
      CONFIG_KEY,
      JSON.stringify({
        clientId: "scope-test.apps.googleusercontent.com",
        mapping: {},
      }),
    ],
    ["studyflow-v1", "unchanged"],
  ]);
  let config, request;
  const calls = [];
  const google = {
    accounts: {
      oauth2: {
        ...sdk,
        initTokenClient: (c) => {
          config = c;
          return { requestAccessToken: (r) => (request = r) };
        },
        revoke: (t, cb) => cb({ successful: true }),
      },
    },
  };
  const client = new ClassroomClient({
    storage: {
      getItem: (k) => stored.get(k) || null,
      setItem: (k, v) => stored.set(k, v),
      removeItem: (k) => stored.delete(k),
    },
    identity: async () => google,
    onchange: () => {},
    fetch: async (url) => {
      calls.push(url);
      return Response.json(
        url.includes("userinfo") ? { sub: "student" } : { courses: [] },
      );
    },
  });
  try {
    await client.prepare();
    client.connect();
    assert.equal(config.scope, SCOPES.join(" "));
    assert.equal(config.include_granted_scopes, false);
    assert.match(request.prompt, /consent/);
    await config.callback({
      access_token: "IN_MEMORY_ONLY",
      expires_in: 3600,
      scope: SCOPES.filter((s) => s !== SCOPES[1]).join(" "),
    });
    assert.equal(client.diagnostics.code, "insufficient_scope");
    assert.deepEqual(client.diagnostics.missingScopes, [SCOPES[1]]);
    assert.equal(calls.length, 0);
    assert.match(client.error, /classroom.coursework.me.readonly/);
    assert.match(client.error, /administrador/);
    assert.equal(client.connected, false);
    client.connect();
    await config.callback({
      access_token: "IN_MEMORY_ONLY",
      expires_in: 3600,
      scope: SCOPES.map((s) =>
        s === "email" ? "https://www.googleapis.com/auth/userinfo.email" : s,
      ).join(" "),
    });
    assert.equal(client.connected, true);
    assert.equal(client.diagnostics.identityVerified, true);
    assert.equal(calls.length, 2);
    assert.equal(stored.get("studyflow-v1"), "unchanged");
    assert(![...stored.values()].join("").includes("IN_MEMORY_ONLY"));
  } finally {
    await client.disconnect();
  }
});
