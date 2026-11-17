const test = require("node:test"),
  assert = require("node:assert/strict"),
  V = require("../v4-core.js");
test("all boundaries and neutral states", () => {
  const now = new Date(2026, 10, 17, 12);
  for (const [day, level, color] of [
    [25, "later", "#22C55E"],
    [24, "week", "#84CC16"],
    [21, "week", "#84CC16"],
    [20, "soon", "#EAB308"],
    [19, "soon", "#EAB308"],
    [18, "tomorrow", "#F97316"],
    [17, "today", "#EF4444"],
    [16, "overdue", "#991B1B"],
  ]) {
    const u = V.taskUrgency({ due: `2026-11-${day}` }, now);
    assert.equal(u.level, level);
    assert.equal(u.color, color);
    assert(u.text);
  }
  assert.equal(
    V.taskUrgency({ due: "2020-01-01", done: true }, now).level,
    "completed",
  );
  assert.equal(V.taskUrgency({}, now).level, "neutral");
});
test("local midnight, leap day, year boundary and optional deadline", () => {
  assert.equal(
    V.taskUrgency({ due: "2027-01-01" }, new Date(2026, 11, 31, 23, 59)).text,
    "Queda 1 día",
  );
  assert.equal(
    V.taskUrgency({ due: "2027-01-01" }, new Date(2027, 0, 1, 0, 0)).level,
    "today",
  );
  assert.equal(
    V.taskUrgency({ due: "2024-03-01" }, new Date(2024, 1, 28, 23, 59)).text,
    "Quedan 2 días",
  );
  const t = { due: "2026-11-17", dueTime: "12:00" };
  assert.equal(
    V.taskUrgency(t, new Date(2026, 10, 17, 11, 59, 59)).level,
    "today",
  );
  assert.equal(V.taskUrgency(t, new Date(2026, 10, 17, 12)).level, "overdue");
  assert.equal(
    V.taskUrgency({ due: t.due }, new Date(2026, 10, 17, 23, 59, 59)).level,
    "today",
  );
  assert.throws(
    () =>
      V.validate({
        tasks: [{ name: "A", subject: "B", due: t.due, dueTime: "25:00" }],
      }),
    /Hora/,
  );
});
test("civil day distance across DST changes and multiple time zones", () => {
  const original = process.env.TZ;
  try {
    for (const tz of [
      "Europe/Madrid",
      "America/New_York",
      "Pacific/Auckland",
    ]) {
      process.env.TZ = tz;
      for (const [month, day] of [
        [2, 28],
        [2, 29],
        [9, 24],
        [9, 25],
        [10, 1],
      ]) {
        const now = new Date(2026, month, day, 23, 59);
        const target = new Date(2026, month, day + 2);
        assert.equal(
          V.taskUrgency({ due: V.key(target) }, now).text,
          "Quedan 2 días",
        );
      }
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test("DST repeated hour never makes an expired deadline pending again", () => {
  const previous = process.env.TZ;
  process.env.TZ = "Europe/Madrid";
  try {
    const task = { due: "2026-10-25", dueTime: "02:30" };
    assert.equal(
      V.taskUrgency(task, new Date("2026-10-25T00:29:59Z")).level,
      "today",
    );
    assert.equal(
      V.taskUrgency(task, new Date("2026-10-25T00:30:00Z")).level,
      "overdue",
    );
    assert.equal(
      V.taskUrgency(task, new Date("2026-10-25T01:05:00Z")).level,
      "overdue",
    );
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
