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
      timezoneId: "America/Los_Angeles",
    });
    await page.clock.setFixedTime(new Date("2026-11-15T12:00:00Z"));
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:8000");
    const saved = {
      version: 3,
      tasks: [
        {
          id: "t",
          name: "Tarea domingo",
          subject: "Prueba",
          due: "2026-11-15",
          done: false,
          priority: "high",
        },
      ],
      exams: [
        {
          id: "e",
          name: "Examen domingo",
          subject: "Prueba",
          date: "2026-11-15",
        },
      ],
      subjects: [{ id: "s", name: "Prueba", color: "#123456" }],
      settings: { name: "Perfil conservado", customSetting: "keep" },
    };
    await page.evaluate(
      (s) => localStorage.setItem("studyflow-v1", JSON.stringify(s)),
      saved,
    );
    await page.goto("http://127.0.0.1:8000/#calendar");
    await page.reload();
    const day = page.locator('[data-date="2026-11-15"]');
    assert.equal(
      await day.evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(127, 29, 29)",
    );
    assert.equal(
      await day
        .locator(".day-number")
        .evaluate((e) => getComputedStyle(e).color),
      "rgb(255, 255, 255)",
    );
    assert.equal(await day.locator(".event").count(), 2);
    assert.equal(
      await day
        .locator(".event:not(.exam)")
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(29, 78, 216)",
    );
    assert.equal(
      await day
        .locator(".exam")
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(220, 38, 38)",
    );
    await day.locator(".day-number").click();
    assert.match(
      await page.locator("#dayReasons").innerText(),
      /Fin de semana/,
    );
    await page.locator("#dayExam").click();
    assert.equal(
      await page.locator("#itemForm input[name=date]").inputValue(),
      "2026-11-15",
    );
    await page.locator("#cancelDialog").click();
    await day.locator(".day-number").click();
    await page.locator("#dayTask").click();
    assert.equal(
      await page.locator("#itemForm input[name=date]").inputValue(),
      "2026-11-15",
    );
    await page.locator("#cancelDialog").click();
    await page.locator("#showNonTeaching").click();
    assert.equal(await page.locator(".non-teaching").count(), 0);
    assert.equal(await day.locator(".event").count(), 2);
    await page.locator("#showNonTeaching").click();
    assert.equal(await day.locator(".event").count(), 2);
    await page.locator("#calendarMonth").fill("2026-12");
    await page.getByRole("button", { name: "Mes siguiente" }).click();
    assert.equal(await page.locator("#calendarMonth").inputValue(), "2027-01");
    await page.getByRole("button", { name: "Mes anterior" }).click();
    assert.equal(await page.locator("#calendarMonth").inputValue(), "2026-12");
    // Synthetic fixture exercises inclusive holiday ranges without asserting unverified official dates.
    await page.evaluate(() =>
      ACADEMIC_CALENDAR.events.push({
        start: "2026-12-21",
        end: "2027-01-04",
        type: "vacation",
        nonTeaching: true,
        name: "Periodo de prueba",
        description: "Datos sintéticos de prueba",
        source: 0,
      }),
    );
    await page.locator("#calendarMonth").fill("2026-11");
    await page.locator("#calendarMonth").fill("2026-12");
    assert.equal(await page.locator(".academic-label.vacation").count(), 11);
    for (let n = 21; n <= 31; n++)
      assert.equal(
        await page
          .locator(`[data-date="2026-12-${n}"]`)
          .evaluate((e) => getComputedStyle(e).backgroundColor),
        "rgb(127, 29, 29)",
      );
    await page.getByRole("button", { name: "Mes siguiente" }).click();
    assert.equal(await page.locator(".academic-label.vacation").count(), 4);
    await page.reload();
    assert.equal(await page.locator(".academic-label").count(), 0);
    assert.deepEqual(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("studyflow-v1")),
      ),
      saved,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: "/tmp/studyflow-academic-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: weekend cell colors, white numbers, coincident task/exam colors, reasons, both day creation actions, visibility, year navigation, inclusive synthetic vacation range, reload without duplicates, exact personal data preservation, mobile. Official dates NOT validated: DOE access pending.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
