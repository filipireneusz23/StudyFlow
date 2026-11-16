const test = require("node:test");
const assert = require("node:assert/strict");
const V = require("../v4-core.js");
test("manual links accept only absolute HTTP/HTTPS and preserve safe labels", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,test",
    "//example.com",
    "/path",
    "file:///tmp/a",
    "https://",
    "https://example.com/\nattack",
  ])
    assert.equal(V.safeTaskUrl(url), null, url);
  assert.equal(
    V.safeTaskUrl(" https://classroom.google.com/c/123/a/456?x=1&y=2 "),
    "https://classroom.google.com/c/123/a/456?x=1&y=2",
  );
  assert.equal(V.safeTaskUrl("http://example.com"), "http://example.com/");
  assert.deepEqual(
    V.taskLinks([
      { url: "https://example.com", label: "<script>text</script>" },
    ]),
    [{ url: "https://example.com/", label: "<script>text</script>" }],
  );
  assert.throws(() => V.taskLinks([{ url: "javascript:alert(1)" }]), /HTTP/);
});
test("optional fields keep old tasks intact and validate backup content", () => {
  const old = {
    tasks: [{ id: "old", name: "Old", subject: "Redes", due: "" }],
  };
  const before = JSON.stringify(old);
  V.validate(old);
  assert.equal(JSON.stringify(old), before);
  const full = structuredClone(old);
  full.tasks[0].notes = "Línea 1\n<script>alert(1)</script>";
  full.tasks[0].links = [
    { label: "Classroom", url: "https://classroom.google.com/" },
  ];
  V.validate(JSON.parse(JSON.stringify(full)));
  assert.deepEqual(JSON.parse(JSON.stringify(full)), full);
  full.tasks[0].links[0].url = "data:text/html,test";
  assert.throws(() => V.validate(full), /HTTP/);
  full.tasks[0].links = [];
  full.tasks[0].notes = { html: "bad" };
  assert.throws(() => V.validate(full), /notas/);
});
