const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:8000");
    // Real IndexedDB, including atomic abort when a later write fails synchronously.
    const results = await page.evaluate(async () => {
      const record = async (name = "tema.pdf") =>
        (
          await ExamFiles.prepare(
            [
              new File(["%PDF-1.4\ncontent\n%%EOF"], name, {
                type: "application/pdf",
              }),
            ],
            "exam",
          )
        )[0];
      const first = await record();
      await ExamFiles.apply([first]);
      let duplicate = "";
      try {
        await ExamFiles.apply([first]);
      } catch (error) {
        duplicate = error.message;
      }
      const another = await record("otro.pdf"),
        third = await record("tercero.pdf");
      const original = IDBObjectStore.prototype.add;
      let count = 0;
      IDBObjectStore.prototype.add = function (...args) {
        if (++count === 2)
          throw new DOMException(
            "Injected quota failure",
            "QuotaExceededError",
          );
        return original.apply(this, args);
      };
      let quota = "";
      try {
        await ExamFiles.apply([another, third]);
      } catch (error) {
        quota = error.message;
      } finally {
        IDBObjectStore.prototype.add = original;
      }
      const atomic = (await ExamFiles.all()).map((x) => x.id);
      const state = {
        version: 4,
        tasks: [],
        exams: [
          {
            id: "exam",
            name: "Prueba",
            subject: "Redes",
            date: "",
            pdfs: [ExamFiles.meta(first)],
          },
        ],
        subjects: [],
        settings: { name: "" },
      };
      const bundle = await ExamFiles.bundle(state);
      const restored = await ExamFiles.decode(bundle);
      const idReused =
        restored.next.exams[0].pdfs[0].id === first.id &&
        restored.records.length === 0;
      // Same identifier and same length, changed content: assign a fresh ID, never overwrite.
      const otherText = "%PDF-1.4\nchanged\n%%EOF";
      const changed = structuredClone(bundle);
      changed.attachments[0].data = btoa(otherText);
      changed.attachments[0].size = otherText.length;
      changed.state.exams[0].pdfs[0].size = otherText.length;
      const different = await ExamFiles.decode(changed);
      await ExamFiles.apply(different.records);
      const originalRetained =
        (await ExamFiles.get(first.id)).blob.size === first.blob.size &&
        different.next.exams[0].pdfs[0].id !== first.id;
      let invalidType = "",
        tooLarge = "";
      try {
        await ExamFiles.validate(
          new File(["%PDF-1.4"], "test.html", { type: "text/html" }),
        );
      } catch (error) {
        invalidType = error.message;
      }
      try {
        await ExamFiles.validate({
          size: ExamFiles.MAX_FILE + 1,
          name: "large.pdf",
          type: "application/pdf",
        });
      } catch (error) {
        tooLarge = error.message;
      }
      await ExamFiles.apply([], [first.id]);
      let missing = "";
      try {
        await ExamFiles.use(first.id);
      } catch (error) {
        missing = error.message;
      }
      return {
        duplicate,
        quota,
        atomic,
        id: first.id,
        idReused,
        originalRetained,
        invalidType,
        tooLarge,
        missing,
      };
    });
    assert(results.duplicate);
    assert.match(results.quota, /No hay espacio suficiente/);
    assert.deepEqual(results.atomic, [results.id]);
    assert(results.idReused);
    assert(results.originalRetained);
    assert.match(results.invalidType, /PDF/);
    assert.match(results.tooLarge, /20 MB/);
    assert.match(results.missing, /copia completa/);
    // A localStorage failure after blob insertion must roll back only the new files.
    await page.evaluate(() =>
      localStorage.setItem(
        "studyflow-v1",
        JSON.stringify({
          version: 4,
          tasks: [],
          exams: [
            {
              id: "exam",
              name: "Original",
              subject: "Redes",
              date: "2026-11-18",
            },
          ],
          subjects: [{ id: "s", name: "Redes", color: "#123456" }],
          settings: { name: "Ana" },
        }),
      ),
    );
    await page.reload();
    await page.evaluate(() => openEditor("exam", "exam"));
    await page.locator("#itemForm [name=name]").fill("No debe reemplazar");
    await page
      .locator("#examPdfInput")
      .setInputFiles({
        name: "nuevo.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\nnew\n%%EOF"),
      });
    await page
      .locator("#examFileMessage")
      .filter({ hasText: "PDF preparados." })
      .waitFor();
    const before = await page.evaluate(async () => ({
      data: localStorage.getItem("studyflow-v1"),
      files: (await ExamFiles.all()).map((x) => x.id),
    }));
    await page.evaluate(() => {
      window.originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, ...rest) {
        if (key === "studyflow-v1")
          throw new DOMException("quota", "QuotaExceededError");
        return window.originalSet.call(this, key, ...rest);
      };
    });
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await page.waitForFunction(
      () => !document.getElementById("itemForm").dataset.saving,
    );
    const after = await page.evaluate(async () => ({
      data: localStorage.getItem("studyflow-v1"),
      files: (await ExamFiles.all()).map((x) => x.id),
    }));
    assert.deepEqual(after, before);
    assert(await page.locator("#editor").isVisible());
    console.log(
      "PASS PDF storage: real IndexedDB persistence, quota errors, atomic abort, duplicate rejection, same-file reuse, collision isolation, format/size limits, missing-file message and rollback when personal-data storage fails.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
