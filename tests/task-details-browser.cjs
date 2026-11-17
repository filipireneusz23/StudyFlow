const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:8000");
    const original = {
      version: 4,
      tasks: [
        {
          id: "old",
          name: "Tarea previa",
          subject: "Redes",
          due: "2026-11-18",
          done: false,
          priority: "high",
          custom: "conservar",
        },
      ],
      exams: [
        { id: "exam", name: "Examen", subject: "Redes", date: "2026-11-20" },
      ],
      subjects: [{ id: "s", name: "Redes", color: "#123456" }],
      settings: { name: "Ana" },
    };
    await page.evaluate(
      (s) => localStorage.setItem("studyflow-v1", JSON.stringify(s)),
      original,
    );
    await page.reload();
    const stored = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("studyflow-v1")));
    assert.deepEqual(await stored(), original);
    async function nav(name) {
      const a = page.getByRole("link", { name });
      const hash = await a.getAttribute("href");
      await a.click();
      await page.waitForFunction(
        (h) =>
          document
            .querySelector('nav a[aria-current="page"]')
            ?.getAttribute("href") === h,
        hash,
      );
    }
    await nav(/Tareas/);
    await page
      .locator(".task-row")
      .getByRole("button", { name: "Detalles", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Editar tarea", exact: true })
      .click();
    const notes =
      'Ejercicios 2 y 3\n<img src=x onerror="window.injected=true">';
    await page.locator("[name=taskNotes]").fill(notes);
    for (const [label, url] of [
      [
        "Abrir actividad en Classroom",
        "https://classroom.google.com/c/123/a/456",
      ],
      ["<b>Manual</b>", "http://example.com/manual"],
    ]) {
      await page.locator("#addTaskLink").click();
      const row = page.locator(".task-link-draft").last();
      await row.locator("[data-link-label]").fill(label);
      await row.locator("[data-link-url]").fill(url);
    }
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await page.reload();
    await page
      .locator(".task-row")
      .getByRole("button", { name: "Detalles", exact: true })
      .click();
    assert.equal(await page.locator("#taskDetailsNotes").textContent(), notes);
    assert.equal(await page.locator("#taskDetailsNotes img").count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    const link = page.locator("#taskDetailsLinks a").first();
    assert.equal(await link.getAttribute("target"), "_blank");
    assert.equal(await link.getAttribute("rel"), "noopener noreferrer");
    assert.equal(
      await link.getAttribute("href"),
      "https://classroom.google.com/c/123/a/456",
    );
    await page
      .getByRole("button", { name: "Editar tarea", exact: true })
      .click();
    await page
      .locator(".task-link-draft")
      .last()
      .getByRole("button", { name: "Eliminar enlace" })
      .click();
    await page.locator("[data-link-label]").fill("Actividad actualizada");
    const savedBeforeInvalid = await stored();
    await page.locator("[data-link-url]").fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    assert.deepEqual(await stored(), savedBeforeInvalid);
    await page
      .locator("[data-link-url]")
      .fill("https://example.com/actualizada");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    let data = await stored();
    assert.equal(data.tasks[0].links.length, 1);
    assert.equal(data.tasks[0].links[0].url, "https://example.com/actualizada");
    assert.equal(data.tasks[0].custom, "conservar");
    assert.deepEqual(data.exams, original.exams);
    assert.deepEqual(data.subjects, original.subjects);
    await page.getByRole("button", { name: "＋ Nueva tarea" }).click();
    await page.locator("#itemForm [name=name]").fill("Nueva");
    await page.locator("[name=taskNotes]").fill("Instrucciones nuevas");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    assert.equal((await stored()).tasks[1].notes, "Instrucciones nuevas");
    await nav("⚙ Ajustes");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar copia JSON" }).click();
    const exported = JSON.parse(
      fs.readFileSync(await (await download).path(), "utf8"),
    );
    assert.deepEqual(exported.tasks, (await stored()).tasks);
    page.once("dialog", (d) => d.accept());
    await page.locator("#importFile").setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(exported)),
    });
    await page
      .getByRole("status")
      .filter({ hasText: "Copia importada correctamente." })
      .waitFor();
    assert.deepEqual((await stored()).tasks, exported.tasks);
    const bad = structuredClone(exported);
    bad.tasks[0].links[0].url = "javascript:alert(1)";
    const before = await stored();
    page.once("dialog", (d) => d.accept());
    await page.locator("#importFile").setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(bad)),
    });
    await page
      .getByRole("status")
      .filter({ hasText: /No se ha importado/ })
      .waitFor();
    assert.deepEqual(await stored(), before);
    await nav(/Tareas/);
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .locator(".task-row")
      .getByRole("button", { name: "Detalles", exact: true })
      .first()
      .click();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log(
      "Task notes/links: persistence, old tasks, editing, safe text, export/import, invalid backup and mobile passed",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
