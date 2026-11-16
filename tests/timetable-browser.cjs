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
    await page.clock.setFixedTime(new Date("2026-11-16T07:45:00Z"));
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:8000/#timetable");
    const original = {
      version: 3,
      tasks: [
        {
          id: "p",
          name: "Personal conservada",
          subject: "Física",
          due: "2027-01-08",
          priority: "high",
          done: false,
        },
      ],
      exams: [
        {
          id: "e",
          name: "Examen conservado",
          subject: "Física",
          date: "2027-01-09",
        },
      ],
      subjects: [{ id: "s", name: "Física", color: "#aabbcc" }],
      settings: { name: "Ana", extra: "keep" },
    };
    await page.evaluate(
      (s) => localStorage.setItem("studyflow-v1", JSON.stringify(s)),
      original,
    );
    await page.reload();
    assert.match(await page.locator("main").innerText(), /horario está vacío/);
    assert.equal(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("studyflow-v1")).timetable,
      ),
      undefined,
    );
    await page.getByRole("button", { name: "＋ Nuevo bloque" }).click();
    const form = page.locator("#ttForm");
    await form.locator("[name=day]").selectOption("1");
    await form.locator("[name=subject]").selectOption("s");
    await form.locator("[name=start]").fill("08:30");
    await form.locator("[name=end]").fill("09:30");
    await form.locator("[name=room]").fill("A1");
    await form.locator("[name=teacher]").fill("María");
    await page
      .getByRole("button", { name: "Guardar bloque", exact: true })
      .click();
    assert.equal(await page.locator(".tt-cell.tt-current").count(), 1);
    await page.locator(".tt-cell button").first().click();
    await form.locator("[name=end]").fill("09:25");
    await page
      .getByRole("button", { name: "Guardar bloque", exact: true })
      .click();
    assert.match(await page.locator(".tt-table").innerText(), /09:25/);
    await page.getByRole("button", { name: "＋ Nuevo bloque" }).click();
    await form.locator("[name=day]").selectOption("1");
    await form.locator("[name=type]").selectOption("break");
    await form.locator("[name=start]").fill("09:25");
    await form.locator("[name=end]").fill("09:40");
    await page
      .getByRole("button", { name: "Guardar bloque", exact: true })
      .click();
    assert.equal(await page.locator(".tt-cell.break").count(), 1);
    await page.locator("#ttCopy [name=from]").selectOption("1");
    await page.locator("#ttCopy [name=to]").selectOption("2");
    await page.locator("#ttCopy button").click();
    assert.equal(await page.locator(".tt-cell").count(), 4);
    await page.getByRole("button", { name: "＋ Nuevo bloque" }).click();
    await form.locator("[name=day]").selectOption("3");
    page.once("dialog", (d) => d.accept("Programación"));
    await page
      .getByRole("button", { name: "Crear asignatura", exact: true })
      .click();
    await form.locator("[name=start]").fill("08:30");
    await form.locator("[name=end]").fill("09:30");
    await page
      .getByRole("button", { name: "Guardar bloque", exact: true })
      .click();
    await page.reload();
    assert.equal(await page.locator(".tt-cell").count(), 5);
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("studyflow-v1")),
    );
    for (const key of ["tasks", "exams", "settings"])
      assert.deepEqual(saved[key], original[key]);
    page.once("dialog", (d) => d.accept("Semana B"));
    await page
      .getByRole("button", { name: "Nuevo horario", exact: true })
      .click();
    assert.match(await page.locator("main").innerText(), /horario está vacío/);
    await page.getByRole("button", { name: "＋ Nuevo bloque" }).click();
    await form.locator("[name=type]").selectOption("free");
    await form.locator("[name=start]").fill("10:00");
    await form.locator("[name=end]").fill("11:00");
    await page
      .getByRole("button", { name: "Guardar bloque", exact: true })
      .click();
    await page.locator(".tt-cell button").first().click();
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Eliminar bloque", exact: true })
      .click();
    assert.match(await page.locator("main").innerText(), /horario está vacío/);
    await page.locator("#ttSchedule").selectOption("default");
    assert.equal(await page.locator(".tt-cell").count(), 5);
    await page.getByRole("link", { name: "◈ Panel principal" }).click();
    await page.getByRole("heading", { name: "Horario de hoy" }).waitFor();
    assert.match(
      await page.locator(".timetable-summary").innerText(),
      /Física/,
    );
    await page.clock.setFixedTime(new Date("2026-12-28T07:45:00Z"));
    await page.reload();
    assert.match(
      await page.locator(".timetable-summary").innerText(),
      /Hoy no hay clases/,
    );
    await page.getByRole("link", { name: "◷ Horario" }).click();
    await page.locator("#ttSchedule").waitFor();
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
      path: "/tmp/studyflow-timetable-mobile.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Abrir menú" }).click();
    await page.getByRole("link", { name: "⚙ Ajustes" }).click();
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar copia JSON" }).click();
    const download = await downloaded;
    const fs = require("node:fs");
    const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    assert.equal(exported.timetable.schedules[0].blocks.length, 5);
    assert.equal(exported.timetable.schedules.length, 2);
    page.once("dialog", (d) => d.accept());
    await page.locator("#importFile").setInputFiles({
      name: "horarios.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(exported)),
    });
    await page
      .getByRole("status")
      .filter({ hasText: "Copia importada correctamente." })
      .waitFor();
    assert.deepEqual(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("studyflow-v1")).timetable,
      ),
      exported.timetable,
    );
    page.once("dialog", (d) => d.accept());
    await page.locator("#importFile").setInputFiles({
      name: "copia-antigua.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(original)),
    });
    await page
      .getByRole("status")
      .filter({ hasText: "Copia importada correctamente." })
      .waitFor();
    assert.deepEqual(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("studyflow-v1")).timetable,
      ),
      exported.timetable,
    );
    const beforeInvalid = await page.evaluate(() =>
      localStorage.getItem("studyflow-v1"),
    );
    const invalid = structuredClone(exported);
    invalid.timetable.schedules[0].blocks[0].day = 7;
    await page.locator("#importFile").setInputFiles({
      name: "horario-invalido.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(invalid)),
    });
    await page
      .getByRole("status")
      .filter({ hasText: "No se ha importado:" })
      .waitFor();
    assert.equal(
      await page.evaluate(() => localStorage.getItem("studyflow-v1")),
      beforeInvalid,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: empty initial schedule, subject/time/color class creation, editing, break, day copying, profiles, dashboard current class, holidays, persistence, JSON backup, personal data preservation and mobile.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
