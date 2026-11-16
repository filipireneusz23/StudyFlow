const test = require("node:test");
const assert = require("node:assert/strict");
const V = require("../v4-core.js");
const state = () => ({
  version: 3,
  tasks: [
    {
      id: "p",
      name: "Personal",
      subject: "Redes",
      due: "2026-11-18",
      done: false,
      priority: "high",
      custom: "keep",
    },
  ],
  exams: [{ id: "e", name: "Examen", subject: "Redes", date: "2026-11-19" }],
  subjects: [{ id: "s", name: "Redes", color: "#123456" }],
  settings: { name: "Ana", custom: "preservar" },
});
test("v4 migration preserves all personal fields and timetable, and archives imported activities without auto-creating tasks", () => {
  const original = state();
  original.timetable = {
    activeId: "a",
    schedules: [
      {
        id: "a",
        name: "A",
        blocks: [
          {
            id: "b",
            day: 1,
            type: "class",
            subjectId: "gc:c",
            subjectName: "Programación",
            color: "#aabbcc",
            start: "08:30",
            end: "09:30",
          },
        ],
      },
    ],
  };
  const cache = {
    courses: [{ id: "c", name: "Programación" }],
    tasks: [
      {
        id: "remote",
        courseId: "c",
        courseName: "Programación",
        name: "Título real",
        description: "Descripción",
        due: "2026-11-20",
        done: false,
      },
    ],
    lastSync: "2026-11-15T12:00:00Z",
  };
  const migrated = V.migrate(original, cache);
  for (const key of ["tasks", "exams", "settings"])
    assert.deepEqual(migrated[key], original[key]);
  assert.equal(migrated.version, 4);
  assert.equal(migrated.timetable.schedules[0].blocks[0].id, "b");
  assert.equal(
    migrated.timetable.schedules[0].blocks[0].subjectId,
    "legacy-subject:c",
  );
  assert.equal(migrated.tasks.length, 1);
  assert.equal(original.subjects.length, 1);
  assert.equal(migrated.importArchive.activities.length, 1);
  const local = V.convertImport(migrated, "remote");
  assert.equal(local.tasks.length, 2);
  assert.equal(local.tasks[1].name, "Título real");
  assert.equal(local.tasks[1].origin, undefined);
  assert.equal(V.convertImport(local, "remote").tasks.length, 2);
  assert.equal(V.migrate(local, cache).tasks.length, 2);
  const duplicate = structuredClone(migrated);
  duplicate.tasks.push({
    id: "manual",
    name: "Título real",
    subject: "Programación",
    due: "2026-11-20",
  });
  assert.equal(V.convertImport(duplicate, "remote").tasks.length, 2);
});
test("renaming an imported local subject does not duplicate it on later conversions", () => {
  const s = V.migrate(state(), {
    courses: [{ id: "c", name: "Programación" }],
    tasks: [
      {
        id: "a",
        courseId: "c",
        courseName: "Programación",
        name: "Trabajo A",
        due: "2026-11-18",
      },
      {
        id: "b",
        courseId: "c",
        courseName: "Programación",
        name: "Trabajo B",
        due: "2026-11-19",
      },
    ],
  });
  const first = V.convertImport(s, "a");
  first.subjects.find((s) => s.id === "legacy-subject:c").name =
    "Programación personalizada";
  first.tasks.find((t) => t.importKey === "a").subject =
    "Programación personalizada";
  const next = V.convertImport(first, "b");
  assert.equal(
    next.subjects.filter((s) => s.id === "legacy-subject:c").length,
    1,
  );
  assert.equal(
    next.tasks.find((t) => t.importKey === "b").subject,
    "Programación personalizada",
  );
});
test("unknown imported titles cannot become fabricated personal tasks", () => {
  const s = V.migrate(state(), {
    tasks: [{ id: "x", name: "Entrega propia · actividad 123", limited: true }],
  });
  assert.throws(() => V.convertImport(s, "x"));
  assert.equal(s.tasks.length, 1);
});
test("weighted averages, pending goals and incomplete weights are mathematically distinct", () => {
  const result = V.grades(
    [
      { score: 8, weight: 40 },
      { score: null, weight: 60 },
    ],
    10,
    5,
  );
  assert.equal(result.average, 8);
  assert.equal(result.final, null);
  assert.equal(result.needed, 3);
  assert.equal(result.pending, 60);
  assert(
    Math.abs(
      V.grades([
        { score: 8, weight: 40 },
        { score: 6, weight: 60 },
      ]).final - 6.8,
    ) < 1e-9,
  );
  assert.equal(V.grades([{ score: 8, weight: 40 }]).needed, null);
  assert.equal(V.grades([]).average, null);
  assert.throws(() =>
    V.grades([
      { score: 8, weight: 60 },
      { score: 5, weight: 60 },
    ]),
  );
  assert.throws(() => V.grades([{ score: 11, weight: 100 }]));
  assert.throws(() => V.grades([{ score: 5, weight: 0 }]));
});
test("Pomodoro expiry records exactly one completed focus and no phantom sessions after days closed", () => {
  const now = Date.parse("2026-11-15T12:00:00Z"),
    timer = {
      id: "t",
      phase: "focus",
      duration: 1500,
      remaining: 1500,
      running: true,
      endAt: now + 1500000,
      segmentStart: now,
      subjectId: "s",
      segments: [],
    };
  const done = V.settleTimer(timer, [], now + 86400000);
  assert.equal(done.sessions.length, 1);
  assert.equal(done.sessions[0].seconds, 1500);
  assert.equal(
    done.sessions[0].completedAt,
    new Date(timer.endAt).toISOString(),
  );
  assert.equal(
    V.settleTimer(done.timer, done.sessions, now + 200000000).sessions.length,
    1,
  );
  assert.equal(
    V.settleTimer({ ...timer, phase: "short" }, [], now + 86400000).sessions
      .length,
    0,
  );
  assert.equal(
    V.settleTimer({ ...timer, running: false }, [], now + 86400000).completed,
    false,
  );
  assert.equal(V.remaining(timer, now + 1000), 1499);
});
test("study statistics split active intervals at midnight and preserve paused-time exclusion", () => {
  const start = new Date("2026-11-15T23:50:00").getTime(),
    end = new Date("2026-11-16T00:10:00").getTime(),
    sessions = [
      {
        id: "s",
        subjectId: "a",
        seconds: 1200,
        completedAt: new Date(end).toISOString(),
        segments: [{ start, end }],
      },
    ];
  const stats = V.studyStats(sessions, new Date("2026-11-16T12:00:00"));
  assert.equal(stats.byDay["2026-11-15"], 600);
  assert.equal(stats.byDay["2026-11-16"], 600);
  assert.equal(stats.day, 600);
  assert.equal(stats.week, 600);
  assert.equal(stats.month, 1200);
  assert.equal(stats.total, 1200);
});
test("natural months clamp month lengths including leap years, independently of scheduled attendance", () => {
  assert.equal(V.addDuration("2027-01-31", 1, "months"), "2027-02-28");
  assert.equal(V.addDuration("2024-01-31", 1, "months"), "2024-02-29");
  assert.equal(V.addDuration("2026-11-30", 3, "months"), "2027-02-28");
  assert.equal(V.addDuration("2026-11-16", 2, "weeks"), "2026-11-30");
  assert.throws(() => V.addDuration("2027-02-30", 1, "months"));
  const p = {
    start: "2026-12-24",
    end: "2026-12-28",
    weekdays: [1, 2, 3, 4, 5],
    exceptions: [
      { date: "2026-12-25", attend: false },
      { date: "2026-12-26", attend: true },
    ],
    logs: [{ date: "2026-12-24", hours: 7.5 }],
    totalHours: 100,
  };
  const stats = V.practice(p, "2026-12-25");
  assert.deepEqual(stats.scheduled, ["2026-12-24", "2026-12-26", "2026-12-28"]);
  assert.equal(stats.naturalTotal, 5);
  assert.equal(stats.naturalElapsed, 1);
  assert.equal(stats.hours, 7.5);
  assert.equal(stats.next, "2026-12-26");
  assert.equal(stats.scheduledElapsed, 1);
});
test("reminders are stable, dismiss individually, include tomorrow, overdue, exams and practices", () => {
  const s = state();
  s.tasks[0].due = "2026-11-16";
  s.tasks.push({
    id: "overdue",
    name: "Atrasada",
    due: "2026-11-14",
    done: false,
  });
  s.practice = { start: "2026-11-17", end: "2026-11-18", company: "Empresa" };
  const reminders = V.reminders(s, "2026-11-15");
  assert(reminders.some((r) => r.title.startsWith("Vence mañana")));
  assert(reminders.some((r) => r.title.startsWith("Entrega atrasada")));
  assert(reminders.some((r) => r.id.startsWith("practice:start")));
  assert.equal(new Set(reminders.map((r) => r.id)).size, reminders.length);
  s.dismissedReminders = [reminders[0].id];
  assert.equal(V.reminders(s, "2026-11-15").length, reminders.length - 1);
  assert.deepEqual(V.reminders(s, "2026-11-15"), V.reminders(s, "2026-11-15"));
});
test("invalid imports, duplicate IDs, invalid hours and impossible segment totals are rejected", () => {
  assert.throws(() =>
    V.validate({
      ...state(),
      grades: [
        {
          id: "g",
          subjectId: "s",
          title: "X",
          term: "1",
          date: "2026-11-16",
          score: 5,
          weight: 101,
        },
      ],
    }),
  );
  assert.throws(() =>
    V.validate({
      ...state(),
      notes: [
        {
          id: "a",
          title: "",
          content: "x",
          subjectId: "",
          updatedAt: "invalid",
        },
      ],
    }),
  );
  assert.throws(() =>
    V.validate({
      ...state(),
      studySessions: [
        {
          id: "a",
          seconds: 100,
          completedAt: "2026-11-15T12:00:00Z",
          segments: [{ start: 1, end: 500 }],
        },
      ],
    }),
  );
  assert.throws(() =>
    V.validate({
      ...state(),
      practice: {
        start: "2026-11-17",
        end: "2026-11-16",
        weekdays: [1],
        logs: [],
      },
    }),
  );
});
