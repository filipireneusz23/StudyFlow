/* Google Classroom read-only integration. Tokens live only in private memory.
 * Configuration and imported records are isolated from studyflow-v1.
 */
(function (root) {
  "use strict";
  const SCOPES = [
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
    "openid",
    "email",
  ];
  const CONFIG_KEY = "studyflow-classroom-config",
    CACHE_KEY = "studyflow-classroom-cache";
  const empty = () => ({
    account: null,
    courses: [],
    tasks: [],
    lastSync: null,
  });
  const dateKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function safeLink(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" &&
        url.hostname === "classroom.google.com"
        ? url.href
        : "";
    } catch {
      return "";
    }
  }
  function normalizeWork(course, work, submission) {
    if (!course.id || !work.id)
      throw Error(
        "Classroom devolvió una actividad sin identificador. Se conserva la copia anterior.",
      );
    let due = null,
      dueAt = null;
    if (work.dueDate) {
      const { year, month, day } = work.dueDate;
      const date = new Date(Date.UTC(year, month - 1, day));
      if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
      )
        throw Error(
          "Classroom devolvió una fecha de entrega no válida. Se conserva la copia anterior.",
        );
      due = date.toISOString().slice(0, 10);
      if (work.dueTime) {
        const { hours = 0, minutes = 0, seconds = 0, nanos = 0 } = work.dueTime;
        if (
          hours < 0 ||
          hours > 23 ||
          minutes < 0 ||
          minutes > 59 ||
          seconds < 0 ||
          seconds > 59
        )
          throw Error("Hora de entrega no válida.");
        const instant = new Date(
          Date.UTC(
            year,
            month - 1,
            day,
            hours,
            minutes,
            seconds,
            Math.floor(nanos / 1e6),
          ),
        );
        dueAt = instant.toISOString();
        due = dateKey(instant);
      }
    }
    const status = submission?.state || "UNKNOWN";
    return {
      id: `classroom:${course.id}:${work.id}`,
      courseId: String(course.id),
      workId: String(work.id),
      name: work.title || "Actividad sin título",
      description: work.description || "",
      courseName: course.name || "Clase sin nombre",
      due,
      dueAt,
      status,
      done: ["TURNED_IN", "RETURNED"].includes(status),
      url: safeLink(work.alternateLink),
      origin: "classroom",
      availability: course.courseState === "ACTIVE" ? "active" : "archived",
    };
  }
  function mergeSnapshot(previous, courses, tasks) {
    const ids = new Set(tasks.map((t) => t.id)),
      byCourse = new Map(courses.map((c) => [String(c.id), c]));
    const old = previous.tasks
      .filter((t) => !ids.has(t.id))
      .map((t) => ({
        ...t,
        availability:
          byCourse.get(t.courseId)?.courseState === "ACTIVE"
            ? "removed"
            : "archived",
      }));
    return [...tasks, ...old];
  }
  function loadGoogle() {
    if (root.google?.accounts?.oauth2) return Promise.resolve(root.google);
    if (loadGoogle.pending) return loadGoogle.pending;
    loadGoogle.pending = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      const timeout = setTimeout(() => {
        loadGoogle.pending = null;
        script.remove();
        reject(
          Error(
            "Google Identity Services no responde. Comprueba la conexión y los bloqueadores del navegador.",
          ),
        );
      }, 15000);
      script.onload = () => {
        clearTimeout(timeout);
        if (root.google?.accounts?.oauth2) resolve(root.google);
        else {
          loadGoogle.pending = null;
          reject(Error("No se pudo cargar Google Identity Services."));
        }
      };
      script.onerror = () => {
        clearTimeout(timeout);
        loadGoogle.pending = null;
        script.remove();
        reject(
          Error(
            "No se pudo cargar Google Identity Services. Comprueba la conexión.",
          ),
        );
      };
      document.head.append(script);
    });
    return loadGoogle.pending;
  }
  class ClassroomClient {
    #google = null;
    #token = null;
    #expires = 0;
    #generation = 0;
    #inflight = null;
    #expiryTimer = null;
    #lastAttempt = -Infinity;
    constructor(options = {}) {
      try {
        this.storage = options.storage || root.localStorage;
      } catch {
        this.storage = {
          getItem() {
            throw Error("Almacenamiento no disponible");
          },
        };
      }
      this.fetch = options.fetch || root.fetch.bind(root);
      this.now = options.now || Date.now;
      this.identity = options.identity || loadGoogle;
      this.onchange =
        options.onchange ||
        (() => root.dispatchEvent(new Event("classroomchange")));
      this.sleep =
        options.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
      this.error = "";
      this.busy = false;
      this.ready = false;
      this.loading = false;
      this.config = { clientId: "", mapping: {} };
      this.cache = empty();
      this.corrupt = false;
      try {
        const config = JSON.parse(this.storage.getItem(CONFIG_KEY) || "null");
        const cache = JSON.parse(this.storage.getItem(CACHE_KEY) || "null");
        if (config) {
          if (
            typeof config.clientId !== "string" ||
            !config.mapping ||
            typeof config.mapping !== "object" ||
            Array.isArray(config.mapping)
          )
            throw Error();
          this.config = config;
        }
        if (cache) {
          if (
            !Array.isArray(cache.tasks) ||
            !Array.isArray(cache.courses) ||
            (cache.lastSync && !Number.isFinite(Date.parse(cache.lastSync))) ||
            cache.tasks.some(
              (t) =>
                !t ||
                typeof t.id !== "string" ||
                typeof t.courseId !== "string" ||
                typeof t.name !== "string" ||
                t.origin !== "classroom" ||
                (t.dueAt && !Number.isFinite(Date.parse(t.dueAt))),
            ) ||
            cache.courses.some(
              (c) =>
                !c || typeof c.id !== "string" || typeof c.name !== "string",
            )
          )
            throw Error();
          this.cache = cache;
        }
      } catch {
        this.corrupt = true;
        this.error =
          "No se pudo leer la copia local de Classroom. No se ha sobrescrito; conserva una copia de los datos del navegador antes de recuperarla.";
      }
    }
    get connected() {
      return Boolean(this.#token && this.now() < this.#expires);
    }
    get status() {
      return !this.config.clientId
        ? "Pendiente de configuración"
        : this.connected
          ? "Conectado"
          : "Desconectado";
    }
    emit() {
      this.onchange();
    }
    fail(error) {
      this.error = error.message || String(error);
      this.emit();
    }
    saveConfig(clientId) {
      clientId = clientId.trim();
      if (clientId && !/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId))
        throw Error(
          "Introduce un OAuth Client ID de aplicación web terminado en .apps.googleusercontent.com.",
        );
      if (this.corrupt) throw Error(this.error);
      if (this.connected || this.busy)
        throw Error("Desconecta Classroom antes de cambiar el Client ID.");
      const config = { ...this.config, clientId };
      this.storage.setItem(CONFIG_KEY, JSON.stringify(config));
      this.config = config;
      this.ready = false;
      this.error = "";
      this.emit();
      if (clientId) this.prepare();
    }
    async prepare() {
      if (this.corrupt || !this.config.clientId || this.loading || this.ready)
        return;
      this.loading = true;
      this.emit();
      try {
        this.#google = await this.identity();
        this.ready = true;
        this.error = "";
      } catch (e) {
        this.fail(e);
      } finally {
        this.loading = false;
        this.emit();
      }
    }
    setMapping(courseId, subjectId) {
      if (this.corrupt) throw Error(this.error);
      if (!this.cache.courses.some((c) => String(c.id) === courseId))
        throw Error("Asignatura de Classroom no disponible.");
      const config = {
        ...this.config,
        mapping: { ...this.config.mapping, [courseId]: subjectId },
      };
      this.storage.setItem(CONFIG_KEY, JSON.stringify(config));
      this.config = config;
      this.emit();
    }
    connect() {
      if (!this.config.clientId) {
        this.fail(Error("Configura primero el Client ID de Google Cloud."));
        return;
      }
      if (this.corrupt) {
        this.emit();
        return;
      }
      if (!this.ready) {
        this.prepare();
        return;
      }
      if (this.busy) return;
      this.busy = true;
      this.error = "";
      this.emit();
      const generation = ++this.#generation;
      // requestAccessToken is called directly from a user click, preserving popup activation.
      const google = this.#google;
      try {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: this.config.clientId,
          scope: SCOPES.join(" "),
          include_granted_scopes: false,
          error_callback: () => {
            if (generation !== this.#generation) return;
            this.busy = false;
            this.fail(
              Error(
                "No se completó el acceso de Google. Permite la ventana emergente y vuelve a conectar.",
              ),
            );
          },
          callback: async (response) => {
            if (generation !== this.#generation) return;
            try {
              if (response.error)
                throw Error(
                  "Google no autorizó el acceso. Comprueba el consentimiento, los usuarios de prueba y las restricciones del administrador.",
                );
              if (
                !google.accounts.oauth2.hasGrantedAllScopes(
                  response,
                  ...SCOPES.slice(0, 2),
                )
              )
                throw Error(
                  "Permisos insuficientes: autoriza la lectura de tus clases y actividades.",
                );
              if (
                !response.access_token ||
                !Number.isFinite(Number(response.expires_in)) ||
                Number(response.expires_in) <= 30
              )
                throw Error("Google no devolvió una autorización válida.");
              this.#token = response.access_token;
              this.#expires =
                this.now() + (Number(response.expires_in) - 30) * 1000;
              const profile = await this.request(
                "https://openidconnect.googleapis.com/v1/userinfo",
                generation,
              );
              if (!profile.sub)
                throw Error(
                  "No se pudo identificar la cuenta de Google. Autoriza el acceso a la identidad básica.",
                );
              if (generation !== this.#generation) return;
              if (this.cache.account?.sub !== profile.sub) {
                this.storage.removeItem(CACHE_KEY);
                this.cache = empty();
              }
              this.cache = {
                ...this.cache,
                account: { sub: profile.sub, email: profile.email || "" },
              };
              clearTimeout(this.#expiryTimer);
              this.#expiryTimer = setTimeout(
                () => {
                  this.#token = null;
                  this.error =
                    "La autorización ha caducado. Vuelve a conectar para actualizar Classroom.";
                  this.emit();
                },
                Math.min(this.#expires - this.now(), 2147483647),
              );
              this.busy = false;
              this.#lastAttempt = -Infinity;
              this.emit();
              await this.sync();
            } catch (e) {
              if (generation === this.#generation) {
                this.#token = null;
                this.#expires = 0;
                this.busy = false;
                this.fail(e);
              }
            }
          },
        });
        client.requestAccessToken({ prompt: "select_account" });
      } catch (e) {
        this.busy = false;
        this.fail(e);
      }
    }
    async request(url, generation = this.#generation) {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (generation !== this.#generation)
          throw Error("La conexión ha cambiado.");
        if (!this.connected)
          throw Error(
            "La autorización ha caducado. Vuelve a conectar con Google Classroom.",
          );
        const controller = new AbortController(),
          timer = setTimeout(() => controller.abort(), 20000);
        let response;
        try {
          response = await this.fetch(url, {
            headers: { Authorization: `Bearer ${this.#token}` },
            signal: controller.signal,
            cache: "no-store",
            credentials: "omit",
          });
        } catch {
          throw Error(
            "No se pudo conectar con Google. Comprueba la red y vuelve a sincronizar.",
          );
        } finally {
          clearTimeout(timer);
        }
        if (generation !== this.#generation)
          throw Error("La conexión ha cambiado.");
        if (response.status === 401) {
          this.#token = null;
          this.#expires = 0;
          throw Error(
            "La autorización ha caducado o ha sido revocada. Vuelve a conectar.",
          );
        }
        if (response.status === 403)
          throw Error(
            "Permisos insuficientes: habilita Classroom API, revisa los permisos OAuth y consulta al administrador de tu centro si bloquea aplicaciones externas.",
          );
        if (
          (response.status === 429 ||
            [500, 502, 503, 504].includes(response.status)) &&
          attempt < 2
        ) {
          const header = response.headers.get("Retry-After");
          const delay =
            header === null
              ? NaN
              : /^\d+$/.test(header)
                ? Number(header)
                : (Date.parse(header) - this.now()) / 1000;
          if (delay > 5)
            throw Error(
              "Google pide esperar antes de volver a sincronizar. Se conserva la copia anterior.",
            );
          await this.sleep(
            Math.min(
              5000,
              Math.max(
                1000,
                (Number.isFinite(delay) ? delay : 2 ** attempt) * 1000,
              ),
            ),
          );
          continue;
        }
        if (!response.ok)
          throw Error(
            response.status === 429
              ? "Google ha limitado las solicitudes. Espera antes de volver a sincronizar."
              : `Google Classroom no pudo completar la consulta (HTTP ${response.status}). Se conserva la copia anterior.`,
          );
        return response.json();
      }
    }
    async list(path, field, params = {}, generation = this.#generation) {
      const items = [],
        seen = new Set();
      let pageToken = "";
      do {
        const url = new URL("https://classroom.googleapis.com/v1/" + path);
        for (const [key, value] of Object.entries({
          ...params,
          pageSize: 100,
          ...(pageToken ? { pageToken } : {}),
        }))
          url.searchParams.set(key, value);
        const data = await this.request(url.href, generation);
        if (data[field] !== undefined && !Array.isArray(data[field]))
          throw Error("Respuesta de Classroom no válida.");
        items.push(...(data[field] || []));
        pageToken = data.nextPageToken || "";
        if (pageToken) {
          if (seen.has(pageToken) || seen.size >= 1000)
            throw Error("Google devolvió una paginación no válida.");
          seen.add(pageToken);
        }
      } while (pageToken);
      return items;
    }
    async sync({ automatic = false } = {}) {
      if (this.#inflight) return this.#inflight;
      if (!this.connected) {
        if (!automatic)
          this.fail(Error("Vuelve a conectar con Google para sincronizar."));
        return false;
      }
      if (this.now() - this.#lastAttempt < 15000) {
        if (!automatic)
          this.fail(
            Error("Espera unos segundos antes de volver a sincronizar."),
          );
        return false;
      }
      this.#lastAttempt = this.now();
      const generation = this.#generation;
      this.busy = true;
      this.error = "";
      this.emit();
      this.#inflight = (async () => {
        try {
          const allCourses = await this.list(
            "courses",
            "courses",
            { studentId: "me" },
            generation,
          );
          const courses = Array.from(
            new Map(
              allCourses
                .filter((c) => ["ACTIVE", "ARCHIVED"].includes(c.courseState))
                .map((c) => [
                  String(c.id),
                  {
                    id: String(c.id),
                    name: c.name || "Clase sin nombre",
                    courseState: c.courseState,
                    url: safeLink(c.alternateLink),
                  },
                ]),
            ).values(),
          );
          const tasks = [];
          // Sequential requests bound concurrency. Every page must succeed before committing a snapshot.
          for (const course of courses) {
            if (course.courseState !== "ACTIVE") continue;
            const path = `courses/${encodeURIComponent(course.id)}/courseWork`;
            const works = await this.list(
              path,
              "courseWork",
              { courseWorkStates: "PUBLISHED" },
              generation,
            );
            const submissions = await this.list(
              path + "/-/studentSubmissions",
              "studentSubmissions",
              { userId: "me" },
              generation,
            );
            const byWork = new Map(
              submissions.map((s) => [String(s.courseWorkId), s]),
            );
            const unique = new Map(
              works
                .filter((w) => !w.state || w.state === "PUBLISHED")
                .map((w) => [String(w.id), w]),
            );
            for (const work of unique.values())
              tasks.push(
                normalizeWork(course, work, byWork.get(String(work.id))),
              );
          }
          if (generation !== this.#generation) return false;
          const next = {
            account: this.cache.account,
            courses,
            tasks: mergeSnapshot(this.cache, courses, tasks),
            lastSync: new Date(this.now()).toISOString(),
          };
          try {
            this.storage.setItem(CACHE_KEY, JSON.stringify(next));
          } catch {
            throw Error(
              "No se pudo guardar la copia de Classroom. Comprueba el espacio del navegador; se conserva la copia anterior.",
            );
          }
          this.cache = next;
          return true;
        } catch (e) {
          if (generation === this.#generation) this.fail(e);
          return false;
        } finally {
          if (generation === this.#generation) {
            this.busy = false;
            this.emit();
            this.#inflight = null;
          }
        }
      })();
      return this.#inflight;
    }
    async disconnect() {
      const token = this.#token;
      ++this.#generation;
      this.#token = null;
      this.#expires = 0;
      clearTimeout(this.#expiryTimer);
      this.busy = false;
      this.#inflight = null;
      this.cache = empty();
      this.error = "";
      try {
        this.storage.removeItem(CACHE_KEY);
      } catch {
        this.error =
          "Se cerró la conexión, pero no se pudo retirar la copia local de Classroom.";
      }
      this.emit();
      if (token) {
        try {
          const google = await this.identity();
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error()), 10000);
            google.accounts.oauth2.revoke(token, (result) => {
              clearTimeout(timer);
              result?.error || result?.successful === false
                ? reject(Error())
                : resolve();
            });
          });
        } catch {
          this.error =
            "Desconectado localmente. No se pudo confirmar la revocación en Google: retira StudyFlow desde las conexiones de tu cuenta de Google.";
          this.emit();
        }
      } else {
        this.error =
          "Desconectado localmente. Para revocar autorizaciones anteriores, retira StudyFlow desde las conexiones de tu cuenta de Google.";
        this.emit();
      }
    }
    autoSync() {
      if (this.connected && this.now() - this.#lastAttempt >= 300000)
        this.sync({ automatic: true });
    }
  }
  const exports = {
    ClassroomClient,
    normalizeWork,
    mergeSnapshot,
    safeLink,
    SCOPES,
    CONFIG_KEY,
    CACHE_KEY,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = exports;
  else root.Classroom = exports;
})(globalThis);
