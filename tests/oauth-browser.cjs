// These tests reproduce GIS callbacks in a controlled browser; no real account is authorized.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    const logs = [],
      errors = [];
    page.on("console", (m) => logs.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-11-15T12:00:00Z") });
    await page.route("https://accounts.google.com/gsi/client", (r) =>
      r.fulfill({
        contentType: "application/javascript",
        body: `window.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:options=>{window.oauthTestCallbacks=options;return{requestAccessToken(){}}},revoke:(t,cb)=>cb({successful:true})}}};`,
      }),
    );
    let identityRejected = false;
    await page.route("https://openidconnect.googleapis.com/**", (r) =>
      identityRejected
        ? r.fulfill({
            status: 403,
            json: { error: { status: "PERMISSION_DENIED" } },
          })
        : r.fulfill({
            json: { sub: "student", email: "student@example.test" },
          }),
    );
    await page.route("https://classroom.googleapis.com/**", (r) =>
      r.fulfill({
        status: 403,
        json: { error: { details: [{ reason: "SERVICE_DISABLED" }] } },
      }),
    );
    await page.goto("http://127.0.0.1:8000/#settings");
    const personal = await page.evaluate(() =>
      localStorage.getItem("studyflow-v1"),
    );
    await page
      .locator("#classroomConfig input")
      .fill("oauth-test.apps.googleusercontent.com");
    await page.getByRole("button", { name: "Guardar Client ID" }).click();
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-action="classroom-connect"]').disabled,
    );
    const connect = () =>
      page
        .getByRole("button", { name: "Conectar con Google Classroom" })
        .click();
    await connect();
    assert.match(
      await page.locator("#classroomProgress").innerText(),
      /Esperando la respuesta/,
    );
    await page.clock.fastForward(90001);
    assert.match(
      await page.getByRole("alert").innerText(),
      /no ha devuelto una respuesta/,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Conectar con Google Classroom" })
        .isEnabled(),
      true,
    );
    await connect();
    await page.evaluate(() =>
      oauthTestCallbacks.error_callback({ type: "popup_closed" }),
    );
    assert.match(
      await page.getByRole("alert").innerText(),
      /ventana de Google se cerró/,
    );
    await connect();
    await page.evaluate(() =>
      oauthTestCallbacks.callback({
        access_token: "TEST_ONLY_OAUTH_SECRET",
        expires_in: 3600,
      }),
    );
    assert.match(
      await page.getByRole("alert").innerText(),
      /API no está habilitada/,
    );
    assert.equal(await page.getByText("Conectado", { exact: true }).count(), 1);
    await page.locator(".oauth-diagnostics summary").click();
    const detail = await page.locator(".oauth-diagnostics").innerText();
    assert.match(detail, /Respuesta OAuth recibida: sí/);
    assert.match(detail, /Token de acceso recibido: sí/);
    assert.match(detail, /Cuenta verificada: sí/);
    assert.match(detail, /SERVICE_DISABLED/);
    assert(
      !(await page.locator("body").innerText()).includes(
        "TEST_ONLY_OAUTH_SECRET",
      ),
    );
    assert(!logs.join("").includes("TEST_ONLY_OAUTH_SECRET"));
    assert(
      !(await page.evaluate(() =>
        Object.values(localStorage).join("").includes("TEST_ONLY_OAUTH_SECRET"),
      )),
    );
    await page
      .getByRole("button", { name: "Desconectar", exact: true })
      .click();
    identityRejected = true;
    await connect();
    await page.evaluate(() =>
      oauthTestCallbacks.callback({
        access_token: "TEST_ONLY_OAUTH_SECRET",
        expires_in: 3600,
      }),
    );
    assert.match(await page.getByRole("alert").innerText(), /identidad.*403/);
    assert.equal(
      await page.getByText("Desconectado", { exact: true }).count(),
      1,
    );
    await connect();
    await page.getByRole("button", { name: "Cancelar conexión" }).click();
    assert.match(
      await page.locator("#classroomProgress").innerText(),
      /cancelado/,
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("studyflow-v1")),
      personal,
    );
    assert.equal(
      (await page.request.get("http://127.0.0.1:8000/favicon.svg")).status(),
      200,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: visible waiting/timeout, popup-close error, successful OAuth followed by disabled API, safe callback/token booleans, identity rejection, retry, cancel, favicon, personal-data preservation. No real OAuth authorization performed.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
