const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "America/Los_Angeles",
  });
  await page.clock.setFixedTime(new Date("2026-11-15T12:00:00Z"));
  async function navigate(name) {
    const link = page.getByRole("link", { name });
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
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const legacy = {
    tasks: [
      {
        id: "old-task",
        name: "Entrega antigua",
        subject: "Física",
        due: "2026-11-15",
        done: false,
      },
    ],
    exams: [
      {
        id: "old-exam",
        name: "Examen antiguo",
        subject: "Física",
        date: "2026-11-18",
      },
    ],
  };
  await page.goto("http://127.0.0.1:8000");
  await page.evaluate(
    (s) => localStorage.setItem("studyflow-v1", JSON.stringify(s)),
    legacy,
  );
  await page.reload();
  assert.equal(
    await page.getByText("Entrega antigua", { exact: true }).count(),
    1,
  );
  assert.deepEqual(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("studyflow-backup-before-v3")),
    ),
    legacy,
  );
  await navigate("▤ Asignaturas");
  await page.locator("#subjectForm input[name=name]").fill("Matemáticas");
  await page.getByRole("button", { name: "Añadir asignatura" }).click();
  await navigate(/Tareas/);
  await page.getByRole("button", { name: "＋ Nueva tarea" }).click();
  await page.locator("#itemForm input[name=name]").fill("Álgebra");
  await page
    .locator("#itemForm select[name=subject]")
    .selectOption("Matemáticas");
  await page.locator("#itemForm input[name=date]").fill("2026-11-20");
  await page.locator("#itemForm select[name=priority]").selectOption("high");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  assert.equal(await page.locator(".priority-high").count(), 1);
  await navigate("▦ Calendario");
  assert.equal(
    await page.locator('[data-date="2026-11-15"] .event').innerText(),
    "☑ Entrega antigua",
  );
  assert.equal(
    await page.locator('[data-date="2026-11-18"] .event').innerText(),
    "◇ Examen antiguo",
  );
  assert.equal(
    await page.locator('[data-date="2026-11-20"] .event').innerText(),
    "☑ Álgebra",
  );
  await page.locator('[data-date="2026-11-20"] .event').click();
  await page.locator("#itemForm input[name=date]").fill("2026-12-01");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  assert.equal(
    await page.locator('[data-date="2026-11-20"] .event').count(),
    0,
  );
  await page.getByRole("button", { name: "Mes siguiente" }).click();
  assert.equal(
    await page.locator('[data-date="2026-12-01"] .event').innerText(),
    "☑ Álgebra",
  );
  await navigate(/Tareas/);
  await page.getByRole("checkbox", { name: "Completar Álgebra" }).click();
  await page.getByRole("button", { name: "Completadas", exact: true }).click();
  assert.equal(await page.getByText("Álgebra", { exact: true }).count(), 1);
  await page.reload();
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("studyflow-v1")).tasks.find(
          (t) => t.name === "Álgebra",
        ).done,
    ),
    true,
  );
  await navigate("⚙ Ajustes");
  await page.locator("#profileForm input").fill("Irene");
  await page.getByRole("button", { name: "Guardar ajustes" }).click();
  await navigate("◈ Panel principal");
  assert.match(await page.locator("h1").innerText(), /Irene/);
  await page.screenshot({ path: "/tmp/studyflow-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await navigate("▦ Calendario");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.waitForFunction(
    () => document.getElementById("sidebar").getBoundingClientRect().right <= 0,
  );
  await page.screenshot({ path: "/tmp/studyflow-mobile.png", fullPage: true });
  // Create, edit and delete an exam through the same calendar workflow.
  await page.getByRole("button", { name: "＋ Examen" }).click();
  await page.locator("#itemForm input[name=name]").fill("Examen nuevo");
  await page.locator("#itemForm input[name=date]").fill("2026-11-25");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.locator('[data-date="2026-11-25"] .exam').click();
  await page.locator("#itemForm input[name=name]").fill("Examen editado");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  assert.equal(
    await page.locator('[data-date="2026-11-25"] .exam').innerText(),
    "◇ Examen editado",
  );
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await navigate(/Tareas/);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Eliminar Examen editado", exact: true })
    .click();
  assert.equal(
    await page.getByText("Examen editado", { exact: true }).count(),
    0,
  );
  // Export and round-trip import preserve saved records.
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await navigate("⚙ Ajustes");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar copia JSON" }).click();
  const download = await downloaded;
  assert.equal(download.suggestedFilename(), "studyflow-datos.json");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("studyflow-v1")),
  );
  page.once("dialog", (d) => d.accept());
  await page.locator("#importFile").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await page
    .getByRole("status")
    .filter({ hasText: "Copia importada correctamente." })
    .waitFor();
  assert.deepEqual(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("studyflow-before-import")),
    ),
    saved,
  );
  // Malformed storage must remain untouched, with a visible recovery message.
  await page.evaluate(() => localStorage.setItem("studyflow-v1", "{broken"));
  await page.reload();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("studyflow-v1")),
    "{broken",
  );
  assert.equal(await page.getByRole("alert").count(), 1);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "PASS: legacy data, backup, subjects, priorities, calendar dates, editing, completion, persistence, settings, mobile, corrupt-storage protection; no browser errors.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
