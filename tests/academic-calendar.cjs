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
      version: 4,
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
    saved.tasks.push({
      id: "holiday-task",
      name: "Tarea en festivo",
      subject: "Prueba",
      due: "2027-01-01",
      done: false,
      priority: "low",
    });
    saved.exams.push({
      id: "holiday-exam",
      name: "Examen en festivo",
      subject: "Prueba",
      date: "2027-01-01",
    });
    await page.evaluate(
      (s) => localStorage.setItem("studyflow-v1", JSON.stringify(s)),
      saved,
    );
    await page.goto("http://127.0.0.1:8000/#calendar");
    await page.reload();
    const day = page.locator('[data-date="2026-11-15"]');
    assert.equal(
      await day.evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(88, 28, 135)",
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
        .evaluate((e) => getComputedStyle(e).borderLeftColor),
      "rgb(239, 68, 68)",
    );
    assert.equal(
      await day
        .locator(".exam")
        .evaluate((e) => getComputedStyle(e).borderLeftColor),
      "rgb(239, 68, 68)",
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
    // Inclusive periods from the verified DOE calendar, including both years.
    assert.equal(await page.locator(".academic-label.vacation").count(), 9);
    for (let n = 23; n <= 31; n++)
      assert.equal(
        await page
          .locator(`[data-date="2026-12-${n}"]`)
          .evaluate((e) => getComputedStyle(e).backgroundColor),
        "rgb(127, 29, 29)",
      );
    await page.getByRole("button", { name: "Mes siguiente" }).click();
    assert.equal(await page.locator(".academic-label.vacation").count(), 7);
    assert.equal(
      await page.locator('[data-date="2027-01-01"] .event').count(),
      2,
    );
    await page.locator("#showNonTeaching").click();
    assert.equal(await page.locator(".academic-label").count(), 0);
    assert.equal(
      await page.locator('[data-date="2027-01-01"] .event').count(),
      2,
    );
    await page.locator("#showNonTeaching").click();
    await page.locator('[data-date="2027-01-01"] .day-number').click();
    assert.match(await page.locator("#dayReasons").innerText(), /Año Nuevo/);
    assert.match(
      await page.locator("#dayReasons").innerText(),
      /Vacaciones de Navidad/,
    );
    await page.locator("#closeDay").click();
    await page.locator("#calendarMonth").fill("2027-07");
    for (const date of ["2027-07-23", "2027-07-26"]) {
      const cell = page.locator(`[data-date="${date}"]`);
      assert.equal(
        await cell.locator(".academic-label.holiday").innerText(),
        "Festivo local de Cabezuela del Valle",
      );
      assert.equal(
        await cell.evaluate((e) => getComputedStyle(e).backgroundColor),
        "rgb(127, 29, 29)",
      );
    }
    // Every day's visual state across the academic year matches the verified data.
    for (const month of [
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05",
      "2027-06",
      "2027-07",
      "2027-08",
    ]) {
      await page.locator("#calendarMonth").fill(month);
      const mismatches = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".day[data-date]"))
          .filter((cell) => {
            const info = academicDay(cell.dataset.date);
            const off = info.nonTeaching;
            const expectedColor = info.events.some((e) => e.nonTeaching)
              ? "rgb(127, 29, 29)"
              : info.weekend
                ? "rgb(88, 28, 135)"
                : null;
            return (
              (expectedColor
                ? getComputedStyle(cell).backgroundColor !== expectedColor
                : ["rgb(127, 29, 29)", "rgb(88, 28, 135)"].includes(
                    getComputedStyle(cell).backgroundColor,
                  )) ||
              (off &&
                getComputedStyle(cell.querySelector(".day-number")).color !==
                  "rgb(255, 255, 255)")
            );
          })
          .map((cell) => cell.dataset.date),
      );
      assert.deepEqual(mismatches, [], month);
    }
    await page.reload();
    await page.locator("#calendarMonth").fill("2026-12");
    assert.equal(await page.locator(".academic-label.vacation").count(), 9);
    assert.deepEqual(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("studyflow-v1")),
      ),
      saved,
    );
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
      path: "/tmp/studyflow-academic-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: weekend cell colors, white numbers, coincident task/exam colors, reasons, both day creation actions, visibility, year navigation, verified official periods and local holidays, reload without duplicates, exact personal data preservation, mobile. All 365 day colors checked, with red holiday precedence over purple weekends.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
