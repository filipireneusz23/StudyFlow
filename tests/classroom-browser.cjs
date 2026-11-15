// Browser contract tests use mocked GIS/API responses. They do NOT authorize a real Google account.
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
    await page.route("https://accounts.google.com/gsi/client", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `window.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:options=>({requestAccessToken:()=>options.callback({access_token:'TEST_ONLY_TOKEN',expires_in:3600,scope:options.scope})}),revoke:(token,callback)=>callback({})}}};`,
      }),
    );
    await page.route("https://openidconnect.googleapis.com/**", (route) =>
      route.fulfill({
        json: { sub: "student", email: "student@example.test" },
      }),
    );
    const calls = [];
    await page.route("https://classroom.googleapis.com/**", (route) => {
      const url = route.request().url();
      calls.push(url);
      assert.equal(route.request().method(), "GET");
      assert.equal(
        route.request().headers().authorization,
        "Bearer TEST_ONLY_TOKEN",
      );
      const json = url.includes("studentSubmissions")
        ? { studentSubmissions: [{ courseWorkId: "work1", state: "CREATED" }] }
        : url.includes("courseWork")
          ? {
              courseWork: [
                {
                  id: "work1",
                  title: "Tarea de Classroom",
                  description: "Descripción <script>no ejecutar</script>",
                  state: "PUBLISHED",
                  dueDate: { year: 2026, month: 12, day: 26 },
                  dueTime: { hours: 0, minutes: 30 },
                  alternateLink:
                    "https://classroom.google.com/c/course1/a/work1",
                },
                {
                  id: "work2",
                  title: "Actividad sin fecha",
                  state: "PUBLISHED",
                },
              ],
            }
          : {
              courses: [
                {
                  id: "course1",
                  name: "Clase importada",
                  courseState: "ACTIVE",
                },
              ],
            };
      return route.fulfill({ json });
    });
    await page.goto("http://127.0.0.1:8000/#settings");
    assert.equal(
      await page
        .getByText("Pendiente de configuración", { exact: true })
        .count(),
      1,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Conectar con Google Classroom" })
        .isDisabled(),
      true,
    );
    const original = {
      version: 3,
      tasks: [
        {
          id: "personal",
          name: "Tarea personal",
          subject: "Física",
          due: "2026-12-25",
          done: false,
          priority: "high",
        },
      ],
      exams: [
        {
          id: "exam",
          name: "Examen personal",
          subject: "Física",
          date: "2026-12-25",
        },
      ],
      subjects: [{ id: "physics", name: "Física", color: "#aabbcc" }],
      settings: { name: "Ana", extra: "preservar" },
    };
    await page.evaluate(
      (s) => localStorage.setItem("studyflow-v1", JSON.stringify(s)),
      original,
    );
    await page.reload();
    await page
      .locator("#classroomConfig input")
      .fill("browser-test.apps.googleusercontent.com");
    await page
      .locator("#classroomConfig select[name=accessMode]")
      .selectOption("full");
    await page.getByRole("button", { name: "Guardar Client ID" }).click();
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-action="classroom-connect"]').disabled,
    );
    await page
      .getByRole("button", { name: "Conectar con Google Classroom" })
      .click();
    await page.waitForFunction(() =>
      Boolean(
        JSON.parse(localStorage.getItem("studyflow-classroom-cache") || "null")
          ?.lastSync,
      ),
    );
    assert.equal(await page.getByText("Conectado", { exact: true }).count(), 1);
    assert.equal(
      await page.getByText("student@example.test", { exact: true }).count(),
      1,
    );
    await page
      .locator('[data-classroom-map="course1"]')
      .selectOption("physics");
    await navigate(/Tareas/);
    await page.locator("#taskOrigin").selectOption("classroom");
    assert.equal(
      await page.getByText("Tarea de Classroom", { exact: true }).count(),
      1,
    );
    assert.equal(
      await page.getByText("Actividad sin fecha", { exact: true }).count(),
      1,
    );
    assert.equal(
      await page.getByText("Tarea personal", { exact: true }).count(),
      0,
    );
    await page.locator("#taskSubject").selectOption("Física");
    assert.equal(
      await page.getByText("Tarea de Classroom", { exact: true }).count(),
      1,
    );
    await navigate("▦ Calendario");
    await page.locator("#calendarMonth").fill("2026-12");
    const christmas = page.locator('[data-date="2026-12-25"]');
    assert.equal(await christmas.locator(".event").count(), 3); // UTC 26/12 00:30 falls on 25/12 in LA.
    assert.equal(
      await christmas.evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(127, 29, 29)",
    ); // holiday overrides Friday
    assert.equal(
      await page
        .locator('[data-date="2026-12-26"]')
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(127, 29, 29)",
    ); // holiday overrides Saturday
    assert.equal(
      await page
        .locator('[data-date="2026-12-12"]')
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(88, 28, 135)",
    );
    assert.equal(
      await page.getByText("Actividad sin fecha", { exact: true }).count(),
      0,
    );
    await christmas.locator("[data-classroom]").click();
    assert.match(
      await page.locator("#classroomTaskBody").innerText(),
      /Descripción <script>no ejecutar<\/script>/,
    );
    assert.equal(await page.locator("#classroomTaskBody script").count(), 0);
    assert.equal(
      await page.locator("#classroomTaskBody a").getAttribute("href"),
      "https://classroom.google.com/c/course1/a/work1",
    );
    await page.locator("#closeClassroomDetails").click();
    await page.screenshot({
      path: "/tmp/studyflow-classroom-calendar.png",
      fullPage: true,
    });
    await navigate("▤ Asignaturas");
    assert.equal(
      await page.getByRole("heading", { name: "Clase importada" }).count(),
      0,
    );
    assert.equal(
      await page.getByRole("heading", { name: "Física", exact: true }).count(),
      1,
    );
    await navigate("⚙ Ajustes");
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
      path: "/tmp/studyflow-classroom-settings-mobile.png",
      fullPage: true,
    });
    assert(
      !(await page.evaluate(() =>
        Object.values(localStorage).join("").includes("TEST_ONLY_TOKEN"),
      )),
    );
    await page
      .getByRole("button", { name: "Desconectar", exact: true })
      .click();
    assert.equal(
      await page.getByText("Desconectado", { exact: true }).count(),
      1,
    );
    assert.deepEqual(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("studyflow-v1")),
      ),
      original,
    );
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("studyflow-classroom-cache"),
      ),
      null,
    );
    await page.reload();
    assert.equal(
      await page.getByText("Desconectado", { exact: true }).count(),
      1,
    );
    assert.equal(calls.length, 3);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: mocked OAuth, settings states, identity, subject mapping, origin/subject filters, missing due date, UTC conversion, personal event coexistence, red holiday precedence, purple weekend, details/link escaping, disconnect/reload, no stored tokens, exact data preservation, mobile. No real Google authorization was performed.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
