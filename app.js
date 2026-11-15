"use strict";
const KEY = "studyflow-v1",
  BACKUP = "studyflow-backup-before-v3";
const $ = (id) => document.getElementById(id),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const uid = () =>
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  localDate = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
  today = () => localDate(new Date());
const validDate = (s) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  localDate(new Date(`${s}T12:00:00`)) === s;
const formatDate = (s) =>
  validDate(s)
    ? new Intl.DateTimeFormat("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(`${s}T12:00:00`))
    : s;
const priorities = { high: "Alta", medium: "Media", low: "Baja" };
function normalize(raw) {
  if (
    !raw ||
    typeof raw !== "object" ||
    !Array.isArray(raw.tasks) ||
    !Array.isArray(raw.exams)
  )
    throw Error("Formato de datos no válido");
  for (const [list, date] of [
    [raw.tasks, "due"],
    [raw.exams, "date"],
  ])
    for (const item of list)
      if (
        !item ||
        typeof item.name !== "string" ||
        typeof item.subject !== "string" ||
        !validDate(item[date])
      )
        throw Error("Hay registros con nombre, asignatura o fecha no válidos");
  const s = structuredClone(raw);
  s.tasks = s.tasks.map((t) => ({
    ...t,
    id: t.id || uid(),
    priority: Object.hasOwn(priorities, t.priority) ? t.priority : "medium",
  }));
  s.exams = s.exams.map((e) => ({ ...e, id: e.id || uid() }));
  s.subjects = Array.isArray(s.subjects)
    ? s.subjects
        .filter((x) => x && typeof x.name === "string")
        .map((x) => ({
          ...x,
          id: x.id || uid(),
          color: /^#[a-f\d]{6}$/i.test(x.color) ? x.color : "#b4a3ff",
        }))
    : [];
  for (const item of [...s.tasks, ...s.exams])
    if (!s.subjects.some((x) => x.name === item.subject))
      s.subjects.push({ id: uid(), name: item.subject, color: "#b4a3ff" });
  s.settings = { name: "", ...(s.settings || {}) };
  s.version = 3;
  return s;
}
let state,
  storageBlocked = false,
  loadError = "";
try {
  const raw = localStorage.getItem(KEY);
  state = normalize(raw ? JSON.parse(raw) : { tasks: [], exams: [] });
  if (raw && JSON.parse(raw).version !== 3 && !localStorage.getItem(BACKUP))
    localStorage.setItem(BACKUP, raw);
} catch (e) {
  storageBlocked = true;
  loadError =
    "No se han modificado tus datos originales. Exporta el archivo original desde Ajustes antes de recuperarlo.";
  state = normalize({ tasks: [], exams: [] });
}
let filter = "pending",
  month = new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  editing = null,
  toastTimer;
function notify(message) {
  $("toast").textContent = message;
  $("toast").style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").style.display = "none"), 5000);
}
function commit(next) {
  if (storageBlocked) {
    notify(loadError);
    return false;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    state = next;
    render();
    return true;
  } catch {
    notify(
      "No se pudo guardar. Exporta tus datos y comprueba el espacio del navegador.",
    );
    return false;
  }
}
const mutate = (fn) => {
  const next = structuredClone(state);
  fn(next);
  return commit(next);
};
const view = () =>
  ["dashboard", "tasks", "calendar", "subjects", "settings"].includes(
    location.hash.slice(1),
  )
    ? location.hash.slice(1)
    : "dashboard";
const titles = {
  dashboard: "Panel principal",
  tasks: "Mis tareas",
  calendar: "Calendario",
  subjects: "Asignaturas",
  settings: "Ajustes",
};
function head(title, sub, actions = "") {
  return `<div class="page-head"><div><span class="eyebrow">TU APRENDIZAJE, EN ORDEN</span><h1>${title}</h1><div class="subtitle">${sub}</div></div><div class="actions">${actions}</div></div>`;
}
const addButtons = () =>
  '<button class="secondary" data-action="new-exam">＋ Examen</button><button data-action="new-task">＋ Nueva tarea</button>';
function taskRows(tasks) {
  return tasks.length
    ? tasks
        .map(
          (t) =>
            `<div class="task-row ${t.done ? "done" : ""}"><input type="checkbox" data-toggle="${esc(t.id)}" aria-label="Completar ${esc(t.name)}" ${t.done ? "checked" : ""}><div class="item-body"><div class="item-title">${esc(t.name)}</div><div class="item-meta"><span class="tag">${esc(t.subject)}</span><span class="${!t.done && t.due < today() ? "overdue" : ""}">${esc(formatDate(t.due))}</span><span class="tag priority-${t.priority}">${priorities[t.priority]}</span></div></div><div class="row-actions"><button data-edit="${esc(t.id)}" data-kind="task">Editar</button><button data-delete="${esc(t.id)}" data-kind="task" aria-label="Eliminar ${esc(t.name)}">×</button></div></div>`,
        )
        .join("")
    : '<div class="empty">Todo despejado. Añade una tarea para empezar.</div>';
}
const orderedTasks = () =>
  state.tasks
    .slice()
    .sort(
      (a, b) =>
        a.due.localeCompare(b.due) ||
        { high: 0, medium: 1, low: 2 }[a.priority] -
          { high: 0, medium: 1, low: 2 }[b.priority],
    );
function examRows(exams) {
  return exams.length
    ? exams
        .map(
          (e) =>
            `<div class="exam-row"><div class="date-box">${Number(e.date.slice(8))}<small>${new Intl.DateTimeFormat("es-ES", { month: "short" }).format(new Date(e.date + "T12:00:00"))} ${e.date.slice(0, 4)}</small></div><div class="item-body"><div class="item-title">${esc(e.name)}</div><div class="item-meta">${esc(e.subject)}</div></div><div class="row-actions"><button data-edit="${esc(e.id)}" data-kind="exam">Editar</button><button data-delete="${esc(e.id)}" data-kind="exam" aria-label="Eliminar ${esc(e.name)}">×</button></div></div>`,
        )
        .join("")
    : '<div class="empty">Sin exámenes próximos. Respira y sigue avanzando.</div>';
}
function dashboard() {
  const pending = state.tasks.filter((t) => !t.done),
    done = state.tasks.length - pending.length,
    exams = state.exams
      .filter((e) => e.date >= today())
      .sort((a, b) => a.date.localeCompare(b.date)),
    percent = state.tasks.length
      ? Math.round((done / state.tasks.length) * 100)
      : 0;
  return (
    head(
      `Tu próximo gran paso${state.settings.name ? ", " + esc(state.settings.name) : ""} ✦`,
      "Un vistazo a tu día. Un poco más cerca de tus objetivos.",
      addButtons(),
    ) +
    `<section class="stats">${[
      [
        "Tareas pendientes",
        pending.length,
        "accent",
        "Organiza tu siguiente paso",
      ],
      ["Exámenes próximos", exams.length, "peach", "Prepárate con tiempo"],
      ["Tareas completadas", done, "mint", "Cada avance cuenta"],
      [
        "Asignaturas",
        state.subjects.length,
        "blue",
        "Tu universo de aprendizaje",
      ],
    ]
      .map(
        ([label, n, c, note]) =>
          `<div class="card"><div class="stat-label">${label}</div><div class="stat-value ${c}">${n}</div><div class="stat-note">${note}</div></div>`,
      )
      .join(
        "",
      )}</section><div class="dashboard-grid"><section class="card"><div class="section-head"><h2>Próximas entregas</h2><a class="text-link" href="#tasks">Ver todas →</a></div>${taskRows(
      orderedTasks()
        .filter((t) => !t.done)
        .slice(0, 6),
    )}</section><div class="stack"><section class="card"><div class="section-head"><h2>Próximos exámenes</h2><a class="text-link" href="#calendar">Calendario →</a></div>${examRows(exams.slice(0, 3))}</section><section class="card focus-card"><span class="eyebrow">PASO A PASO</span><h2 style="margin-top:12px">Lo estás construyendo.</h2><p>No necesitas hacerlo todo hoy. Empieza por una tarea y celebra cada avance.</p><div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div><div class="stat-note">${percent}% completado · ${done} de ${state.tasks.length} tareas</div></section></div></div>`
  );
}
function tasksView() {
  return (
    head(
      "Mis tareas",
      "De las ideas a los objetivos cumplidos.",
      addButtons(),
    ) +
    `<section class="card"><div class="tabs">${[
      ["pending", "Pendientes"],
      ["all", "Todas"],
      ["done", "Completadas"],
    ]
      .map(
        ([v, l]) =>
          `<button class="${filter === v ? "active" : ""}" data-filter="${v}" aria-pressed="${filter === v}">${l}</button>`,
      )
      .join(
        "",
      )}</div>${taskRows(orderedTasks().filter((t) => filter === "all" || (filter === "done" ? t.done : !t.done)))}</section><section class="card" style="margin-top:20px"><div class="section-head"><h2>Todos los exámenes</h2></div>${examRows(state.exams.slice().sort((a, b) => a.date.localeCompare(b.date)))}</section>`
  );
}
function calendarView() {
  const y = month.getFullYear(),
    m = month.getMonth(),
    first = (new Date(y, m, 1).getDay() + 6) % 7,
    days = new Date(y, m + 1, 0).getDate();
  let cells = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
    .map((d) => `<div class="weekday">${d}</div>`)
    .join("");
  for (let i = 0; i < Math.ceil((first + days) / 7) * 7; i++) {
    let n = i - first + 1;
    if (n < 1 || n > days) {
      cells += '<div class="day other"></div>';
      continue;
    }
    const date = localDate(new Date(y, m, n));
    cells +=
      `<div class="day ${date === today() ? "today" : ""}" data-date="${date}"><button class="day-number" data-new-date="${date}" aria-label="Añadir tarea el ${date}">${n}</button>` +
      state.tasks
        .filter((t) => t.due === date)
        .map(
          (t) =>
            `<button class="event ${t.done ? "finished" : ""}" data-edit="${esc(t.id)}" data-kind="task">☑ ${esc(t.name)}</button>`,
        )
        .join("") +
      state.exams
        .filter((e) => e.date === date)
        .map(
          (e) =>
            `<button class="event exam" data-edit="${esc(e.id)}" data-kind="exam">◇ ${esc(e.name)}</button>`,
        )
        .join("") +
      "</div>";
  }
  return (
    head(
      "Cada cosa, a su tiempo",
      "Tus entregas y exámenes, justo donde deben estar.",
      addButtons(),
    ) +
    `<section class="card calendar-card"><div class="section-head"><h2>Tu calendario</h2><div class="calendar-controls"><button class="secondary" data-month="-1" aria-label="Mes anterior">‹</button><strong>${new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(month)}</strong><button class="secondary" data-month="1" aria-label="Mes siguiente">›</button><button class="secondary" data-action="today">Hoy</button></div></div><div class="calendar-grid">${cells}</div><p class="legend">☑ Tareas · ◇ Exámenes · Pulsa un día para añadir una tarea o un evento para editarlo.</p></section>`
  );
}
function subjectsView() {
  return (
    head("Tus asignaturas", "Dale a cada materia su propio espacio.") +
    `<form id="subjectForm" class="card subject-form"><label>Nombre de la asignatura<input name="name" required maxlength="80" placeholder="Ej. Matemáticas"></label><label class="color-field">Color<input name="color" type="color" value="#b4a3ff"></label><button>Añadir asignatura</button></form><div class="subjects-grid">${state.subjects.map((s) => `<section class="card"><div class="subject-color" style="background:${s.color}"></div><h2>${esc(s.name)}</h2><p class="muted">${state.tasks.filter((t) => t.subject === s.name && !t.done).length} tareas pendientes · ${state.exams.filter((e) => e.subject === s.name).length} exámenes</p><div class="row-actions"><button data-subject-edit="${esc(s.id)}">Editar</button><button data-subject-delete="${esc(s.id)}">Eliminar</button></div></section>`).join("") || '<div class="empty">Añade tu primera asignatura para organizar tu curso.</div>'}</div>`
  );
}
function settingsView() {
  return (
    head("A tu manera", "Un espacio que se adapta a ti.") +
    `<div class="settings"><section class="card"><h2>Tu perfil</h2><form id="profileForm" style="margin-top:20px"><label>¿Cómo te llamas?<input name="name" maxlength="40" value="${esc(state.settings.name)}" placeholder="Tu nombre"></label><button>Guardar ajustes</button></form></section><section class="card"><h2>Tus datos, bajo tu control</h2><p>Los datos se guardan únicamente en este navegador. Usa la misma dirección web para conservar el acceso y exporta copias antes de borrar los datos del navegador o cambiar de dispositivo.</p><div class="actions"><button data-action="export">Exportar copia JSON</button><button class="secondary" data-action="import">Importar copia</button><button class="secondary" data-action="original">Exportar datos originales</button></div><input id="importFile" type="file" accept="application/json,.json" hidden><p>La importación valida el archivo y crea una copia local de los datos actuales antes de reemplazarlos. StudyFlow no está conectado a Classroom ni Moodle.</p></section><section class="card"><h2>StudyFlow 3.0</h2><p>Tema oscuro · Sin cuentas · Sin dependencias externas</p></section></div>`
  );
}
function render() {
  const v = view();
  $("breadcrumb").textContent = "Mi espacio / " + titles[v];
  document.querySelectorAll("nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.view === v);
    if (a.dataset.view === v) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  $("navCount").textContent = state.tasks.filter((t) => !t.done).length;
  $("main").innerHTML =
    (storageBlocked ? `<p role="alert" class="card">${loadError}</p>` : "") +
    {
      dashboard,
      tasks: tasksView,
      calendar: calendarView,
      subjects: subjectsView,
      settings: settingsView,
    }[v]();
}
function openEditor(kind, id = null, date = today()) {
  if (!state.subjects.length) {
    location.hash = "subjects";
    notify("Añade primero una asignatura.");
    return;
  }
  const item = id
    ? (kind === "task" ? state.tasks : state.exams).find(
        (t) => String(t.id) === id,
      )
    : null;
  if (id && !item) return;
  editing = { kind, id };
  const form = $("itemForm");
  form.reset();
  form.elements.subject.innerHTML = state.subjects
    .map((s) => `<option value="${esc(s.name)}">${esc(s.name)}</option>`)
    .join("");
  $("dialogTitle").textContent =
    (id ? "Editar " : "Nuev" + (kind === "task" ? "a " : "o ")) +
    (kind === "task" ? "tarea" : "examen");
  form.elements.name.value = item?.name || "";
  form.elements.subject.value = item?.subject || state.subjects[0].name;
  form.elements.date.value = item?.due || item?.date || date;
  form.elements.priority.value = item?.priority || "medium";
  $("priorityField").hidden = kind !== "task";
  $("editor").showModal();
}
$("itemForm").onsubmit = (e) => {
  e.preventDefault();
  const f = e.target.elements,
    name = f.name.value.trim();
  if (!name || !validDate(f.date.value)) {
    notify("Introduce un nombre y una fecha válidos.");
    return;
  }
  const { kind, id } = editing;
  if (
    mutate((s) => {
      const list = kind === "task" ? s.tasks : s.exams;
      const fields = {
        name,
        subject: f.subject.value,
        [kind === "task" ? "due" : "date"]: f.date.value,
        ...(kind === "task" ? { priority: f.priority.value } : {}),
      };
      if (id)
        Object.assign(
          list.find((t) => String(t.id) === id),
          fields,
        );
      else
        list.push({
          id: uid(),
          ...fields,
          ...(kind === "task" ? { done: false } : {}),
        });
    })
  ) {
    $("editor").close();
    notify("Guardado. Sigue avanzando.");
  }
};
$("closeDialog").onclick = $("cancelDialog").onclick = () =>
  $("editor").close();
function download(raw, name) {
  const url = URL.createObjectURL(
    new Blob([raw], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const d = b.dataset;
  if (d.action === "new-task") openEditor("task");
  if (d.action === "new-exam") openEditor("exam");
  if (d.edit) openEditor(d.kind, d.edit);
  if (d.delete && confirm("¿Eliminar este registro?"))
    mutate((s) => {
      const key = d.kind === "task" ? "tasks" : "exams";
      s[key] = s[key].filter((t) => String(t.id) !== d.delete);
    });
  if (d.filter) {
    filter = d.filter;
    render();
  }
  if (d.month) {
    month.setMonth(month.getMonth() + Number(d.month));
    render();
  }
  if (d.action === "today") {
    month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    render();
  }
  if (d.newDate) openEditor("task", null, d.newDate);
  if (d.action === "export")
    download(JSON.stringify(state, null, 2), "studyflow-datos.json");
  if (d.action === "original") {
    try {
      download(
        localStorage.getItem(BACKUP) || localStorage.getItem(KEY) || "{}",
        "studyflow-original.json",
      );
    } catch {
      notify("No se puede acceder al almacenamiento.");
    }
  }
  if (d.action === "import") $("importFile").click();
  if (d.subjectDelete) {
    const s = state.subjects.find((s) => String(s.id) === d.subjectDelete);
    if (
      state.tasks.some((t) => t.subject === s.name) ||
      state.exams.some((t) => t.subject === s.name)
    ) {
      notify(
        "Esta asignatura tiene registros. Reasígnalos antes de eliminarla.",
      );
      return;
    }
    if (confirm("¿Eliminar esta asignatura?"))
      mutate((n) => (n.subjects = n.subjects.filter((x) => x.id !== s.id)));
  }
  if (d.subjectEdit) {
    const s = state.subjects.find((s) => String(s.id) === d.subjectEdit),
      name = prompt("Nombre de la asignatura", s.name)?.trim();
    if (!name) return;
    if (
      name.length > 80 ||
      state.subjects.some(
        (x) => x.id !== s.id && x.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      notify("El nombre debe ser único y tener hasta 80 caracteres.");
      return;
    }
    const color = prompt("Color hexadecimal (#aabbcc)", s.color);
    if (color === null) return;
    if (!/^#[a-f\d]{6}$/i.test(color)) {
      notify("Color no válido.");
      return;
    }
    mutate((n) => {
      Object.assign(
        n.subjects.find((x) => x.id === s.id),
        { name, color },
      );
      for (const t of [...n.tasks, ...n.exams])
        if (t.subject === s.name) t.subject = name;
    });
  }
});
document.addEventListener("change", async (e) => {
  if (e.target.dataset.toggle)
    mutate((s) => {
      const t = s.tasks.find((t) => String(t.id) === e.target.dataset.toggle);
      t.done = !t.done;
    });
  if (e.target.id === "importFile" && e.target.files[0]) {
    try {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024)
        throw Error("El archivo supera los 5 MB");
      const next = normalize(JSON.parse(await file.text()));
      if (
        !confirm(
          `¿Importar ${next.tasks.length} tareas y ${next.exams.length} exámenes? Se reemplazarán los datos actuales.`,
        )
      )
        return;
      if (storageBlocked)
        throw Error(
          "Exporta y recupera los datos originales antes de importar.",
        );
      localStorage.setItem("studyflow-before-import", JSON.stringify(state));
      if (commit(next)) notify("Copia importada correctamente.");
    } catch (error) {
      notify("No se ha importado: " + error.message);
    }
  }
});
document.addEventListener("submit", (e) => {
  if (e.target.id === "subjectForm") {
    e.preventDefault();
    const f = e.target.elements,
      name = f.name.value.trim();
    if (
      !name ||
      state.subjects.some((s) => s.name.toLowerCase() === name.toLowerCase())
    ) {
      notify("Introduce un nombre único.");
      return;
    }
    mutate((s) => s.subjects.push({ id: uid(), name, color: f.color.value }));
  }
  if (e.target.id === "profileForm") {
    e.preventDefault();
    if (mutate((s) => (s.settings.name = e.target.elements.name.value.trim())))
      notify("Ajustes guardados.");
  }
});
$("menu").onclick = () => {
  const open = $("sidebar").classList.toggle("open");
  $("menu").setAttribute("aria-expanded", open);
};
document.querySelector("nav").addEventListener("click", () => {
  $("sidebar").classList.remove("open");
  $("menu").setAttribute("aria-expanded", "false");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $("sidebar").classList.remove("open");
    $("menu").setAttribute("aria-expanded", "false");
  }
});
window.addEventListener("hashchange", render);
render();
