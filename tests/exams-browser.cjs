const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 0 /Kids [] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF",
);
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        timezoneId: "Europe/Madrid",
      }),
      page = await context.newPage();
    const errors = [],
      requests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => requests.push(r.url()));
    await page.clock.setFixedTime(new Date("2026-11-17T11:00:00Z"));
    await page.goto("http://127.0.0.1:8000");
    const original = {
      version: 4,
      tasks: [
        {
          id: "task",
          name: "Conservar tarea",
          subject: "Redes",
          due: "2026-11-18",
          priority: "high",
          done: false,
          notes: "Nota de tarea",
          links: [{ label: "Manual", url: "https://example.com/" }],
        },
      ],
      exams: [
        {
          id: "legacy",
          name: "Antiguo",
          subject: "Redes",
          date: "2026-11-18",
          custom: "conservar",
        },
        { id: "past", name: "Pasado", subject: "Redes", date: "2026-11-01" },
      ],
      subjects: [{ id: "s", name: "Redes", color: "#123456" }],
      settings: { name: "Ana", other: "keep" },
    };
    await page.evaluate(
      (s) => localStorage.setItem("studyflow-v1", JSON.stringify(s)),
      original,
    );
    await page.reload();
    const stored = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("studyflow-v1")));
    assert.deepEqual(await stored(), original);
    async function nav(hash) {
      await page.evaluate((h) => (location.hash = h), hash);
      await page.waitForFunction(
        (h) =>
          document
            .querySelector('nav a[aria-current="page"]')
            ?.getAttribute("href") === h,
        hash,
      );
    }
    await nav("#exams");
    assert.deepEqual(
      await page
        .locator("#examList [data-exam-id]")
        .evaluateAll((es) => es.map((e) => e.dataset.examId)),
      ["legacy", "past"],
    );
    await page.locator("#examFilter").selectOption("past");
    assert.equal(
      await page.locator("#examList .item-title").textContent(),
      "Pasado",
    );
    await page.locator("#examFilter").selectOption("all");
    await page
      .locator("[data-exam-id=legacy]")
      .getByRole("button", { name: "Detalles", exact: true })
      .click();
    assert.equal(
      await page.locator("#examDetailsNotes").textContent(),
      "Sin notas.",
    );
    await page.locator("#editExamDetails").click();
    const notes = "Estudiar temas 2–5\n<script>window.injected=true</script>";
    await page.locator("[name=taskNotes]").fill(notes);
    await page.locator("[name=dueTime]").fill("14:30");
    await page.locator("#addTaskLink").click();
    await page.locator("[data-link-label]").fill("Ver material en Classroom");
    await page.locator("[data-link-url]").fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    assert.deepEqual(await stored(), original);
    await page
      .locator("[data-link-url]")
      .fill("https://classroom.google.com/c/123/a/456");
    await page.locator("#examPdfInput").setInputFiles([
      { name: "Tema 2.pdf", mimeType: "application/pdf", buffer: PDF },
      { name: "Tema 3.pdf", mimeType: "application/pdf", buffer: PDF },
    ]);
    await page
      .locator("#examFileMessage")
      .filter({ hasText: "PDF preparados." })
      .waitFor();
    assert.equal(await page.locator("#examPdfDraft .pdf-row").count(), 2);
    assert.equal(
      await page.evaluate(async () => (await ExamFiles.all()).length),
      0,
    );
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await page.locator("#editor").waitFor({ state: "hidden" });
    await page.reload();
    let state = await stored();
    assert.equal(state.exams[0].notes, notes);
    assert.equal(state.exams[0].time, "14:30");
    assert.equal(state.exams[0].custom, "conservar");
    assert.equal(state.exams[0].pdfs.length, 2);
    assert.deepEqual(state.tasks, original.tasks);
    assert.deepEqual(state.settings, original.settings);
    assert.deepEqual(state.subjects, original.subjects);
    assert(!JSON.stringify(state).includes("%PDF-"));
    const ids = state.exams[0].pdfs.map((p) => p.id);
    assert.equal(
      await page.evaluate(async () => (await ExamFiles.all()).length),
      2,
    );
    await page
      .locator("[data-exam-id=legacy]")
      .getByRole("button", { name: "Detalles", exact: true })
      .click();
    assert.equal(await page.locator("#examDetailsNotes").textContent(), notes);
    assert.equal(await page.locator("#examDetailsNotes script").count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    const link = page.locator("#examDetailsLinks a");
    assert.equal(await link.getAttribute("target"), "_blank");
    assert.equal(await link.getAttribute("rel"), "noopener noreferrer");
    await context.route("https://classroom.google.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<title>Actividad de prueba</title>",
      }),
    );
    const popupPromise = page.waitForEvent("popup");
    await link.click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert.equal(popup.url(), "https://classroom.google.com/c/123/a/456");
    assert.equal(await popup.evaluate(() => window.opener), null);
    await popup.close();
    const downloaded = page.waitForEvent("download");
    await page.locator("#examDetailsPdfs [data-pdf-download]").first().click();
    assert.deepEqual(fs.readFileSync(await (await downloaded).path()), PDF);
    // Verify open uses a local PDF blob and protected new tab, without external requests.
    await page.evaluate(() => {
      window.pdfOpened = null;
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.href.startsWith("blob:") && this.target === "_blank") {
          window.pdfOpened = { href: this.href, rel: this.rel };
          return;
        }
        return click.call(this);
      };
    });
    await page.locator("#examDetailsPdfs [data-pdf-open]").first().click();
    await page.waitForFunction(() => window.pdfOpened);
    assert.equal(
      await page.evaluate(() => window.pdfOpened.rel),
      "noopener noreferrer",
    );
    assert.equal(
      await page.evaluate(async () =>
        (await fetch(window.pdfOpened.href)).headers.get("content-type"),
      ),
      "application/pdf",
    );
    await page.locator("#studyExamDetails").click();
    await page.evaluate(() => {
      window.copied = [];
      window.opened = [];
      window.open = (...args) => {
        window.opened.push(args);
        return null;
      };
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (text) => window.copied.push(text) },
      });
    });
    for (const mode of ["summary", "quiz", "mock", "flashcards"]) {
      await page.locator(`[data-exam-prompt=${mode}]`).click();
      assert((await page.locator("#examPrompt").inputValue()).includes(notes));
      assert(
        (await page.locator("#examPrompt").inputValue()).includes("Tema 2.pdf"),
      );
      assert(
        (await page.locator("#examPromptMessage").textContent()).includes(
          "Hemos copiado",
        ),
      );
    }
    assert.equal(await page.evaluate(() => window.copied.length), 4);
    assert.equal(
      await page.evaluate(() =>
        window.opened.every(
          (x) =>
            x[0] === "https://chatgpt.com/" && x[2] === "noopener,noreferrer",
        ),
      ),
      true,
    );
    await page.evaluate(
      () =>
        (navigator.clipboard.writeText = async () => {
          throw Error("denied");
        }),
    );
    await page.locator("[data-exam-prompt=summary]").click();
    assert(
      (await page.locator("#examPromptMessage").textContent()).includes(
        "No se pudo copiar",
      ),
    );
    await page.locator("#closeExamDetails").click();
    // Removing a file and cancelling must retain the original blob and metadata.
    await page
      .locator("[data-exam-id=legacy]")
      .getByRole("button", { name: "Editar", exact: true })
      .click();
    page.once("dialog", (d) => d.accept());
    await page.locator("[data-pdf-remove]").first().click();
    await page.locator("#cancelDialog").click();
    assert.equal((await stored()).exams[0].pdfs.length, 2);
    assert(
      await page.evaluate(
        async (id) => Boolean(await ExamFiles.get(id)),
        ids[0],
      ),
    );
    await page
      .locator("[data-exam-id=legacy]")
      .getByRole("button", { name: "Editar", exact: true })
      .click();
    page.once("dialog", (d) => d.accept());
    await page.locator("[data-pdf-remove]").first().click();
    await page.locator("[data-link-label]").fill("Material actualizado");
    await page.locator("[data-link-url]").fill("https://example.com/apuntes");
    await page.locator("[name=taskNotes]").fill("Notas editadas\nOtra línea");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await page.locator("#editor").waitFor({ state: "hidden" });
    assert.equal((await stored()).exams[0].pdfs.length, 1);
    assert.equal(
      await page.evaluate(
        async (id) => Boolean(await ExamFiles.get(id)),
        ids[0],
      ),
      false,
    );
    // Create undated exam and ensure cancelled/invalid uploads never affect state.
    await page.getByRole("button", { name: "＋ Examen", exact: true }).click();
    await page.locator("#itemForm [name=name]").fill("Sin fecha");
    await page.locator("#itemForm [name=date]").fill("");
    await page.locator("[name=taskNotes]").fill("Nuevo examen");
    await page.locator("#examPdfInput").setInputFiles({
      name: "fake.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("not a pdf"),
    });
    await page
      .locator("#examFileMessage")
      .filter({ hasText: "no es un PDF válido" })
      .waitFor();
    assert.equal(await page.locator("#examPdfDraft .pdf-row").count(), 0);
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await page.locator("#editor").waitFor({ state: "hidden" });
    assert((await stored()).exams[2].createdAt);
    assert.equal((await stored()).exams[2].date, "");
    await page.locator("#examFilter").selectOption("undated");
    assert.equal(await page.locator("#examList [data-exam-id]").count(), 1);
    await page.locator("#examFilter").selectOption("all");
    await page.locator("#examOrder").selectOption("created");
    assert.equal(
      await page.locator("#examList .item-title").first().textContent(),
      "Sin fecha",
    );
    // Full backup, restore in a clean browser context, and normal JSON compatibility.
    await nav("#settings");
    let dl = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: "Exportar copia completa con PDF",
        exact: true,
      })
      .click();
    const full = JSON.parse(fs.readFileSync(await (await dl).path(), "utf8"));
    assert.equal(full.attachments.length, 1);
    assert.equal(full.format, "studyflow-complete-v1");
    assert.equal(
      Buffer.from(full.attachments[0].data, "base64").toString(),
      PDF.toString(),
    );
    const fresh = await browser.newContext({
        viewport: { width: 390, height: 844 },
      }),
      other = await fresh.newPage();
    await other.goto("http://127.0.0.1:8000/#settings");
    other.once("dialog", (d) => d.accept());
    await other.locator("#completeImportFile").setInputFiles({
      name: "full.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(full)),
    });
    await other
      .getByRole("status")
      .filter({ hasText: "Copia completa importada correctamente" })
      .waitFor();
    const recovered = await other.evaluate(() =>
      JSON.parse(localStorage.getItem("studyflow-v1")),
    );
    assert.deepEqual(recovered.tasks, original.tasks);
    assert.equal(recovered.exams[0].notes, "Notas editadas\nOtra línea");
    assert.equal(
      await other.evaluate(
        async (id) => (await ExamFiles.get(id)).blob.size,
        recovered.exams[0].pdfs[0].id,
      ),
      PDF.length,
    );
    await other.reload();
    await other.evaluate(() => (location.hash = "#exams"));
    await other.locator("#examList").waitFor();
    assert(
      await other.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await other.locator("[data-exam-id=legacy] [data-exam-details]").click();
    assert(
      await other.evaluate(
        () =>
          document.getElementById("examDetails").getBoundingClientRect()
            .width <= innerWidth,
      ),
    );
    await other.screenshot({
      path: "/tmp/studyflow-exams-mobile.png",
      fullPage: true,
    });
    await fresh.close();
    dl = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Exportar copia JSON", exact: true })
      .click();
    const normal = JSON.parse(fs.readFileSync(await (await dl).path(), "utf8"));
    assert.equal(normal.exams[0].pdfs.length, 1);
    assert(!JSON.stringify(normal).includes("%PDF-"));
    page.once("dialog", (d) => d.accept());
    await page.locator("#importFile").setInputFiles({
      name: "normal.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(normal)),
    });
    await page
      .getByRole("status")
      .filter({ hasText: "Copia importada correctamente." })
      .waitFor();
    assert.deepEqual(await stored(), normal);
    // Malformed full backup must not replace data or stored blobs.
    const bad = structuredClone(full);
    bad.attachments[0].data = btoa("bad pdf");
    const before = await stored();
    await page.locator("#completeImportFile").setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(bad)),
    });
    await page
      .getByRole("status")
      .filter({ hasText: "No se ha importado la copia completa" })
      .waitFor();
    assert.deepEqual(await stored(), before);
    assert.deepEqual(errors, []);
    assert(
      !requests.some(
        (url) =>
          /^https?:/.test(url) && !url.startsWith("http://127.0.0.1:8000"),
      ),
    );
    console.log(
      "PASS advanced exams: legacy data, notes, safe links, PDF create/persist/open/download/remove, cancelled edits, prompts, sorting, complete backup to fresh browser, JSON compatibility, corrupt backup, mobile and no external API requests.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
