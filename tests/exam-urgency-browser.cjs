const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
      timezoneId: "Europe/Madrid",
      viewport: { width: 1440, height: 1000 },
    });
    await page.clock.install({ time: new Date("2026-11-17T22:59:58Z") });
    await page.goto("http://127.0.0.1:8000");
    const exams = [25, 24, 21, 20, 19, 18, 17, 16].map((d, i) => ({
      id: String(i),
      name: `Examen ${i}`,
      subject: "Redes",
      date: `2026-11-${d}`,
      ...(d === 18 ? { time: "00:01" } : {}),
    }));
    const original = {
      version: 4,
      tasks: [],
      exams,
      subjects: [{ id: "s", name: "Redes", color: "#123456" }],
      settings: { name: "Ana" },
    };
    await page.evaluate(
      (s) => localStorage.setItem("studyflow-v1", JSON.stringify(s)),
      original,
    );
    await page.reload();
    async function nav(hash) {
      await page.evaluate((h) => (location.hash = h), hash);
      await page.clock.runFor(100);
      await page.waitForFunction(
        (h) =>
          document
            .querySelector('nav a[aria-current="page"]')
            ?.getAttribute("href") === h,
        hash,
      );
    }
    await nav("#exams");
    const colors = [
      "rgb(34, 197, 94)",
      "rgb(132, 204, 22)",
      "rgb(132, 204, 22)",
      "rgb(234, 179, 8)",
      "rgb(234, 179, 8)",
      "rgb(249, 115, 22)",
      "rgb(239, 68, 68)",
      "rgb(153, 27, 27)",
    ];
    for (let i = 0; i < 8; i++)
      assert.equal(
        await page
          .locator(`[data-exam-id="${i}"]`)
          .evaluate((e) => getComputedStyle(e).borderLeftColor),
        colors[i],
      );
    await page.locator('[data-exam-id="0"] [data-edit]').click();
    await page.locator("[name=taskNotes]").fill("Borrador conservado");
    await page.clock.fastForward(3000);
    assert.equal(
      await page.locator('[data-exam-id="5"]').getAttribute("data-urgency"),
      "today",
    );
    assert.equal(
      await page.locator("[name=taskNotes]").inputValue(),
      "Borrador conservado",
    );
    await page.locator("#cancelDialog").click();
    await page.locator("#examFilter").selectOption("upcoming");
    assert.equal(await page.locator('[data-exam-id="5"]').count(), 1);
    await page.clock.fastForward(60000);
    assert.equal(await page.locator('[data-exam-id="5"]').count(), 0);
    await page.locator("#examFilter").selectOption("past");
    assert.equal(
      await page.locator('[data-exam-id="5"] .urgency-badge').textContent(),
      "Examen pasado",
    );
    await nav("#dashboard");
    assert.equal(
      await page.locator('#dashboardExams [data-exam-id="5"]').count(),
      0,
    );
    assert.equal(
      await page
        .locator("#dashboardExams .urgency-badge")
        .first()
        .textContent(),
      "Mañana",
    );
    await page.clock.setSystemTime(new Date("2026-11-24T12:00:00+01:00"));
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    assert.equal(
      await page.locator("#dashboardExams [data-exam-id]").count(),
      2,
    );
    await nav("#calendar");
    assert.equal(
      await page
        .locator('[data-urgency-exam="5"]')
        .getAttribute("data-urgency"),
      "overdue",
    );
    assert.equal(
      await page
        .locator('[data-date="2026-11-21"]')
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(88, 28, 135)",
    );
    assert.deepEqual(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("studyflow-v1")),
      ),
      original,
    );
    console.log(
      "PASS exam urgency: every border color, local midnight, timed expiry, live future/past filters, dashboard expiry, tab return, preserved draft/data and academic colors.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
