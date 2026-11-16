const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (
          k === "studyflow-v1" &&
          JSON.parse(v).version === 4 &&
          this.getItem("test-fail-migration") === "yes"
        )
          throw new DOMException("test quota", "QuotaExceededError");
        return original.call(this, k, v);
      };
    });
    await page.goto("http://127.0.0.1:8000/");
    const original = JSON.stringify({
        version: 3,
        tasks: [
          {
            id: "p",
            name: "No perder",
            subject: "Redes",
            due: "2026-11-17",
            done: false,
            priority: "high",
          },
        ],
        exams: [],
        subjects: [{ id: "s", name: "Redes", color: "#aabbcc" }],
        settings: { name: "Ana" },
      }),
      cache = JSON.stringify({
        courses: [{ id: "c", name: "Redes" }],
        tasks: [
          {
            id: "remote",
            courseId: "c",
            courseName: "Redes",
            name: "Título conservado",
            due: "2026-11-18",
          },
        ],
        lastSync: "2026-11-15T12:00:00Z",
      });
    await page.evaluate(
      ({ original, cache }) => {
        localStorage.setItem("studyflow-v1", original);
        localStorage.setItem("studyflow-classroom-cache", cache);
        localStorage.setItem("test-fail-migration", "yes");
      },
      { original, cache },
    );
    await page.reload();
    assert.equal(
      await page.evaluate(() => localStorage.getItem("studyflow-v1")),
      original,
    );
    const backup = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("studyflow-backup-before-v4")),
    );
    assert.equal(backup.personal, original);
    assert.equal(backup.imported, cache);
    assert.equal(await page.getByRole("alert").count(), 1);
    await page.evaluate(() => localStorage.removeItem("test-fail-migration"));
    await page.reload();
    const recovered = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("studyflow-v1")),
    );
    assert.equal(recovered.version, 4);
    assert.equal(recovered.tasks[0].name, "No perder");
    assert.equal(
      recovered.importArchive.activities[0].name,
      "Título conservado",
    );
    await page.reload();
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("studyflow-v1")).importArchive
            .activities.length,
      ),
      1,
    );
    await page.goto("http://127.0.0.1:8000/#settings");
    await page.getByRole("heading", { name: "A tu manera" }).waitFor();
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Exportar datos originales" })
      .click();
    const originalFile = await downloaded;
    assert.deepEqual(
      JSON.parse(fs.readFileSync(await originalFile.path(), "utf8")),
      JSON.parse(original),
    );
    page.once("dialog", (d) => d.accept());
    await page
      .locator("#importFile")
      .setInputFiles({
        name: "migracion.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(backup)),
      });
    await page
      .getByRole("status")
      .filter({ hasText: "Copia importada correctamente." })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("studyflow-v1")).tasks[0].name,
      ),
      "No perder",
    );
    const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(
      (m) => m[1],
    );
    assert(scripts.length > 0);
    for (const script of scripts) {
      assert(!/^https?:/.test(script));
      const source = fs.readFileSync(
        path.join(__dirname, "..", script),
        "utf8",
      );
      assert(
        !/google\.accounts|initTokenClient|requestAccessToken|Bearer |access_token|refresh_token|classroom\.googleapis|accounts\.google/.test(
          source,
        ),
        script,
      );
    }
    assert(!fs.existsSync(path.join(__dirname, "../classroom.js")));
    console.log(
      "PASS: failed migration preserves original personal JSON and complete imported backup, retry recovers archive without duplicates; only local scripts and no OAuth/API/token code.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
