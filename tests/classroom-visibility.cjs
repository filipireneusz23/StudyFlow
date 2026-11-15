const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:8000/");
    const personal = {
      version: 3,
      tasks: [
        {
          id: "p",
          name: "Tarea personal",
          subject: "Personal",
          due: "2027-01-08",
          done: false,
          priority: "medium",
        },
      ],
      exams: [],
      subjects: [{ id: "s", name: "Personal", color: "#aabbcc" }],
      settings: { name: "Ana" },
    };
    const courses = [
      { id: "current", name: "Curso actual", courseState: "ACTIVE" },
      { id: "old", name: "Curso anterior aún activo", courseState: "ACTIVE" },
      { id: "archive", name: "Clase archivada", courseState: "ARCHIVED" },
    ];
    const cache = {
      account: null,
      lastSync: "2026-11-15T12:00:00Z",
      courses,
      tasks: courses.map((c) => ({
        id: "classroom:" + c.id + ":w",
        courseId: c.id,
        name: "Entrega " + c.id,
        origin: "classroom",
        availability: "active",
        due: null,
        dueAt: null,
        limited: true,
        status: "CREATED",
        done: false,
        url: "",
      })),
    };
    await page.evaluate(
      ({ personal, cache }) => {
        localStorage.setItem("studyflow-v1", JSON.stringify(personal));
        localStorage.setItem(
          "studyflow-classroom-cache",
          JSON.stringify(cache),
        );
        localStorage.setItem(
          "studyflow-classroom-config",
          JSON.stringify({ clientId: "", mapping: {}, extra: "preservar" }),
        );
      },
      { personal, cache },
    );
    await page.reload();
    assert.equal(
      await page.locator('[data-task-id="classroom:archive:w"]').count(),
      0,
    );
    const upcoming = page
      .locator("section")
      .filter({
        has: page.getByRole("heading", {
          name: "Próximas entregas",
          exact: true,
        }),
      })
      .first();
    assert.equal(
      await upcoming.locator('[data-task-id="classroom:current:w"]').count(),
      0,
    );
    assert.equal(
      await upcoming.getByText("Tarea personal", { exact: true }).count(),
      1,
    );
    await page.getByRole("link", { name: "▤ Asignaturas" }).click();
    await page
      .getByRole("heading", { name: "Curso actual", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("heading", { name: "Clase archivada", exact: true })
        .count(),
      0,
    );
    await page.getByRole("link", { name: "⚙ Ajustes" }).click();
    await page.locator('[data-classroom-visible="old"]').waitFor();
    await page.locator('[data-classroom-visible="old"]').click();
    await page.getByRole("link", { name: "◈ Panel principal" }).click();
    await page
      .getByRole("heading", { name: "Actividades de Classroom", exact: true })
      .waitFor();
    assert.equal(
      await page.locator('[data-task-id="classroom:old:w"]').count(),
      0,
    );
    assert.equal(
      await page.locator('[data-task-id="classroom:current:w"]').count(),
      1,
    );
    assert.deepEqual(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("studyflow-v1")),
      ),
      personal,
    );
    assert.deepEqual(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("studyflow-classroom-cache")),
      ),
      cache,
    );
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("studyflow-classroom-config")).extra,
      ),
      "preservar",
    );
    await page.reload();
    assert.equal(
      await page.locator('[data-task-id="classroom:old:w"]').count(),
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: archived courses/tasks hidden despite stale task flags, optional hiding of old active courses, undated items excluded from upcoming deadlines, settings persist, personal and imported data unchanged.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
