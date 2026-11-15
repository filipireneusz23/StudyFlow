const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date("2026-11-16T12:00:00Z"));
    const requests = [];
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await context.route("https://accounts.google.com/gsi/client", (r) =>
      r.fulfill({
        contentType: "application/javascript",
        body: `window.google={accounts:{oauth2:{hasGrantedAllScopes:(r,s)=>r.scope.split(' ').includes(s),initTokenClient:c=>({requestAccessToken:r=>{window.restoreAttempt={hint:c.hint,prompt:r.prompt};c.callback({access_token:'MEMORY_ONLY_TEST',expires_in:3600,scope:c.scope})}}),revoke:(t,c)=>c({successful:true})}}};`,
      }),
    );
    await context.route("https://openidconnect.googleapis.com/**", (r) => {
      requests.push("identity");
      return r.fulfill({
        json: { sub: "student", email: "student@example.test" },
      });
    });
    await context.route("https://classroom.googleapis.com/**", (r) => {
      requests.push("classroom");
      return r.fulfill({
        json: r.request().url().includes("studentSubmissions")
          ? {
              studentSubmissions: [
                { id: "s", courseWorkId: "w", state: "CREATED" },
              ],
            }
          : { courses: [{ id: "c", name: "Clase", courseState: "ACTIVE" }] },
      });
    });
    await page.goto("http://127.0.0.1:8000/");
    const cache = {
      account: { sub: "student", email: "student@example.test" },
      lastSync: "2026-11-15T12:00:00Z",
      courses: [{ id: "c", name: "Clase", courseState: "ACTIVE" }],
      tasks: [
        {
          id: "classroom:c:w",
          courseId: "c",
          workId: "w",
          name: "Entrega propia · actividad w",
          description: "Limitado",
          origin: "classroom",
          availability: "active",
          limited: true,
          due: null,
          dueAt: null,
          done: false,
          status: "CREATED",
        },
      ],
    };
    await page.evaluate((cache) => {
      localStorage.setItem("studyflow-classroom-cache", JSON.stringify(cache));
      localStorage.setItem(
        "studyflow-classroom-config",
        JSON.stringify({
          clientId: "test.apps.googleusercontent.com",
          mapping: {},
          accessMode: "submissions",
        }),
      );
    }, cache);
    await page.reload();
    assert.equal(requests.length, 0);
    assert.match(
      await page.locator(".classroom-cache-notice").innerText(),
      /Copia guardada/,
    );
    assert.equal(
      await page
        .getByText("Actividad sin título disponible", { exact: true })
        .count(),
      1,
    );
    assert(
      !(await page.locator("main").innerText()).includes(
        "Entrega propia · actividad w",
      ),
    );
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-action="classroom-restore"]').disabled,
    );
    await page
      .getByRole("button", { name: "Volver a autorizar Google" })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector(".classroom-cache-notice strong")
          ?.textContent === "Datos de Classroom sincronizados",
    );
    assert.deepEqual(await page.evaluate(() => restoreAttempt), {
      hint: "student@example.test",
      prompt: "",
    });
    assert.equal(requests.length, 3);
    assert(
      !(await page.evaluate(() =>
        Object.values(localStorage).join("").includes("MEMORY_ONLY_TEST"),
      )),
    );
    const current = await page.evaluate(() =>
      localStorage.getItem("studyflow-classroom-cache"),
    );
    await page.clock.setFixedTime(new Date("2026-11-16T14:00:00Z"));
    await page.evaluate(() => {
      classroom.autoSync();
      dispatchEvent(new Event("classroomchange"));
    });
    assert.match(
      await page.locator(".classroom-cache-notice").innerText(),
      /Copia guardada/,
    );
    assert.equal(requests.length, 3);
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("studyflow-classroom-cache"),
      ),
      current,
    );
    await page.reload();
    assert.equal(requests.length, 3);
    assert.match(
      await page.locator(".classroom-cache-notice").innerText(),
      /Copia guardada/,
    );
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("studyflow-classroom-cache"),
      ),
      current,
    );
    const newPage = await context.newPage();
    await newPage.goto("http://127.0.0.1:8000/");
    assert.equal(
      await newPage
        .getByText("Actividad sin título disponible", { exact: true })
        .count(),
      1,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: cached account and activities available before authorization, official user-triggered restore with email hint and empty prompt, valid-token sync, expiry/reload/new-tab persistence, no stored tokens or numeric fake titles. Responses mocked.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
