// Exact GitHub Pages origin/path with local static files and controlled Google responses.
// No real Google authorization or request to the deployed application is performed.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { SCOPES } = require("../classroom.js");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    let identityCalls = 0,
      classroomCalls = 0;
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(
      "https://filipireneusz23.github.io/StudyFlow/**",
      (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const file = pathname.slice("/StudyFlow/".length) || "index.html";
        if (
          ![
            "index.html",
            "app.js",
            "classroom.js",
            "academic-calendar.js",
            "timetable.js",
            "timetable-ui.js",
            "styles.css",
            "favicon.svg",
          ].includes(file)
        )
          return route.fulfill({ status: 404, body: "" });
        return route.fulfill({
          body: fs.readFileSync(path.join(__dirname, "..", file)),
          contentType: file.endsWith(".js")
            ? "application/javascript"
            : file.endsWith(".css")
              ? "text/css"
              : file.endsWith(".svg")
                ? "image/svg+xml"
                : "text/html",
        });
      },
    );
    await page.route("https://accounts.google.com/gsi/client", (r) =>
      r.fulfill({
        contentType: "application/javascript",
        body: `window.google={accounts:{oauth2:{hasGrantedAllScopes:(r,...scopes)=>scopes.every(s=>r.scope.split(/\\s+/).includes(s)),initTokenClient:config=>{window.scopeCallbacks=config;return{requestAccessToken:request=>window.scopeRequest=request}},revoke:(t,cb)=>cb({successful:true})}}};`,
      }),
    );
    await page.route("https://openidconnect.googleapis.com/**", (r) => {
      identityCalls++;
      return r.fulfill({
        json: { sub: "student", email: "student@example.test" },
      });
    });
    await page.route("https://classroom.googleapis.com/**", (r) => {
      classroomCalls++;
      return r.fulfill({ json: { courses: [] } });
    });
    await page.goto("https://filipireneusz23.github.io/StudyFlow/#settings");
    const personal = JSON.stringify({
      version: 3,
      tasks: [
        {
          id: "p",
          name: "Conservar tarea",
          subject: "Física",
          due: "2027-01-08",
          priority: "high",
          done: false,
        },
      ],
      exams: [],
      subjects: [{ id: "s", name: "Física", color: "#123456" }],
      settings: { name: "Ana" },
    });
    await page.evaluate(
      (personal) => localStorage.setItem("studyflow-v1", personal),
      personal,
    );
    await page.reload();
    await page
      .locator("#classroomConfig input")
      .fill("test-origin.apps.googleusercontent.com");
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
    assert.equal(
      await page.evaluate(() => location.origin),
      "https://filipireneusz23.github.io",
    );
    assert.equal(
      await page.evaluate(() => scopeCallbacks.scope),
      SCOPES.join(" "),
    );
    assert.match(await page.evaluate(() => scopeRequest.prompt), /consent/);
    await page.evaluate(
      (scope) =>
        scopeCallbacks.callback({
          access_token: "FAKE_SCOPE_TEST_TOKEN",
          expires_in: 3600,
          scope,
        }),
      SCOPES.filter((_, i) => i !== 1).join(" "),
    );
    assert.equal(identityCalls, 0);
    assert.equal(classroomCalls, 0);
    assert.match(
      await page.getByRole("alert").innerText(),
      /classroom.coursework.me.readonly/,
    );
    await page.locator(".oauth-diagnostics summary").click();
    assert.equal(
      await page
        .getByRole("heading", { name: "Permisos que faltan", exact: true })
        .count(),
      1,
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
    await page
      .getByRole("button", { name: "Conectar con Google Classroom" })
      .click();
    await page.evaluate(
      (scope) =>
        scopeCallbacks.callback({
          access_token: "FAKE_SCOPE_TEST_TOKEN",
          expires_in: 3600,
          scope,
        }),
      SCOPES.map((s) =>
        s === "email" ? "https://www.googleapis.com/auth/userinfo.email" : s,
      ).join(" "),
    );
    assert.equal(await page.getByText("Conectado", { exact: true }).count(), 1);
    assert.equal(identityCalls, 1);
    assert.equal(classroomCalls, 1);
    await page.locator(".oauth-diagnostics summary").click();
    assert.equal(
      await page
        .getByRole("heading", { name: "Permisos que faltan", exact: true })
        .count(),
      0,
    );
    assert.match(
      await page.locator(".oauth-diagnostics").innerText(),
      /userinfo.email/,
    );
    assert(
      !(await page.locator("body").innerText()).includes(
        "FAKE_SCOPE_TEST_TOKEN",
      ),
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("studyflow-v1")),
      personal,
    );
    assert(
      !(await page.evaluate(() =>
        Object.values(localStorage).join("").includes("FAKE_SCOPE_TEST_TOKEN"),
      )),
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: exact GitHub Pages origin and subpath, actual four requested scopes, fresh consent, partial grant blocks all queries, canonical email grant completes mocked identity/API flow, scope lists, mobile and data preservation. Google responses mocked; no real authorization.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
