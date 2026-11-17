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
      viewport: { width: 1280, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-11-17T22:59:58Z") });
    await page.goto("http://127.0.0.1:8000");
    const tasks = [25, 24, 21, 20, 19, 18, 17, 16].map((day, i) => ({
      id: String(i),
      name: `Task ${i}`,
      subject: "Redes",
      due: `2026-11-${day}`,
      done: false,
      priority: "medium",
      notes: "Conservar\nnotas",
      links: [{ label: "Manual", url: "https://example.com/" }],
    }));
    tasks.push({
      id: "neutral",
      name: "Sin fecha",
      subject: "Redes",
      due: "",
      done: false,
      priority: "medium",
    });
    const original = {
      version: 4,
      tasks,
      exams: [],
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
    await nav("#tasks");
    const expected = [
      "later",
      "week",
      "week",
      "soon",
      "soon",
      "tomorrow",
      "today",
      "overdue",
    ];
    for (let i = 0; i < 8; i++)
      assert.equal(
        await page
          .locator(`[data-task-id="${i}"]`)
          .getAttribute("data-urgency"),
        expected[i],
      );
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
          .locator(`[data-task-id="${i}"]`)
          .evaluate((e) => getComputedStyle(e).borderLeftColor),
        colors[i],
      );
    const row = page.locator('[data-task-id="5"]');
    assert.equal(
      await row.locator(".urgency-badge").textContent(),
      "Queda 1 día",
    );
    await page
      .getByRole("button", { name: "Editar", exact: true })
      .first()
      .click();
    await page.locator("#itemForm [name=name]").fill("Edición sin perder");
    await page.clock.fastForward(3000);
    assert.equal(
      await row.locator(".urgency-badge").textContent(),
      "Vence hoy",
    );
    assert.equal(
      await page.locator("#itemForm [name=name]").inputValue(),
      "Edición sin perder",
    );
    await page.locator("#cancelDialog").click();
    const edit = page.locator('[data-task-id="5"]');
    await edit.getByRole("button", { name: "Editar", exact: true }).click();
    await page.locator("#itemForm [name=date]").fill("2026-11-26");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    assert.equal(await edit.getAttribute("data-urgency"), "later");
    await edit.getByRole("button", { name: "Editar", exact: true }).click();
    await page.locator("#itemForm [name=date]").fill("2026-11-18");
    await page.locator("[name=dueTime]").fill("00:01");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    assert.equal(await edit.getAttribute("data-urgency"), "today");
    await page.clock.fastForward(60000);
    assert.equal(await edit.getAttribute("data-urgency"), "overdue");
    await edit.locator("[data-toggle]").click();
    await page.getByRole("button", { name: "Todas", exact: true }).click();
    assert.equal(
      await page.locator('[data-task-id="5"]').getAttribute("data-urgency"),
      "completed",
    );
    await nav("#dashboard");
    const indicator = page.locator('[data-urgency-task="2"]');
    assert.equal(await indicator.getAttribute("data-urgency"), "soon");
    await page.clock.setSystemTime(new Date("2026-11-22T12:00:00+01:00"));
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    assert.equal(await indicator.getAttribute("data-urgency"), "overdue");
    await page.clock.setSystemTime(new Date("2026-11-18T00:02:00+01:00"));
    await nav("#calendar");
    const event = page.locator('[data-urgency-task="5"]');
    assert.equal(await event.getAttribute("data-urgency"), "completed");
    const sat = await page
      .locator('[data-date="2026-11-21"]')
      .evaluate((e) => getComputedStyle(e).backgroundColor);
    assert.equal(sat, "rgb(88, 28, 135)");
    await nav("#tasks");
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.reload();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("studyflow-v1")),
    );
    assert.equal(saved.tasks[5].dueTime, "00:01");
    assert.equal(saved.tasks[5].notes, tasks[5].notes);
    assert.deepEqual(saved.tasks[5].links, tasks[5].links);
    assert.deepEqual(saved.tasks[0], tasks[0]);
    assert.deepEqual(errors, []);
    console.log(
      "PASS urgency browser: levels, midnight, deadline, completion, non-destructive refresh, academic background, persistence and mobile",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
