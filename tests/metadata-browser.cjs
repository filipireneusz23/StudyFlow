// Controlled Google responses; this does not establish real account permission.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({ timezoneId: "Europe/Madrid" });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://accounts.google.com/gsi/client", (r) =>
      r.fulfill({
        contentType: "application/javascript",
        body: `window.google={accounts:{oauth2:{hasGrantedAllScopes:(r,s)=>r.scope.split(' ').includes(s),initTokenClient:c=>({requestAccessToken:()=>c.callback({access_token:'FAKE_METADATA_TOKEN',expires_in:3600,scope:c.scope})}),revoke:(t,c)=>c({successful:true})}}};`,
      }),
    );
    await page.route("https://openidconnect.googleapis.com/**", (r) =>
      r.fulfill({ json: { sub: "student", email: "student@example.test" } }),
    );
    const title = "Entrega P04 - BIND9 - Transferencia de zona",
      description = "Configurar la transferencia de zona con BIND9.";
    const calls = [];
    const work = {
      id: "w",
      courseId: "c",
      title,
      description,
      dueDate: { year: 2026, month: 11, day: 18 },
      dueTime: { hours: 22, minutes: 59 },
      alternateLink: "https://classroom.google.com/c/c/a/w",
      state: "PUBLISHED",
    };
    await page.route("https://classroom.googleapis.com/**", (r) => {
      const url = new URL(r.request().url());
      calls.push(url.pathname);
      const json = url.pathname.endsWith("studentSubmissions")
        ? {
            studentSubmissions: [
              { courseId: "c", courseWorkId: "w", state: "CREATED" },
            ],
          }
        : url.pathname.endsWith("/courseWork/w")
          ? work
          : url.pathname.endsWith("/courseWork")
            ? { courseWork: [work] }
            : { courses: [{ id: "c", name: "Redes", courseState: "ACTIVE" }] };
      return r.fulfill({ json });
    });
    await page.goto("http://127.0.0.1:8000/#settings");
    const personal = JSON.stringify({
      version: 3,
      tasks: [],
      exams: [],
      subjects: [],
      settings: { name: "Ana" },
    });
    const cache = {
      account: { sub: "student" },
      lastSync: "2026-11-15T12:00:00Z",
      courses: [{ id: "c", name: "Redes", courseState: "ACTIVE" }],
      tasks: [
        {
          id: "classroom:c:w",
          courseId: "c",
          workId: "w",
          origin: "classroom",
          name: "Entrega propia · actividad w",
          limited: true,
          due: null,
          dueAt: null,
          done: false,
          status: "CREATED",
          availability: "active",
        },
      ],
    };
    await page.evaluate(
      ({ personal, cache }) => {
        localStorage.setItem("studyflow-v1", personal);
        localStorage.setItem(
          "studyflow-classroom-cache",
          JSON.stringify(cache),
        );
        localStorage.setItem(
          "studyflow-classroom-config",
          JSON.stringify({
            clientId: "test.apps.googleusercontent.com",
            mapping: {},
            accessMode: "submissions",
          }),
        );
      },
      { personal, cache },
    );
    await page.reload();
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-action="classroom-metadata"]').disabled,
    );
    await page
      .getByRole("button", {
        name: "Autorizar títulos y fechas reales",
        exact: true,
      })
      .click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("studyflow-classroom-cache")).tasks[0]
          ?.name === "Entrega P04 - BIND9 - Transferencia de zona",
    );
    assert.match(
      await page.locator(".metadata-controls").innerText(),
      /courseWork.list: Acceso comprobado/,
    );
    assert.match(
      await page.locator(".metadata-controls").innerText(),
      /courseWork.get: Acceso comprobado/,
    );
    await page.getByRole("link", { name: "◈ Panel principal" }).click();
    await page.getByText(title, { exact: true }).first().waitFor();
    assert.equal(
      await page
        .getByText("Actividad sin título disponible", { exact: true })
        .count(),
      0,
    );
    await page.getByRole("link", { name: /Tareas/ }).click();
    await page
      .getByRole("button", { name: "Ver detalles", exact: true })
      .click();
    assert.equal(await page.locator("#classroomTaskTitle").innerText(), title);
    assert.match(
      await page.locator("#classroomTaskBody").innerText(),
      new RegExp(description.replaceAll(".", "\\.")),
    );
    assert.match(await page.locator("#classroomTaskBody").innerText(), /23:59/);
    await page.locator("#closeClassroomDetails").click();
    await page.getByRole("link", { name: "▦ Calendario" }).click();
    await page.locator("#calendarMonth").fill("2026-11");
    assert.equal(
      await page
        .locator('[data-date="2026-11-18"] [data-classroom]')
        .innerText(),
      "▣ " + title,
    );
    assert(calls.includes("/v1/courses/c/courseWork"));
    assert(calls.includes("/v1/courses/c/courseWork/w"));
    assert.equal(
      await page.evaluate(() => localStorage.getItem("studyflow-v1")),
      personal,
    );
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("studyflow-classroom-cache")).tasks
            .length,
      ),
      1,
    );
    assert(
      !(await page.evaluate(() =>
        Object.values(localStorage).join("").includes("FAKE_METADATA_TOKEN"),
      )),
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: explicit permission upgrade preserves cache until success, exact CourseWork title/description and Madrid deadline in dashboard/list/calendar, compound-key state join, list/get capability checks, no duplicates and personal data unchanged. Google responses mocked.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
