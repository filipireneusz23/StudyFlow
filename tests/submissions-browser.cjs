const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    const requests = [],
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://accounts.google.com/gsi/client", (r) =>
      r.fulfill({
        contentType: "application/javascript",
        body: `window.google={accounts:{oauth2:{hasGrantedAllScopes:(r,s)=>r.scope.split(' ').includes(s),initTokenClient:c=>({requestAccessToken:()=>c.callback({access_token:'TEST_LIMITED_TOKEN',expires_in:3600,scope:c.scope})}),revoke:(t,c)=>c({successful:true})}}};`,
      }),
    );
    await page.route("https://openidconnect.googleapis.com/**", (r) =>
      r.fulfill({ json: { sub: "student", email: "student@example.test" } }),
    );
    await page.route("https://classroom.googleapis.com/**", (r) => {
      const url = r.request().url();
      requests.push(url);
      if (url.includes("studentSubmissions"))
        return r.fulfill({
          json: {
            studentSubmissions: [
              {
                id: "s",
                courseWorkId: "w",
                state: "CREATED",
                late: true,
                alternateLink: "https://classroom.google.com/a/w",
              },
            ],
          },
        });
      assert(!url.includes("/courseWork"));
      return r.fulfill({
        json: { courses: [{ id: "c", name: "Curso", courseState: "ACTIVE" }] },
      });
    });
    await page.goto("http://127.0.0.1:8000/#settings");
    const personal = {
      version: 3,
      tasks: [
        {
          id: "p",
          name: "Personal",
          subject: "Curso",
          due: "2026-12-25",
          priority: "high",
          done: false,
        },
      ],
      exams: [
        { id: "e", name: "Examen", subject: "Curso", date: "2026-12-25" },
      ],
      subjects: [{ id: "course", name: "Curso", color: "#aabbcc" }],
      settings: { name: "Ana", extra: "keep" },
    };
    await page.evaluate(
      (s) => localStorage.setItem("studyflow-v1", JSON.stringify(s)),
      personal,
    );
    await page.reload();
    assert.equal(
      await page.locator("#classroomConfig select").inputValue(),
      "submissions",
    );
    await page
      .locator("#classroomConfig input")
      .fill("test.apps.googleusercontent.com");
    await page.getByRole("button", { name: "Guardar Client ID" }).click();
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-action="classroom-connect"]').disabled,
    );
    await page
      .getByRole("button", { name: "Conectar con Google Classroom" })
      .click();
    await page.waitForFunction(
      () =>
        !!JSON.parse(
          localStorage.getItem("studyflow-classroom-cache") || "null",
        )?.lastSync,
    );
    assert.equal(await page.getByText("Conectado", { exact: true }).count(), 1);
    assert.match(
      await page.locator(".integration-card").innerText(),
      /no proporciona títulos/,
    );
    await page.getByRole("link", { name: /Tareas/ }).click();
    await page.locator("#taskOrigin").selectOption("classroom");
    assert.equal(
      await page
        .getByText("Entrega propia · actividad w", { exact: true })
        .count(),
      1,
    );
    assert.equal(
      await page
        .getByText("Fecha no disponible con este permiso", { exact: true })
        .count(),
      1,
    );
    await page.getByRole("button", { name: "Vencidas", exact: true }).click();
    assert.equal(
      await page
        .getByText("Entrega propia · actividad w", { exact: true })
        .count(),
      1,
    );
    await page
      .getByRole("button", { name: "Ver detalles", exact: true })
      .click();
    assert.match(
      await page.locator("#classroomTaskBody").innerText(),
      /identificador mostrado no es el título original/,
    );
    await page.locator("#closeClassroomDetails").click();
    await page.getByRole("link", { name: "▦ Calendario" }).click();
    await page.locator("#calendarMonth").fill("2026-12");
    assert.equal(
      await page.locator('[data-date="2026-12-25"] .event').count(),
      2,
    );
    assert.equal(await page.locator("[data-classroom]").count(), 0);
    assert.equal(requests.length, 2);
    assert.deepEqual(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("studyflow-v1")),
      ),
      personal,
    );
    assert(
      !(await page.evaluate(() =>
        Object.values(localStorage).join("").includes("TEST_LIMITED_TOKEN"),
      )),
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: limited mode is default, own-submission scopes authorize mocked connection, no coursework-list request, honest missing metadata, overdue API flag, no invented calendar dates, personal records preserved. No real account authorized.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
