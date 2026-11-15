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
const classroom = new Classroom.ClassroomClient();
let originFilter = "all",
  subjectFilter = "all";
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
function allTasks() {
  return [
    ...state.tasks,
    ...classroom.cache.tasks.map((t) => ({
      ...t,
      due: t.dueAt ? localDate(new Date(t.dueAt)) : t.due,
      subject: classroomSubject(t.courseId, t.courseName),
      priority: "medium",
    })),
  ];
}
const activeTask = (t) =>
  t.origin !== "classroom" || t.availability === "active";
const overdue = (t) =>
  !t.done &&
  Boolean(t.due) &&
  (t.dueAt ? new Date(t.dueAt).getTime() < Date.now() : t.due < today());
const statusLabels = {
  NEW: "Asignada",
  CREATED: "Pendiente",
  TURNED_IN: "Entregada",
  RETURNED: "Devuelta",
  RECLAIMED_BY_STUDENT: "Retirada por el alumno",
  UNKNOWN: "Estado no disponible",
};
function taskRows(tasks) {
  return tasks.length
    ? tasks
        .map(
          (t) =>
            `<div class="task-row ${t.done ? "done" : ""}">${t.origin === "classroom" ? '<span class="classroom-mark" title="Solo lectura">▣</span>' : `<input type="checkbox" data-toggle="${esc(t.id)}" aria-label="Completar ${esc(t.name)}" ${t.done ? "checked" : ""}>`}<div class="item-body"><div class="item-title">${esc(t.name)}</div><div class="item-meta"><span class="tag">${esc(t.subject)}</span><span class="${overdue(t) ? "overdue" : ""}">${taskDate(t)}</span>${t.origin === "classroom" ? `<span class="tag classroom-tag">Google Classroom${classroom.connected ? "" : " · copia local"}</span><span>${esc(statusLabels[t.status] || t.status)}</span>${!activeTask(t) ? '<span class="tag">Archivada / no disponible</span>' : ""}` : `<span class="tag priority-${t.priority}">${priorities[t.priority]}</span>`}</div></div><div class="row-actions">${t.origin === "classroom" ? `<button data-classroom="${esc(t.id)}">Ver detalles</button>${Classroom.safeLink(t.url) ? `<a class="text-link" href="${esc(Classroom.safeLink(t.url))}" target="_blank" rel="noopener noreferrer">Abrir Classroom ↗</a>` : ""}` : `<button data-edit="${esc(t.id)}" data-kind="task">Editar</button><button data-delete="${esc(t.id)}" data-kind="task" aria-label="Eliminar ${esc(t.name)}">×</button>`}</div></div>`,
        )
        .join("")
    : '<div class="empty">No hay tareas en esta vista.</div>';
}
function taskDate(t) {
  if (!t.due) return "Sin fecha de entrega";
  return esc(
    t.dueAt
      ? new Intl.DateTimeFormat("es-ES", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(t.dueAt))
      : formatDate(t.due),
  );
}
const orderedTasks = () =>
  allTasks().sort(
    (a, b) =>
      (a.due || "9999").localeCompare(b.due || "9999") ||
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
  const pending = allTasks().filter((t) => activeTask(t) && !t.done),
    done = allTasks().filter((t) => activeTask(t) && t.done).length,
    exams = state.exams
      .filter((e) => e.date >= today())
      .sort((a, b) => a.date.localeCompare(b.date)),
    percent =
      done + pending.length
        ? Math.round((done / (done + pending.length)) * 100)
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
        state.subjects.length +
          classroom.cache.courses.filter((c) => !classroomManualSubject(c.id))
            .length,
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
        .filter((t) => activeTask(t) && !t.done)
        .slice(0, 6),
    )}</section><div class="stack"><section class="card"><div class="section-head"><h2>Próximos exámenes</h2><a class="text-link" href="#calendar">Calendario →</a></div>${examRows(exams.slice(0, 3))}</section><section class="card"><h2>Próximas entregas de Classroom</h2><p class="muted">${esc(classroom.status)} · ${pending.filter((t) => t.origin === "classroom").length} pendientes · ${pending.filter((t) => t.origin === "classroom" && overdue(t)).length} vencidas</p>${taskRows(
      orderedTasks()
        .filter((t) => t.origin === "classroom" && activeTask(t) && !t.done)
        .slice(0, 3),
    )}<a class="text-link" href="#settings">Gestionar integración →</a></section><section class="card focus-card"><span class="eyebrow">PASO A PASO</span><h2 style="margin-top:12px">Lo estás construyendo.</h2><p>No necesitas hacerlo todo hoy. Empieza por una tarea y celebra cada avance.</p><div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div><div class="stat-note">${percent}% completado · ${done} de ${done + pending.length} tareas</div></section></div></div>`
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
      ["overdue", "Vencidas"],
      ["archived", "Archivadas / no disponibles"],
    ]
      .map(
        ([v, l]) =>
          `<button class="${filter === v ? "active" : ""}" data-filter="${v}" aria-pressed="${filter === v}">${l}</button>`,
      )
      .join(
        "",
      )}</div>${taskFilters()}${taskRows(orderedTasks().filter((t) => (filter === "archived" ? !activeTask(t) : activeTask(t)) && (filter === "all" || filter === "archived" || (filter === "overdue" ? overdue(t) : filter === "done" ? t.done : !t.done)) && (originFilter === "all" || (originFilter === "classroom" ? t.origin === "classroom" : t.origin !== "classroom")) && (subjectFilter === "all" || t.subject === subjectFilter)))}</section><section class="card" style="margin-top:20px"><div class="section-head"><h2>Todos los exámenes</h2></div>${examRows(state.exams.slice().sort((a, b) => a.date.localeCompare(b.date)))}</section>`
  );
}
let showNonTeaching = true;
let selectedDay = today();
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
    const academic = academicDay(date);
    cells +=
      `<div class="day ${date === today() ? "today" : ""} ${showNonTeaching && academic.nonTeaching ? (academic.events.some((e) => e.nonTeaching) ? "non-teaching" : "weekend") : ""}" data-date="${date}"><button class="day-number" data-day="${date}" aria-label="Ver el día ${date}">${n}</button>` +
      (showNonTeaching
        ? academic.events
            .map(
              (event) =>
                `<button class="academic-label ${event.type}" data-day="${date}">${esc(event.name)}</button>`,
            )
            .join("")
        : "") +
      allTasks()
        .filter((t) => t.due === date && activeTask(t))
        .map(
          (t) =>
            `<button class="event ${t.done ? "finished" : ""}" ${t.origin === "classroom" ? `data-classroom="${esc(t.id)}"` : `data-edit="${esc(t.id)}" data-kind="task"`}>${t.origin === "classroom" ? "▣" : "☑"} ${esc(t.name)}</button>`,
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
    `<section class="card calendar-card"><div class="section-head"><h2>Tu calendario</h2><div class="calendar-controls"><button class="secondary" data-month="-1" aria-label="Mes anterior">‹</button><strong>${new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(month)}</strong><button class="secondary" data-month="1" aria-label="Mes siguiente">›</button><button class="secondary" data-action="today">Hoy</button></div></div><div class="calendar-options"><label class="toggle"><input id="showNonTeaching" type="checkbox" ${showNonTeaching ? "checked" : ""}> Mostrar festivos y días no lectivos</label><label>Ir al mes<input id="calendarMonth" type="month" value="${y}-${String(m + 1).padStart(2, "0")}" min="1900-01" max="2100-12"></label></div><p class="muted">${esc(ACADEMIC_CALENDAR.course)} · ${esc(ACADEMIC_CALENDAR.location)} · ${esc(ACADEMIC_CALENDAR.education)}</p><p class="muted">Clases ordinarias: <strong>${formatDate(ACADEMIC_CALENDAR.teachingStart)} – ${formatDate(ACADEMIC_CALENDAR.teachingEnd)}</strong>. <a class="text-link" href="${ACADEMIC_CALENDAR.sources[0]}" target="_blank" rel="noopener noreferrer">Calendario oficial DOE ↗</a></p><p class="calendar-note">No se incluyen Día del Centro ni días sustitutivos sin confirmación. Después del fin de clases puede haber evaluaciones o formación en empresa según el centro. Fuera del curso 2026/2027 solo se señalan fines de semana.</p><div class="calendar-grid">${cells}</div><div class="legend visual-legend"><span><i class="swatch no-class"></i>Festivo / periodo sin clase</span><span><i class="swatch weekend"></i>Fin de semana</span><span><i class="swatch vacation"></i>Vacaciones</span><span><i class="swatch holiday"></i>Festivo / no lectivo</span><span><i class="swatch task"></i>Tarea</span><span><i class="swatch exam"></i>Examen</span><span><i class="swatch milestone"></i>Inicio / fin de clases</span></div><p class="legend">Pulsa cualquier día para ver los motivos y añadir tareas o exámenes. Los eventos personales se pueden editar directamente.</p></section>`
  );
}
function subjectsView() {
  return (
    head("Tus asignaturas", "Dale a cada materia su propio espacio.") +
    `<form id="subjectForm" class="card subject-form"><label>Nombre de la asignatura<input name="name" required maxlength="80" placeholder="Ej. Matemáticas"></label><label class="color-field">Color<input name="color" type="color" value="#b4a3ff"></label><button>Añadir asignatura</button></form><div class="subjects-grid">${state.subjects.map((s) => `<section class="card"><div class="subject-color" style="background:${s.color}"></div><h2>${esc(s.name)}</h2>${classroom.cache.courses.some((c) => classroomManualSubject(c.id)?.id === s.id) ? '<span class="tag classroom-tag">Google Classroom</span>' : ""}<p class="muted">${allTasks().filter((t) => t.subject === s.name && activeTask(t) && !t.done).length} tareas pendientes · ${state.exams.filter((e) => e.subject === s.name).length} exámenes</p><div class="row-actions"><button data-subject-edit="${esc(s.id)}">Editar</button><button data-subject-delete="${esc(s.id)}">Eliminar</button></div></section>`).join("") || '<div class="empty">Añade tu primera asignatura para organizar tu curso.</div>'}</div>${classroomSubjects()}`
  );
}
function settingsView() {
  return (
    head("A tu manera", "Un espacio que se adapta a ti.") +
    `<div class="settings">${classroomSettings()}<section class="card"><h2>Tu perfil</h2><form id="profileForm" style="margin-top:20px"><label>¿Cómo te llamas?<input name="name" maxlength="40" value="${esc(state.settings.name)}" placeholder="Tu nombre"></label><button>Guardar ajustes</button></form></section><section class="card"><h2>Tus datos, bajo tu control</h2><p>Los datos se guardan únicamente en este navegador. Usa la misma dirección web para conservar el acceso y exporta copias antes de borrar los datos del navegador o cambiar de dispositivo.</p><div class="actions"><button data-action="export">Exportar copia JSON</button><button class="secondary" data-action="import">Importar copia</button><button class="secondary" data-action="original">Exportar datos originales</button></div><input id="importFile" type="file" accept="application/json,.json" hidden><p>La importación valida el archivo y crea una copia local de los datos actuales antes de reemplazarlos. Classroom es opcional y de solo lectura; Moodle no está conectado. Las copias JSON de este apartado contienen tus datos personales de StudyFlow, no la caché independiente de Classroom.</p></section><section class="card"><h2>StudyFlow 3.0</h2><p>Tema oscuro · Classroom opcional · Autorización oficial de Google</p></section></div>`
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
  $("navCount").textContent = allTasks().filter(
    (t) => activeTask(t) && !t.done,
  ).length;
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
function openDay(date) {
  selectedDay = date;
  const info = academicDay(date);
  $("dayTitle").textContent = formatDate(date);
  $("dayReasons").innerHTML =
    (info.weekend ? "<p>Fin de semana: no hay clases ordinarias.</p>" : "") +
    info.events
      .map(
        (event) =>
          `<section><h3>${esc(event.name)}</h3><p>${esc(event.description)}</p><a class="text-link" href="${esc(ACADEMIC_CALENDAR.sources[event.source])}" target="_blank" rel="noopener noreferrer">Fuente oficial ↗</a></section>`,
      )
      .join("") +
    (!info.nonTeaching
      ? info.inCourse
        ? "<p>Día lectivo ordinario según el calendario general de FP Grado Medio, salvo modificaciones autorizadas del centro.</p>"
        : "<p>Fecha fuera del curso 2026/2027: no se ha cargado el calendario académico de este curso.</p>"
      : "") +
    (!ACADEMIC_CALENDAR.verified
      ? '<p class="calendar-warning">Las fechas oficiales del curso están pendientes de verificación.</p>'
      : "");
  $("dayDetails").showModal();
}
$("closeDay").onclick = () => $("dayDetails").close();
$("dayTask").onclick = () => {
  $("dayDetails").close();
  openEditor("task", null, selectedDay);
};
$("dayExam").onclick = () => {
  $("dayDetails").close();
  openEditor("exam", null, selectedDay);
};
$("main").addEventListener("click", (event) => {
  if (event.target.closest("button, a, input, select, label")) return;
  const day = event.target.closest(".day[data-date]");
  if (day) openDay(day.dataset.date);
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const d = b.dataset;
  if (d.action === "new-task") openEditor("task");
  if (d.action === "new-exam") openEditor("exam");
  if (d.edit) openEditor(d.kind, d.edit);
  if (d.classroom) openClassroomTask(d.classroom);
  if (d.action === "classroom-connect") classroom.connect();
  if (d.action === "classroom-cancel") classroom.cancelConnect();
  if (d.action === "classroom-sync") classroom.sync();
  if (d.action === "classroom-disconnect") classroom.disconnect();
  if (d.action === "classroom-retry") classroom.prepare();
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
  if (d.day) openDay(d.day);
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
  if (e.target.id === "taskOrigin") {
    originFilter = e.target.value;
    render();
  }
  if (e.target.id === "taskSubject") {
    subjectFilter = e.target.value;
    render();
  }
  if (e.target.dataset.classroomMap) {
    try {
      classroom.setMapping(e.target.dataset.classroomMap, e.target.value);
    } catch (error) {
      notify(error.message);
    }
  }
  if (e.target.id === "showNonTeaching") {
    showNonTeaching = e.target.checked;
    render();
  }
  if (e.target.id === "calendarMonth" && /^\d{4}-\d{2}$/.test(e.target.value)) {
    const [year, monthIndex] = e.target.value.split("-").map(Number);
    if (year >= 1900 && year <= 2100 && monthIndex >= 1 && monthIndex <= 12) {
      month = new Date(year, monthIndex - 1, 1);
      render();
    }
  }
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
  if (e.target.id === "classroomConfig") {
    e.preventDefault();
    try {
      classroom.saveConfig(e.target.elements.clientId.value);
    } catch (error) {
      notify(error.message);
    }
  }
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
window.addEventListener("hashchange", () => {
  render();
  if (view() === "settings") classroom.prepare();
});
window.addEventListener("classroomchange", render);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) classroom.autoSync();
});
window.addEventListener("focus", () => classroom.autoSync());
setInterval(() => {
  if (!document.hidden) classroom.autoSync();
}, 300000);
$("closeClassroomDetails").onclick = () => $("classroomDetails").close();
render();
if (classroom.config.clientId) classroom.prepare();

function classroomManualSubject(courseId) {
  const course = classroom.cache.courses.find((c) => c.id === courseId);
  const mapped = classroom.config.mapping[courseId];
  return (
    state.subjects.find((s) => String(s.id) === mapped) ||
    (!mapped && course
      ? state.subjects.find(
          (s) => s.name.toLocaleLowerCase() === course.name.toLocaleLowerCase(),
        )
      : null)
  );
}
function classroomSubject(courseId, fallback = "Classroom") {
  return (
    classroomManualSubject(courseId)?.name ||
    classroom.cache.courses.find((c) => c.id === courseId)?.name ||
    fallback
  );
}
function taskFilters() {
  const subjects = [...new Set(allTasks().map((t) => t.subject))].sort();
  return `<div class="task-filters"><label>Origen<select id="taskOrigin"><option value="all">Todos</option><option value="personal" ${originFilter === "personal" ? "selected" : ""}>Personal</option><option value="classroom" ${originFilter === "classroom" ? "selected" : ""}>Google Classroom</option></select></label><label>Asignatura<select id="taskSubject"><option value="all">Todas</option>${subjects.map((name) => `<option value="${esc(name)}" ${subjectFilter === name ? "selected" : ""}>${esc(name)}</option>`).join("")}</select></label></div>`;
}
function classroomLogo() {
  return '<svg class="classroom-logo" viewBox="0 0 64 64" role="img" aria-label="Google Classroom"><rect x="3" y="10" width="58" height="44" rx="4" fill="#fbbc04"/><path fill="#0f9d58" d="M8 15h48v34H8z"/><circle cx="32" cy="29" r="6" fill="#fff"/><path fill="#fff" d="M22 45v-4c0-7 20-7 20 0v4z"/><circle cx="17" cy="33" r="4" fill="#a8dab5"/><circle cx="47" cy="33" r="4" fill="#a8dab5"/><path fill="#a8dab5" d="M10 45v-3c0-5 12-6 12-1v4zm32 0v-4c0-5 12-4 12 1v3z"/><path fill="#f5f5f5" d="M43 47h10v3H43z"/></svg>';
}
function classroomSettings() {
  const connected = classroom.connected;
  return `<section class="card integration-card"><h2>Integraciones</h2><div class="integration-title">${classroomLogo()}<div><h3>Google Classroom</h3><span class="tag classroom-tag" role="status">${esc(classroom.status)}</span></div></div><p>Consulta tus clases y actividades mediante la API oficial. Solo lectura: StudyFlow no entrega ni modifica actividades en Google.</p><p>${classroom.cache.account?.email ? `Cuenta: <strong>${esc(classroom.cache.account.email)}</strong>` : "Sin cuenta identificada."}<br>Última sincronización correcta: ${classroom.cache.lastSync ? esc(new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(classroom.cache.lastSync))) : "Todavía no se ha sincronizado."}</p>${!connected && classroom.cache.lastSync ? "<p>Se muestra una copia local. Reconecta para obtener cambios recientes.</p>" : ""}${classroom.progress ? `<p id="classroomProgress" role="status" aria-live="polite">${esc(classroom.progress)}</p>` : ""}${classroom.phase !== "idle" ? `<details class="oauth-diagnostics"><summary>Detalles de conexión (sin credenciales)</summary><p>Respuesta OAuth recibida: ${classroom.diagnostics.callbackReceived ? "sí" : "no"}<br>Token de acceso recibido: ${classroom.diagnostics.tokenReceived ? "sí" : "no"}<br>Cuenta verificada: ${classroom.diagnostics.identityVerified ? "sí" : "no"}<br>Consulta: ${esc({ identity: "Identidad de Google", courses: "Clases", coursework: "Actividades", submissions: "Entregas" }[classroom.diagnostics.apiStep] || "Todavía sin consulta")}<br>Código: ${esc(classroom.diagnostics.code || "Sin error registrado")}</p><h4>Permisos solicitados</h4><ul>${classroom.diagnostics.requestedScopes.map((scope) => `<li><code>${esc(scope)}</code></li>`).join("")}</ul><h4>Permisos concedidos por Google</h4>${classroom.diagnostics.scopesReported ? `<ul>${classroom.diagnostics.grantedScopes.map((scope) => `<li><code>${esc(scope)}</code></li>`).join("") || "<li>Ninguno de los permisos reconocidos.</li>"}</ul>` : "<p>Google todavía no ha devuelto una lista de permisos.</p>"}${classroom.diagnostics.missingScopes.length ? `<h4>Permisos que faltan</h4><ul>${classroom.diagnostics.missingScopes.map((scope) => `<li><code>${esc(scope)}</code></li>`).join("")}</ul>` : ""}${classroom.diagnostics.unconfirmedScopes.length ? `<h4>Permisos sin confirmar por GIS</h4><ul>${classroom.diagnostics.unconfirmedScopes.map((scope) => `<li><code>${esc(scope)}</code></li>`).join("")}</ul>` : ""}</details>` : ""}${classroom.error ? `<p role="alert" class="calendar-warning">${esc(classroom.error)}</p>` : ""}<div class="actions">${["waiting", "identity"].includes(classroom.phase) ? '<button class="secondary" data-action="classroom-cancel">Cancelar conexión</button>' : ""}<button data-action="classroom-connect" ${!classroom.config.clientId || !classroom.ready || classroom.busy || connected ? "disabled" : ""}>Conectar con Google Classroom</button><button data-action="classroom-sync" class="secondary" ${!connected || classroom.busy ? "disabled" : ""}>${classroom.busy ? "Sincronizando / conectando…" : "Sincronizar ahora"}</button><button data-action="classroom-disconnect" class="secondary" ${!connected && !classroom.cache.account ? "disabled" : ""}>Desconectar</button>${classroom.config.clientId && !classroom.ready ? `<button class="secondary" data-action="classroom-retry" ${classroom.loading ? "disabled" : ""}>${classroom.loading ? "Cargando Google…" : "Cargar acceso de Google"}</button>` : ""}</div><p>La autorización caduca y se mantiene únicamente en memoria. Al recargar, vuelve a conectar. Mientras esta pestaña conserve una autorización válida, se actualiza cada cinco minutos y al volver a la aplicación. Desconectar elimina únicamente la copia de Classroom e intenta revocar el permiso en Google.</p><form id="classroomConfig"><label>OAuth Client ID de aplicación web<input name="clientId" value="${esc(classroom.config.clientId)}" maxlength="240" placeholder="…apps.googleusercontent.com" autocomplete="off" ${connected || classroom.busy ? "disabled" : ""}></label><button class="secondary" ${connected || classroom.busy ? "disabled" : ""}>Guardar Client ID</button></form><p><a class="text-link" href="https://github.com/filipireneusz23/StudyFlow/blob/main/docs/google-classroom.md" target="_blank" rel="noopener noreferrer">Guía de configuración de Google Cloud ↗</a> · El Client ID es público; nunca introduzcas un secreto ni tu contraseña.</p>${classroom.cache.courses.length ? `<h3>Relacionar asignaturas</h3><p>Las coincidencias de nombre se relacionan automáticamente. También puedes seleccionar una asignatura personal. Esto no modifica su nombre ni sus datos.</p><div class="course-mappings">${classroom.cache.courses.map((c) => `<label>${esc(c.name)} ${c.courseState === "ARCHIVED" ? "(archivada)" : ""}<select data-classroom-map="${esc(c.id)}"><option value="">Automático por nombre / independiente</option>${state.subjects.map((s) => `<option value="${esc(s.id)}" ${classroom.config.mapping[c.id] === String(s.id) ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>`).join("")}</div>` : ""}</section>`;
}
function classroomSubjects() {
  const courses = classroom.cache.courses.filter(
    (c) => !classroomManualSubject(c.id),
  );
  if (!courses.length) return "";
  return `<h2 style="margin:28px 0 18px">Asignaturas de Google Classroom</h2><div class="subjects-grid">${courses.map((c) => `<section class="card"><h3>${esc(c.name)}</h3><span class="tag classroom-tag">Google Classroom${c.courseState === "ARCHIVED" ? " · archivada" : ""}</span><p class="muted">${classroom.cache.tasks.filter((t) => t.courseId === c.id && t.availability === "active" && !t.done).length} actividades pendientes</p><a class="text-link" href="#settings">Relacionar con una asignatura personal →</a></section>`).join("")}</div>`;
}
function openClassroomTask(id) {
  const t = allTasks().find((t) => t.origin === "classroom" && t.id === id);
  if (!t) return;
  $("classroomTaskTitle").textContent = t.name;
  $("classroomTaskBody").innerHTML =
    `<p><span class="tag classroom-tag">Google Classroom · solo lectura</span></p><p>${esc(t.subject)} · ${taskDate(t)}</p><p>${esc(statusLabels[t.status] || t.status)}${!activeTask(t) ? " · Archivada / no disponible en la última consulta" : ""}</p><p class="task-description">${esc(t.description || "Sin descripción.")}</p>${Classroom.safeLink(t.url) ? `<a class="text-link" href="${esc(Classroom.safeLink(t.url))}" target="_blank" rel="noopener noreferrer">Abrir actividad original en Classroom ↗</a>` : ""}<p class="muted">${classroom.connected ? "Los cambios se consultan al sincronizar." : "Copia local: vuelve a conectar para actualizar."}</p>`;
  $("classroomDetails").showModal();
}
