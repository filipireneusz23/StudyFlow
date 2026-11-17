const test = require("node:test"),
  assert = require("node:assert/strict"),
  E = require("../exam-core.js"),
  V = require("../v4-core.js");
test("exam urgency reuses task local dates at every boundary with exam-specific labels", () => {
  const now = new Date(2026, 10, 17, 12);
  const levels = [
    [25, "later", "#22C55E"],
    [24, "week", "#84CC16"],
    [21, "week", "#84CC16"],
    [20, "soon", "#EAB308"],
    [19, "soon", "#EAB308"],
    [18, "tomorrow", "#F97316"],
    [17, "today", "#EF4444"],
    [16, "overdue", "#991B1B"],
  ];
  for (const [day, level, color] of levels) {
    const result = E.urgency({ date: `2026-11-${day}` }, now);
    assert.equal(result.level, level);
    assert.equal(result.color, color);
  }
  assert.equal(E.urgency({ date: "2026-11-18" }, now).text, "Mañana");
  assert.equal(E.urgency({ date: "2026-11-17" }, now).text, "Hoy");
  assert.equal(
    E.urgency({ date: "2026-11-17", time: "11:59" }, now).text,
    "Examen pasado",
  );
  assert.equal(E.urgency({ date: "" }, now).level, "neutral");
  assert.equal(
    E.urgency({ date: "2027-01-01" }, new Date(2026, 11, 31, 23, 59)).text,
    "Mañana",
  );
  assert.equal(
    E.urgency({ date: "2027-01-01" }, new Date(2027, 0, 1, 0, 0)).text,
    "Hoy",
  );
});
test("future, past and undated groups; each sort; filters; no fabricated creation dates", () => {
  const exams = [
    { id: "old", date: "2026-11-01", subject: "B" },
    {
      id: "far",
      date: "2026-12-01",
      subject: "C",
      createdAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "soon",
      date: "2026-11-18",
      subject: "A",
      createdAt: "2026-02-01T00:00:00Z",
    },
    { id: "recentPast", date: "2026-11-16", subject: "C" },
    { id: "none", date: "", subject: "D" },
  ];
  const original = structuredClone(exams),
    now = new Date(2026, 10, 17, 12),
    ids = (o = "near", f = "all") =>
      E.sorted(exams, o, f, now).map((e) => e.id);
  assert.deepEqual(ids(), ["soon", "far", "recentPast", "old", "none"]);
  assert.deepEqual(ids("far"), ["far", "soon", "recentPast", "old", "none"]);
  assert.deepEqual(ids("subject"), [
    "soon",
    "old",
    "far",
    "recentPast",
    "none",
  ]);
  assert.deepEqual(ids("created"), [
    "soon",
    "far",
    "old",
    "recentPast",
    "none",
  ]);
  assert.deepEqual(ids("near", "upcoming"), ["soon", "far"]);
  assert.deepEqual(ids("near", "past"), ["recentPast", "old"]);
  assert.deepEqual(ids("near", "undated"), ["none"]);
  assert.deepEqual(exams, original);
});
test("four prompts retain exam, subject, instructions and filenames without empty note fields", () => {
  const exam = {
    name: "Redes P04",
    subject: "Redes",
    notes: "Temas 2–5\nExcepto 3.4",
    pdfs: [{ name: "Temario.pdf" }],
  };
  for (const mode of ["summary", "quiz", "mock", "flashcards"]) {
    const p = E.prompt(exam, mode);
    assert(p.includes(exam.name));
    assert(p.includes(exam.subject));
    assert(p.includes(exam.notes));
    assert(p.includes("Temario.pdf"));
    const plain = E.prompt({ name: "A", subject: "B" }, mode);
    assert(!plain.includes("indicaciones"));
    assert(!plain.includes("undefined"));
  }
  assert(E.prompt(exam, "quiz").includes("20 preguntas"));
  assert(E.prompt(exam, "mock").includes("No muestres las soluciones"));
  assert(E.prompt(exam, "flashcards").includes("anverso"));
  assert(E.prompt(exam, "summary").includes("No inventes"));
  assert.throws(() => E.prompt(exam, "bad"));
});
test("old exams stay untouched, new optional fields validate safely in backups", () => {
  const old = {
    tasks: [],
    exams: [
      {
        id: "e",
        name: "Antiguo",
        subject: "Redes",
        date: "2026-11-18",
        custom: "conservar",
      },
    ],
  };
  const original = JSON.stringify(old);
  V.validate(old);
  assert.equal(JSON.stringify(old), original);
  const exam = old.exams[0];
  exam.notes = "Línea 1\n<script>texto</script>";
  exam.links = [{ label: "Apuntes", url: "https://example.com/" }];
  exam.time = "12:30";
  exam.pdfs = [
    { id: "p", name: "tema.pdf", size: 10, type: "application/pdf" },
  ];
  V.validate(old);
  V.validate(JSON.parse(JSON.stringify(old)));
  exam.links[0].url = "javascript:alert(1)";
  assert.throws(() => V.validate(old), /HTTP/);
  exam.links = [];
  exam.time = "24:00";
  assert.throws(() => V.validate(old), /Hora/);
  exam.time = "";
  exam.pdfs.push(exam.pdfs[0]);
  assert.throws(() => V.validate(old), /PDF/);
});
