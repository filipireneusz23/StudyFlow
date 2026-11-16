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
        (date === "due"
          ? Boolean(item[date]) && !validDate(item[date])
          : !validDate(item[date]))
      )
        throw Error("Hay registros con nombre, asignatura o fecha no válidos");
  if (raw.timetable !== undefined) Timetable.validate(raw.timetable);
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
  s.version = 4;
  V4.validate(s);
  return s;
}
let state,
  storageBlocked = false,
  loadError = "";
try {
  const raw = localStorage.getItem(KEY);
  const original = raw ? JSON.parse(raw) : { tasks: [], exams: [] };
  state = normalize(original);
  if (original.version !== 4) {
    let externalRaw = localStorage.getItem("studyflow-classroom-cache");
    if (!externalRaw) {
      try {
        externalRaw =
          JSON.parse(
            localStorage.getItem("studyflow-backup-before-v4") || "null",
          )?.imported || null;
      } catch {}
    }
    let external = null;
    try {
      external = externalRaw ? JSON.parse(externalRaw) : null;
    } catch {
      /* retain unreadable data in the migration backup */
    }
    if (
      (raw || externalRaw) &&
      !localStorage.getItem("studyflow-backup-before-v4")
    )
      localStorage.setItem(
        "studyflow-backup-before-v4",
        JSON.stringify({ personal: raw, imported: externalRaw }),
      );
    state = V4.migrate(state, external);
    V4.validate(state);
    if (externalRaw && localStorage.getItem("studyflow-backup-before-v4")) {
      localStorage.removeItem("studyflow-classroom-cache");
      localStorage.removeItem("studyflow-classroom-config");
    }
    localStorage.setItem(KEY, JSON.stringify(state));
    try {
      localStorage.removeItem("studyflow-classroom-config");
      localStorage.removeItem("studyflow-classroom-cache");
    } catch {}
  }
  if (
    raw &&
    (JSON.parse(raw).version ?? 1) < 3 &&
    !localStorage.getItem(BACKUP)
  )
    localStorage.setItem(BACKUP, raw);
} catch (e) {
  storageBlocked = true;
  loadError =
    "No se han modificado tus datos originales. Exporta el archivo original desde Ajustes antes de recuperarlo.";
  state = normalize({ tasks: [], exams: [] });
}
let subjectFilter = "all";
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
function commit(next, redraw = true) {
  if (storageBlocked) {
    notify(loadError);
    return false;
  }
  try {
    V4.validate(next);
    if (next.timetable) Timetable.validate(next.timetable);
  } catch (error) {
    notify(error.message);
    return false;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    state = next;
    if (redraw) render();
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
  [
    "dashboard",
    "tasks",
    "calendar",
    "timetable",
    "subjects",
    "settings",
    "grades",
    "study",
    "stats",
    "notes",
    "practice",
    "reminders",
  ].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : "dashboard";
const titles = {
  dashboard: "Panel principal",
  tasks: "Mis tareas",
  calendar: "Calendario",
  timetable: "Horario",
  subjects: "Asignaturas",
  settings: "Ajustes",
  grades: "Notas",
  study: "Estudio",
  stats: "Estadísticas",
  notes: "Apuntes",
  practice: "Prácticas de FP",
  reminders: "Recordatorios",
};
function head(title, sub, actions = "") {
  return `<div class="page-head"><div><span class="eyebrow">TU APRENDIZAJE, EN ORDEN</span><h1>${title}</h1><div class="subtitle">${sub}</div></div><div class="actions">${actions}</div></div>`;
}
const addButtons = () =>
  '<button class="secondary" data-action="new-exam">＋ Examen</button><button data-action="new-task">＋ Nueva tarea</button>';
function allTasks() {
  return state.tasks;
}
const activeTask = () => true;
const overdue = (t) => !t.done && Boolean(t.due) && t.due < today();
function taskDate(t) {
  return t.due ? esc(formatDate(t.due)) : "Sin fecha";
}
function taskRows(tasks) {
  return tasks.length
    ? tasks
        .map(
          (t) =>
            `<div class="task-row ${t.done ? "done" : ""}" data-task-id="${esc(t.id)}"><input type="checkbox" data-toggle="${esc(t.id)}" aria-label="Completar ${esc(t.name)}" ${t.done ? "checked" : ""}><div class="item-body"><div class="item-title">${esc(t.name)}</div><div class="item-meta"><span class="tag">${esc(t.subject)}</span><span class="${overdue(t) ? "overdue" : ""}">${taskDate(t)}</span><span class="tag priority-${t.priority}">${priorities[t.priority]}</span></div>${taskLinksHTML(t)}</div><div class="row-actions"><button data-task-details="${esc(t.id)}">Detalles</button><button data-edit="${esc(t.id)}" data-kind="task">Editar</button><button data-delete="${esc(t.id)}" data-kind="task" aria-label="Eliminar ${esc(t.name)}">×</button></div></div>`,
        )
        .join("")
    : '<div class="empty">No hay tareas en esta vista.</div>';
}
const orderedTasks = () =>
  state.tasks
    .slice()
    .sort(
      (a, b) =>
        (a.due || "9999").localeCompare(b.due || "9999") ||
        { high: 0, medium: 1, low: 2 }[a.priority] -
          { high: 0, medium: 1, low: 2 }[b.priority],
    );
function taskFilters() {
  return `<div class="task-filters"><label>Asignatura<select id="taskSubject"><option value="all">Todas</option>${[
    ...new Set(state.tasks.map((t) => t.subject)),
  ]
    .sort()
    .map(
      (name) =>
        `<option value="${esc(name)}" ${subjectFilter === name ? "selected" : ""}>${esc(name)}</option>`,
    )
    .join("")}</select></label></div>`;
}
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
  return v4Dashboard();
}
function tasksView() {
  return (
    head("Mis tareas", "Tus objetivos, a tu ritmo.", addButtons()) +
    `<section class="card"><div class="tabs">${[
      ["pending", "Pendientes"],
      ["all", "Todas"],
      ["done", "Completadas"],
      ["overdue", "Vencidas"],
    ]
      .map(
        ([v, label]) =>
          `<button class="${filter === v ? "active" : ""}" data-filter="${v}">${label}</button>`,
      )
      .join(
        "",
      )}</div>${taskFilters()}${taskRows(orderedTasks().filter((t) => (filter === "all" || (filter === "done" ? t.done : filter === "overdue" ? overdue(t) : !t.done)) && (subjectFilter === "all" || t.subject === subjectFilter)))}</section><section class="card" style="margin-top:20px"><div class="section-head"><h2>Todos los exámenes</h2></div>${examRows(state.exams.slice().sort((a, b) => a.date.localeCompare(b.date)))}</section>`
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
      practiceCalendarLabels(date) +
      allTasks()
        .filter((t) => t.due === date && activeTask(t))
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
    `<section class="card calendar-card"><div class="section-head"><h2>Tu calendario</h2><a class="text-link" href="#practice">Prácticas de FP →</a><div class="calendar-controls"><button class="secondary" data-month="-1" aria-label="Mes anterior">‹</button><strong>${new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(month)}</strong><button class="secondary" data-month="1" aria-label="Mes siguiente">›</button><button class="secondary" data-action="today">Hoy</button></div></div><div class="calendar-options"><label class="toggle"><input id="showNonTeaching" type="checkbox" ${showNonTeaching ? "checked" : ""}> Mostrar festivos y días no lectivos</label><label>Ir al mes<input id="calendarMonth" type="month" value="${y}-${String(m + 1).padStart(2, "0")}" min="1900-01" max="2100-12"></label></div><p class="muted">${esc(ACADEMIC_CALENDAR.course)} · ${esc(ACADEMIC_CALENDAR.location)} · ${esc(ACADEMIC_CALENDAR.education)}</p><p class="muted">Clases ordinarias: <strong>${formatDate(ACADEMIC_CALENDAR.teachingStart)} – ${formatDate(ACADEMIC_CALENDAR.teachingEnd)}</strong>. <a class="text-link" href="${ACADEMIC_CALENDAR.sources[0]}" target="_blank" rel="noopener noreferrer">Calendario oficial DOE ↗</a></p><p class="calendar-note">No se incluyen Día del Centro ni días sustitutivos sin confirmación. Después del fin de clases puede haber evaluaciones o formación en empresa según el centro. Fuera del curso 2026/2027 solo se señalan fines de semana.</p><div class="calendar-grid">${cells}</div><div class="legend visual-legend"><span><i class="swatch no-class"></i>Festivo / periodo sin clase</span><span><i class="swatch weekend"></i>Fin de semana</span><span><i class="swatch vacation"></i>Vacaciones</span><span><i class="swatch holiday"></i>Festivo / no lectivo</span><span><i class="swatch task"></i>Tarea</span><span><i class="swatch exam"></i>Examen</span><span><i class="swatch milestone"></i>Inicio / fin de clases</span><span><i class="swatch practice"></i>Prácticas de FP</span></div><p class="legend">Pulsa cualquier día para ver los motivos y añadir tareas o exámenes. Los eventos personales se pueden editar directamente.</p></section>`
  );
}
function subjectsView() {
  return (
    head("Tus asignaturas", "Personaliza tu espacio de aprendizaje.") +
    `<form id="subjectForm" class="card subject-form"><label>Nombre de la asignatura<input name="name" required maxlength="80" placeholder="Ej. Redes"></label><label class="color-field">Color<input name="color" type="color" value="#b4a3ff"></label><button>Añadir asignatura</button></form><div class="subjects-grid">${state.subjects.map((s) => `<section class="card"><div class="subject-color" style="background:${s.color}"></div><h2>${esc(s.name)}</h2><p class="muted">${state.tasks.filter((t) => t.subject === s.name && !t.done).length} tareas pendientes</p><div class="row-actions"><button data-subject-edit="${esc(s.id)}">Editar</button><button data-subject-delete="${esc(s.id)}">Eliminar</button></div></section>`).join("") || '<div class="empty">Añade tu primera asignatura.</div>'}</div>`
  );
}
function settingsView() {
  return (
    head("A tu manera", "Tus datos permanecen en este navegador.") +
    `<div class="settings"><section class="card"><h2>Tu perfil</h2><form id="profileForm"><label>¿Cómo te llamas?<input name="name" maxlength="40" value="${esc(state.settings.name)}"></label><button>Guardar ajustes</button></form></section><section class="card"><h2>Copias de seguridad</h2><p>Los datos no se sincronizan entre dispositivos. Exporta una copia antes de cambiar de navegador, dirección web o borrar almacenamiento.</p><div class="actions"><button data-action="export">Exportar copia JSON</button><button class="secondary" data-action="import">Importar copia</button><button class="secondary" data-action="original">Exportar datos originales</button><button class="secondary" data-action="export-migration">Exportar copia anterior a 4.0</button></div><input id="importFile" type="file" accept="application/json,.json" hidden><p>Incluye tareas, exámenes, asignaturas, horarios, notas, apuntes, estudio y prácticas. Importar reemplaza los apartados incluidos tras confirmación y conserva una copia previa.</p></section>${v4ImportReview()}<section class="card"><h2>StudyFlow 4.0</h2><p>Tu espacio de FP · Sin cuentas ni servicios externos</p></section></div>`
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
      timetable: timetableView,
      subjects: subjectsView,
      settings: settingsView,
      grades: gradesView,
      study: studyView,
      stats: statsView,
      notes: notesView,
      practice: practiceView,
      reminders: remindersView,
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
  form.elements.date.required = kind === "exam";
  form.elements.date.value = item?.due || item?.date || date;
  form.elements.priority.value = item?.priority || "medium";
  $("priorityField").hidden = kind !== "task";
  prepareTaskExtras(kind, item);
  $("editor").showModal();
}
$("itemForm").onsubmit = (e) => {
  e.preventDefault();
  const f = e.target.elements,
    name = f.name.value.trim();
  if (
    !name ||
    (f.date.value ? !validDate(f.date.value) : editing.kind === "exam")
  ) {
    notify("Introduce un nombre y una fecha válidos.");
    return;
  }
  const { kind, id } = editing;
  let extra = {};
  if (kind === "task") {
    try {
      extra = { notes: f.taskNotes.value, links: readTaskLinkDraft() };
    } catch (error) {
      notify(error.message);
      return;
    }
  }
  if (
    mutate((s) => {
      const list = kind === "task" ? s.tasks : s.exams;
      const fields = {
        name,
        subject: f.subject.value,
        [kind === "task" ? "due" : "date"]: f.date.value,
        ...(kind === "task" ? { priority: f.priority.value, ...extra } : {}),
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
    practiceDayDetails(date) +
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
      let original = localStorage.getItem(BACKUP);
      if (!original) {
        try {
          original = JSON.parse(
            localStorage.getItem("studyflow-backup-before-v4") || "null",
          )?.personal;
        } catch {}
      }
      download(
        original || localStorage.getItem(KEY) || "{}",
        "studyflow-original.json",
      );
    } catch {
      notify("No se puede acceder al almacenamiento.");
    }
  }
  if (d.action === "export-migration") {
    const backup = localStorage.getItem("studyflow-backup-before-v4");
    if (backup) download(backup, "studyflow-copia-anterior-v4.json");
    else
      notify(
        "No hay una copia anterior a 4.0 en este navegador. Puedes exportar la copia actual.",
      );
  }
  if (d.action === "import") $("importFile").click();
  if (d.subjectDelete) {
    const s = state.subjects.find((s) => String(s.id) === d.subjectDelete);
    if (
      (state.grades || []).some((r) => r.subjectId === String(s.id)) ||
      (state.notes || []).some((n) => n.subjectId === String(s.id)) ||
      (state.studySessions || []).some((r) => r.subjectId === String(s.id))
    ) {
      notify(
        "Esta asignatura tiene registros académicos. Reasígnalos antes de eliminarla.",
      );
      return;
    }
    if (
      Timetable.get(state).schedules.some((schedule) =>
        schedule.blocks.some(
          (b) => b.type === "class" && b.subjectId === String(s.id),
        ),
      )
    ) {
      notify(
        "Esta asignatura está en un horario. Reasigna esos bloques antes de eliminarla.",
      );
      return;
    }
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
  if (e.target.id === "taskSubject") {
    subjectFilter = e.target.value;
    render();
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
      const payload = JSON.parse(await file.text());
      const bundle =
        payload &&
        !Array.isArray(payload.tasks) &&
        Object.hasOwn(payload, "personal");
      const source = bundle
        ? payload.personal
          ? typeof payload.personal === "string"
            ? JSON.parse(payload.personal)
            : payload.personal
          : { tasks: [], exams: [] }
        : payload;
      let archived = null;
      if (bundle && payload.imported) {
        try {
          archived = JSON.parse(payload.imported);
        } catch {}
      }
      const next = normalize(source);
      for (const field of [
        "timetable",
        "grades",
        "gradeSettings",
        "notes",
        "studySessions",
        "studySettings",
        "pomodoro",
        "practice",
        "reminderSettings",
        "dismissedReminders",
        "importArchive",
      ])
        if (!Object.hasOwn(next, field) && state[field] !== undefined)
          next[field] = structuredClone(state[field]);
      const refs = new Set([
        ...(next.grades || []).map((r) => r.subjectId),
        ...(next.notes || []).map((r) => r.subjectId),
        ...(next.studySessions || []).map((r) => r.subjectId),
        next.pomodoro?.subjectId,
        ...(next.timetable?.schedules || []).flatMap((s) =>
          s.blocks.map((b) => b.subjectId),
        ),
      ]);
      for (const subject of state.subjects)
        if (
          refs.has(String(subject.id)) &&
          !next.subjects.some((s) => String(s.id) === String(subject.id))
        )
          next.subjects.push(structuredClone(subject));
      if (
        !confirm(
          `¿Importar ${next.tasks.length} tareas y ${next.exams.length} exámenes? Se reemplazarán los apartados incluidos; los ausentes de copias antiguas se conservarán.`,
        )
      )
        return;
      if (storageBlocked)
        throw Error(
          "Exporta y recupera los datos originales antes de importar.",
        );
      localStorage.setItem("studyflow-before-import", JSON.stringify(state));
      if (commit(V4.migrate(next, archived)))
        notify("Copia importada correctamente.");
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
