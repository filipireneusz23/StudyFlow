const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "Europe/Madrid",
    });
    await page.clock.install({ time: new Date("2026-11-16T07:45:00Z") });
    const errors = [],
      requests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => requests.push(r.url()));
    await page.goto("http://127.0.0.1:8000/");
    async function nav(name) {
      const link = page.getByRole("link", { name, exact: true });
      const hash = await link.getAttribute("href");
      await link.click();
      await page.waitForFunction(
        (hash) =>
          document
            .querySelector('nav a[aria-current="page"]')
            ?.getAttribute("href") === hash,
        hash,
      );
    }
    const original = {
      version: 3,
      tasks: [
        {
          id: "p",
          name: "Tarea conservada",
          subject: "Redes",
          due: "2026-11-17",
          done: false,
          priority: "high",
          extra: "mantener",
        },
      ],
      exams: [
        {
          id: "e",
          name: "Examen conservado",
          subject: "Redes",
          date: "2026-11-19",
        },
      ],
      subjects: [{ id: "s", name: "Redes", color: "#aabbcc" }],
      settings: { name: "Ana", extra: "keep" },
      timetable: {
        activeId: "default",
        schedules: [
          {
            id: "default",
            name: "Principal",
            blocks: [
              {
                id: "b",
                day: 1,
                type: "class",
                subjectId: "s",
                subjectName: "Redes",
                start: "08:30",
                end: "09:30",
                color: "#aabbcc",
              },
            ],
          },
        ],
      },
    };
    const cache = {
      courses: [{ id: "c", name: "Redes", courseState: "ACTIVE" }],
      tasks: [
        {
          id: "remote",
          courseId: "c",
          courseName: "Redes",
          name: "Trabajo importado real",
          due: "2026-11-20",
          description: "Copia real",
          done: false,
        },
        {
          id: "unknown",
          courseId: "c",
          name: "Entrega propia · actividad 123",
          limited: true,
        },
      ],
      lastSync: "2026-11-15T12:00:00Z",
    };
    await page.evaluate(
      ({ original, cache }) => {
        localStorage.setItem("studyflow-v1", JSON.stringify(original));
        localStorage.setItem(
          "studyflow-classroom-cache",
          JSON.stringify(cache),
        );
        localStorage.setItem(
          "studyflow-classroom-config",
          JSON.stringify({
            clientId: "discard.apps.googleusercontent.com",
            mapping: {},
          }),
        );
      },
      { original, cache },
    );
    await page.reload();
    let state = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("studyflow-v1")),
    );
    for (const k of ["tasks", "exams", "subjects", "settings", "timetable"])
      assert.deepEqual(state[k], original[k]);
    assert.equal(state.version, 4);
    assert.equal(state.tasks.length, 1);
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("studyflow-classroom-config"),
      ),
      null,
    );
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("studyflow-classroom-cache"),
      ),
      null,
    );
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("studyflow-backup-before-v4"))
            .imported,
      ),
      JSON.stringify(cache),
    );
    await nav("⚙ Ajustes");
    await page
      .getByRole("button", { name: "Conservar como tarea local", exact: true })
      .first()
      .click();
    assert.equal(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("studyflow-v1")).tasks.length,
      ),
      2,
    );
    await page.reload();
    assert.equal(
      await page
        .getByRole("button", { name: "Conservada como local", exact: true })
        .count(),
      1,
    );
    await nav("◎ Notas");
    const g = page.locator("#gradeForm");
    await g.locator("[name=subjectId]").selectOption("s");
    await g.locator("[name=title]").fill("Examen DNS");
    await g.locator("[name=weight]").fill("40");
    await g.locator("[name=score]").fill("8");
    await page
      .getByRole("button", { name: "Guardar nota", exact: true })
      .click();
    await g.locator("[name=subjectId]").selectOption("s");
    await g.locator("[name=title]").fill("Trabajo de zonas");
    await g.locator("[name=weight]").fill("60");
    await page
      .getByRole("button", { name: "Guardar nota", exact: true })
      .click();
    assert.match(
      await page.locator("main").innerText(),
      /necesitas 3 de media/,
    );
    await page
      .locator(".record-row")
      .filter({ hasText: "Trabajo de zonas" })
      .getByRole("button", { name: "Editar", exact: true })
      .click();
    await g.locator("[name=score]").fill("6");
    await page
      .getByRole("button", { name: "Guardar nota", exact: true })
      .click();
    assert.match(await page.locator("main").innerText(), /6,8/);
    assert.equal(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("studyflow-v1")).grades.length,
      ),
      2,
    );
    await nav("▤ Apuntes");
    await page.getByRole("button", { name: "＋ Nuevo apunte" }).click();
    await page.locator("#noteForm [name=title]").fill("DNS seguro");
    await page.locator("#noteForm [name=subjectId]").selectOption("s");
    await page
      .locator("#noteForm [name=content]")
      .fill("# Redes\n**BIND9** y *zonas*\n<script>window.injected=1</script>");
    assert.equal(await page.locator("#notePreview script").count(), 0);
    assert.equal(
      await page.locator("#notePreview strong").innerText(),
      "BIND9",
    );
    assert.equal(await page.evaluate(() => window.injected), undefined);
    await page
      .getByRole("button", { name: "Marcar favorito", exact: true })
      .click();
    await page.reload();
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("studyflow-v1")).notes[0].favorite,
      ),
      true,
    );
    assert.equal(
      await page.getByRole("button", { name: /DNS seguro/ }).count(),
      1,
    );
    await nav("◇ Prácticas de FP");
    const p = page.locator("#practiceForm");
    assert.equal(await p.locator("[name=start]").inputValue(), "");
    await p.locator("[name=start]").fill("2026-11-16");
    await p.locator("[name=amount]").fill("3");
    await p.locator("[name=company]").fill("Empresa de prácticas");
    await p.locator("[name=timeStart]").fill("09:00");
    await p.locator("[name=timeEnd]").fill("14:00");
    await p.locator("[name=totalHours]").fill("400");
    await page
      .getByRole("button", { name: "Guardar prácticas", exact: true })
      .click();
    assert.equal(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("studyflow-v1")).practice.end,
      ),
      "2027-02-16",
    );
    await page.locator("#attendanceForm [name=date]").fill("2026-11-16");
    await page.locator("#attendanceForm [name=hours]").fill("5");
    await page.getByRole("button", { name: "Guardar asistencia" }).click();
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("studyflow-v1")).practice.logs.length,
      ),
      1,
    );
    await page.locator("#exceptionForm [name=date]").fill("2026-11-21");
    await page.locator("#exceptionForm [name=attend]").selectOption("yes");
    await page.getByRole("button", { name: "Guardar excepción" }).click();
    await nav("▦ Calendario");
    await page.locator("#calendarMonth").fill("2026-11");
    assert.equal(
      await page.locator('[data-date="2026-11-21"] .practice-event').count(),
      1,
    );
    assert.equal(
      await page
        .locator('[data-date="2026-11-21"]')
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(88, 28, 135)",
    );
    await page.locator("#calendarMonth").fill("2026-12");
    assert.equal(
      await page.locator('[data-date="2026-12-25"] .practice-event').count(),
      1,
    );
    assert.equal(
      await page
        .locator('[data-date="2026-12-25"]')
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(127, 29, 29)",
    );
    await page.locator('[data-date="2026-12-25"] .day-number').click();
    assert.match(
      await page.locator("#dayReasons").innerText(),
      /Jornada programada/,
    );
    await page.locator("#closeDay").click();
    await nav("♧ Recordatorios");
    assert.match(
      await page.locator("main").innerText(),
      /Vence mañana: Tarea conservada/,
    );
    const before = await page.locator("[data-reminder-dismiss]").count();
    await page.locator("[data-reminder-dismiss]").first().click();
    await page.reload();
    assert.equal(
      await page.locator("[data-reminder-dismiss]").count(),
      before - 1,
    );
    await nav("◉ Estudio");
    await page.locator("#studySettings [name=focus]").fill("1");
    await page.getByRole("button", { name: "Guardar duraciones" }).click();
    await page.locator("#studySubject").selectOption("s");
    await page.getByRole("button", { name: "Iniciar", exact: true }).click();
    await page.clock.fastForward(20000);
    await page.getByRole("button", { name: "Pausar", exact: true }).click();
    const paused = await page.evaluate(
      () => JSON.parse(localStorage.getItem("studyflow-v1")).pomodoro.remaining,
    );
    assert(paused <= 40 && paused > 35);
    await page.reload();
    await page.clock.fastForward(120000);
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("studyflow-v1")).studySessions
            ?.length || 0,
      ),
      0,
    );
    await page.locator("#studySettings [name=focus]").fill("2");
    await page.getByRole("button", { name: "Guardar duraciones" }).click();
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("studyflow-v1")).pomodoro.remaining,
      ),
      paused,
    );
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.clock.fastForward(45000);
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("studyflow-v1")).studySessions.length,
      ),
      1,
    );
    await page.reload();
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("studyflow-v1")).studySessions.length,
      ),
      1,
    );
    await page.getByRole("button", { name: "Iniciar", exact: true }).click();
    await page.evaluate(() => {
      window.testHidden = true;
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => window.testHidden,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.clock.fastForward(121000);
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("studyflow-v1")).studySessions.length,
      ),
      2,
    );
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("studyflow-v1")).pomodoro.notified,
      ),
      false,
    );
    await page.evaluate(() => {
      window.testHidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("studyflow-v1")).pomodoro.notified,
      ),
      true,
    );
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("studyflow-v1")).studySessions.length,
      ),
      2,
    );
    await nav("▥ Estadísticas");
    assert.equal(await page.locator(".bar-chart").count(), 2);
    assert.equal(await page.locator(".line-chart").count(), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(
      () =>
        document.getElementById("sidebar").getBoundingClientRect().right <= 0,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: "/tmp/studyflow-v4-stats-mobile.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Abrir menú" }).click();
    await nav("⚙ Ajustes");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar copia JSON" }).click();
    const dl = await downloadPromise;
    const fs = require("node:fs"),
      exported = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
    for (const k of [
      "grades",
      "notes",
      "studySessions",
      "practice",
      "timetable",
      "dismissedReminders",
      "importArchive",
    ])
      assert(exported[k]);
    assert.deepEqual(exported.tasks[0], original.tasks[0]);
    assert.deepEqual(exported.exams, original.exams);
    assert.deepEqual(exported.settings, original.settings);
    page.once("dialog", (d) => d.accept());
    await page.locator("#importFile").setInputFiles({
      name: "v4.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(exported)),
    });
    await page
      .getByRole("status")
      .filter({ hasText: "Copia importada correctamente." })
      .waitFor();
    assert.deepEqual(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("studyflow-v1")),
      ),
      exported,
    );
    assert(
      !requests.some((url) =>
        /accounts\.google|classroom\.googleapis|openidconnect/.test(url),
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: v3 migration and archive conversion, no external requests, grades and targets, safe notes/autosave, practice dates/attendance/calendar colors, stable reminders, timer pause/reload/completion, stats, responsive and full JSON round trip with personal data preserved.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
