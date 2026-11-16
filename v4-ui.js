/* Feature views share the existing atomic personal-state save and backup path. */
let gradeTerm = "1ª evaluación",
  noteSearch = "",
  noteOrder = "updated",
  noteFavorite = false,
  noteEditing = null;
const subjectName = (id) =>
  state.subjects.find((s) => String(s.id) === id)?.name || "Sin asignatura";
const subjectOptions = (selected = "", optional = false) =>
  (optional
    ? '<option value="">Sin asignatura</option>'
    : '<option value="">Elige una asignatura</option>') +
  state.subjects
    .map(
      (s) =>
        `<option value="${esc(s.id)}" ${String(s.id) === selected ? "selected" : ""}>${esc(s.name)}</option>`,
    )
    .join("");
const field = (label, name, type = "text", value = "", attrs = "") =>
  `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
const subjectField = (selected = "", optional = false) =>
  `<label>Asignatura<select name="subjectId" ${optional ? "" : "required"}>${subjectOptions(selected, optional)}</select></label>`;
const empty = (text) => `<p class="empty">${text}</p>`;
const settingsGrade = () => ({ scale: 10, target: 5, ...state.gradeSettings });
function gradeGroups() {
  const groups = new Map();
  for (const r of state.grades || []) {
    const k = JSON.stringify([r.subjectId, r.term]);
    groups.set(k, [...(groups.get(k) || []), r]);
  }
  return [...groups.values()].map((rows) => ({
    subjectId: rows[0].subjectId,
    term: rows[0].term,
    rows,
    result: V4.grades(rows, settingsGrade().scale, settingsGrade().target),
  }));
}
const fmt = (n) =>
  Number.isFinite(n)
    ? n.toLocaleString("es-ES", { maximumFractionDigits: 2 })
    : "—";
function gradeResult(result) {
  return `<strong>${fmt(result.final ?? result.average)}</strong><p class="muted">${result.final !== null ? "Media final ponderada" : "Media provisional sobre el peso ya evaluado"} · ${fmt(result.graded)} % evaluado · ${fmt(result.weight)} % configurado</p>${!result.valid ? '<p class="calendar-warning">Completa los pesos hasta el 100 % para calcular la nota final y el objetivo.</p>' : result.needed !== null ? `<p>Para alcanzar ${settingsGrade().target}: ${result.needed <= 0 ? "objetivo ya alcanzado" : result.needed > settingsGrade().scale ? "no es posible con los pesos pendientes" : `necesitas ${fmt(result.needed)} de media en el ${fmt(result.pending)} % pendiente`}.</p>` : ""}`;
}
function lineChart(rows) {
  if (!rows.length) return empty("Sin notas registradas.");
  const scale = settingsGrade().scale,
    sorted = rows
      .filter((r) => Number.isFinite(r.score))
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return empty("Las notas están pendientes.");
  const points = sorted
    .map(
      (r, i) =>
        `${20 + (sorted.length === 1 ? 0 : (i * 260) / (sorted.length - 1))},${120 - (r.score / scale) * 100}`,
    )
    .join(" ");
  return `<svg viewBox="0 0 300 150" class="line-chart" role="img" aria-label="Evolución de notas: ${esc(sorted.map((r) => r.date + ": " + r.score).join("; "))}"><path d="M20 20V120H280" fill="none" stroke="#46516a"/><polyline points="${points}" fill="none" stroke="#b6a4ff" stroke-width="3"/>${sorted.map((r, i) => `<circle cx="${20 + (sorted.length === 1 ? 0 : (i * 260) / (sorted.length - 1))}" cy="${120 - (r.score / scale) * 100}" r="4" fill="#a8e4d4"/>`).join("")}</svg><div class="chart-values">${sorted.map((r) => `<span>${esc(formatDate(r.date))}: ${fmt(r.score)}</span>`).join("")}</div>`;
}
function gradesView() {
  const cfg = settingsGrade(),
    rows = (state.grades || []).filter((r) => r.term === gradeTerm);
  return (
    head(
      "Notas y objetivos",
      "Notas reales, pesos claros y progreso por evaluación.",
    ) +
    `<section class="card"><form id="gradeSettings" class="form-grid">${field("Escala máxima", "scale", "number", cfg.scale, 'min="1" max="1000" step="any" required')}${field("Nota objetivo", "target", "number", cfg.target, `min="0" max="${cfg.scale}" step="any" required`)}<button>Guardar escala y objetivo</button></form><p class="muted">Cambiar la escala no convierte las notas existentes; no se permite una escala inferior a una nota ya registrada.</p></section><section class="card feature-gap"><h2>Nuevo registro o actividad pendiente</h2><form id="gradeForm" class="form-grid">${subjectField()}${field("Evaluación / trimestre", "term", "text", gradeTerm, 'maxlength="60" required')}${field("Título", "title", "text", "", 'maxlength="120" required')}<label>Tipo<select name="type"><option>Examen</option><option>Trabajo</option><option>Actividad</option></select></label>${field("Fecha", "date", "date", today(), "required")}${field("Peso (%)", "weight", "number", "", 'min="0.01" max="100" step="any" required')}${field("Nota (vacía si pendiente)", "score", "number", "", `min="0" max="${cfg.scale}" step="any"`)}<button>Guardar nota</button></form></section><section class="card feature-gap"><label>Evaluación que quieres consultar<input id="gradeTerm" value="${esc(gradeTerm)}" maxlength="60"></label><div class="subjects-grid feature-gap">${
      gradeGroups()
        .filter((g) => g.term === gradeTerm)
        .map(
          (g) =>
            `<article><h3>${esc(subjectName(g.subjectId))}</h3>${gradeResult(g.result)}${lineChart(g.rows)}</article>`,
        )
        .join("") || empty("Todavía no hay registros en esta evaluación.")
    }</div>${rows.map((r) => `<div class="record-row"><div><strong>${esc(r.title)}</strong><p class="muted">${esc(subjectName(r.subjectId))} · ${esc(r.type)} · ${formatDate(r.date)} · ${fmt(r.weight)} % · Nota: ${r.score === null ? "Pendiente" : fmt(r.score)}</p></div><div class="actions"><button class="secondary" data-grade-edit="${esc(r.id)}">Editar</button><button class="secondary" data-grade-delete="${esc(r.id)}">Eliminar</button></div></div>`).join("")}</section>`
  );
}
function studyConfig() {
  return { focus: 25, short: 5, long: 15, ...state.studySettings };
}
function studyView() {
  const cfg = studyConfig(),
    timer = state.pomodoro,
    phase = timer?.phase || "focus",
    seconds = timer ? V4.remaining(timer, Date.now()) : cfg.focus * 60,
    stats = V4.studyStats(state.studySessions || []),
    progress = timer
      ? Math.max(0, Math.min(100, (1 - seconds / timer.duration) * 100))
      : 0;
  return (
    head(
      "Tiempo para aprender",
      "Una sesión a la vez, con descansos y registro local.",
    ) +
    `<div class="study-grid"><section class="card"><div class="tabs">${[
      ["focus", "Estudio"],
      ["short", "Descanso corto"],
      ["long", "Descanso largo"],
    ]
      .map(
        ([value, label]) =>
          `<button data-study-phase="${value}" class="${phase === value ? "active" : "secondary"}" ${timer?.running ? "disabled" : ""}>${label}</button>`,
      )
      .join(
        "",
      )}</div><div class="timer-display" id="timerText">${clockText(seconds)}</div><div class="progress-track"><div class="progress-fill" id="timerProgress" style="width:${progress}%"></div></div><label>Asignatura<select id="studySubject" ${timer?.running ? "disabled" : ""}>${subjectOptions(timer?.subjectId || "", true)}</select></label><div class="actions feature-gap"><button data-study-action="${timer?.running ? "pause" : "start"}">${timer?.running ? "Pausar" : timer?.hasStarted && !timer.finished ? "Continuar" : "Iniciar"}</button><button class="secondary" data-study-action="reset">Reiniciar</button></div><p class="muted" id="timerStatus">${timer?.finished ? "Sesión terminada. Elige cuándo empezar la siguiente fase." : "El temporizador conserva su estado al cambiar de pestaña o recargar."}</p><p class="muted">No se inician fases automáticamente. El aviso aparece al abrir la página si terminó mientras estaba cerrada; no se prometen notificaciones con el navegador cerrado.</p></section><section class="card"><h2>Ritmo de estudio</h2><form id="studySettings" class="form-grid feature-gap">${field("Estudio (min)", "focus", "number", cfg.focus, 'min="1" max="180" required')}${field("Descanso corto (min)", "short", "number", cfg.short, 'min="1" max="180" required')}${field("Descanso largo (min)", "long", "number", cfg.long, 'min="1" max="180" required')}<button ${timer?.running ? "disabled" : ""}>Guardar duraciones</button></form><p>${(state.studySessions || []).length} sesiones completadas · ${fmt(stats.total / 3600)} horas</p><p class="muted">Esta semana: ${fmt(stats.week / 3600)} h. Descanso largo recomendado cada cuatro sesiones.</p></section></div><section class="card feature-gap"><h2>Sesiones completadas</h2>${
      (state.studySessions || [])
        .slice()
        .reverse()
        .slice(0, 30)
        .map(
          (s) =>
            `<p>${esc(new Date(s.completedAt).toLocaleString("es-ES"))} · ${esc(subjectName(s.subjectId))} · ${fmt(s.seconds / 60)} min</p>`,
        )
        .join("") || empty("Sin sesiones completadas.")
    }</section>`
  );
}
function clockText(seconds) {
  const n = Math.max(0, Math.ceil(seconds));
  return (
    String(Math.floor(n / 60)).padStart(2, "0") +
    ":" +
    String(n % 60).padStart(2, "0")
  );
}
function barChart(entries, suffix = "h") {
  const max = Math.max(0, ...entries.map((e) => e[1])) || 1;
  return entries.length
    ? `<div class="bar-chart">${entries.map(([label, value]) => `<div><span>${esc(label)}</span><div class="bar-track"><i style="width:${(value / max) * 100}%"></i></div><b>${fmt(value)} ${suffix}</b></div>`).join("")}</div>`
    : empty("Sin datos registrados.");
}
function statsView() {
  const stats = V4.studyStats(state.studySessions || []),
    done = state.tasks.filter((t) => t.done).length,
    total = state.tasks.length,
    complete = gradeGroups().filter((g) => g.result.final !== null),
    mean = complete.length
      ? complete.reduce((a, g) => a + g.result.final, 0) / complete.length
      : null;
  return (
    head(
      "Tu progreso, con perspectiva",
      "Estadísticas calculadas a partir de tus registros.",
    ) +
    `<div class="stats">${[
      ["Tareas completadas", `${done} / ${total}`],
      [
        "Progreso de tareas",
        `${total ? Math.round((done / total) * 100) : 0} %`,
      ],
      [
        "Exámenes próximos",
        state.exams.filter((e) => e.date >= today()).length,
      ],
      ["Media de evaluaciones completas", fmt(mean)],
    ]
      .map(
        ([label, value]) =>
          `<div class="card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`,
      )
      .join(
        "",
      )}</div><p class="muted">La media general es la media simple de evaluaciones completas; no se presuponen pesos entre evaluaciones ni asignaturas.</p><div class="stats">${[
      ["Hoy", stats.day],
      ["Esta semana", stats.week],
      ["Este mes", stats.month],
      ["Total", stats.total],
    ]
      .map(
        ([label, value]) =>
          `<section class="card"><h3>${label}</h3><strong>${fmt(value / 3600)} h de estudio</strong></section>`,
      )
      .join(
        "",
      )}</div><div class="feature-grid"><section class="card"><h2>Estudio por día</h2>${barChart(
      Object.entries(stats.byDay)
        .sort()
        .slice(-30)
        .map(([d, n]) => [formatDate(d), n / 3600]),
    )}</section><section class="card"><h2>Distribución por asignatura</h2>${barChart(Object.entries(stats.bySubject).map(([id, n]) => [subjectName(id), n / 3600]))}</section></div><section class="card feature-gap"><h2>Evolución académica</h2><div class="subjects-grid">${
      gradeGroups()
        .map(
          (g) =>
            `<article><h3>${esc(subjectName(g.subjectId))} · ${esc(g.term)}</h3>${gradeResult(g.result)}${lineChart(g.rows)}</article>`,
        )
        .join("") || empty("Añade notas para ver tu evolución.")
    }</div></section>`
  );
}
function safeFormat(text) {
  return esc(text)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    .replace(/\n/g, "<br>");
}
function notesView() {
  const notes = (state.notes || [])
    .filter(
      (n) =>
        (!noteFavorite || n.favorite) &&
        (!noteSearch ||
          (n.title + " " + n.content + " " + subjectName(n.subjectId))
            .toLocaleLowerCase()
            .includes(noteSearch.toLocaleLowerCase())),
    )
    .slice()
    .sort((a, b) =>
      noteOrder === "subject"
        ? subjectName(a.subjectId).localeCompare(subjectName(b.subjectId))
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  const current = (state.notes || []).find((n) => n.id === noteEditing);
  return (
    head(
      "Apuntes que te acompañan",
      "Texto seguro con títulos, negrita y cursiva.",
      '<button data-note-action="new">＋ Nuevo apunte</button>',
    ) +
    `<div class="task-filters"><label>Buscar<input id="noteSearch" value="${esc(noteSearch)}" placeholder="Título, contenido o asignatura"></label><label>Orden<select id="noteOrder"><option value="updated">Más recientes</option><option value="subject" ${noteOrder === "subject" ? "selected" : ""}>Asignatura</option></select></label><label class="toggle"><input id="noteFavorite" type="checkbox" ${noteFavorite ? "checked" : ""}>Solo favoritos</label></div><div class="notes-layout"><section class="card">${notes.map((n) => `<div class="record-row"><button class="secondary" data-note-open="${esc(n.id)}">${n.favorite ? "★ " : ""}${esc(n.title || "Sin título")}<small>${esc(subjectName(n.subjectId))} · ${formatDate(n.updatedAt.slice(0, 10))}</small></button><button class="secondary" data-note-favorite="${esc(n.id)}" aria-label="Marcar favorito">${n.favorite ? "★" : "☆"}</button></div>`).join("") || empty("No hay apuntes en esta vista.")}</section><section class="card">${current ? `<form id="noteForm" data-id="${esc(current.id)}">${field("Título", "title", "text", current.title, 'maxlength="120"')}${subjectField(current.subjectId, true)}<label>Contenido<textarea name="content" rows="12" maxlength="200000">${esc(current.content)}</textarea></label><p class="muted" id="noteSaveStatus" role="status">Guardado automáticamente en este navegador.</p><p class="muted">Formato: # título, **negrita**, *cursiva*. El HTML se muestra como texto.</p><div class="actions"><button type="button" class="secondary" data-note-delete="${esc(current.id)}">Eliminar apunte</button></div></form><h3 class="feature-gap">Vista previa</h3><div id="notePreview" class="note-preview">${safeFormat(current.content)}</div>` : empty("Selecciona o crea un apunte.")}</section></div>`
  );
}
const practiceDate = (value) =>
  new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(V4.date(value));
function practiceData() {
  return state.practice;
}
function practiceView() {
  const p = practiceData(),
    stats = p ? V4.practice(p, today()) : null;
  return (
    head(
      "Formación en empresa",
      "Planifica tus prácticas y registra asistencia real.",
    ) +
    `<section class="card"><form id="practiceForm" class="form-grid">${field("Inicio", "start", "date", p?.start || "", "required")}${field("Duración", "amount", "number", p?.amount || "", 'min="1" max="3650"')}<label>Unidad<select name="unit">${[
      ["months", "Meses naturales"],
      ["weeks", "Semanas"],
      ["days", "Días naturales"],
    ]
      .map(
        ([v, l]) =>
          `<option value="${v}" ${p?.unit === v ? "selected" : ""}>${l}</option>`,
      )
      .join(
        "",
      )}</select></label>${field("Fin manual (opcional)", "end", "date", p?.manualEnd ? p.end : "")}${field("Empresa", "company", "text", p?.company || "", 'maxlength="120"')}${field("Ubicación", "location", "text", p?.location || "", 'maxlength="200"')}${field("Entrada habitual", "timeStart", "time", p?.timeStart || "")}${field("Salida habitual", "timeEnd", "time", p?.timeEnd || "")}${field("Horas totales previstas (opcional)", "totalHours", "number", p?.totalHours || "", 'min="0.01" step="any"')}<fieldset><legend>Días de asistencia</legend>${["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d, i) => `<label class="toggle"><input name="weekday" type="checkbox" value="${i}" ${(p?.weekdays || [1, 2, 3, 4, 5]).includes(i) ? "checked" : ""}>${d}</label>`).join("")}</fieldset><label>Observaciones<textarea name="notes" maxlength="10000">${esc(p?.notes || "")}</textarea></label><button>Guardar prácticas</button></form><p class="muted">Los meses son naturales: se ajusta al último día del mes si es necesario. La fecha final manual prevalece. Los festivos escolares no cancelan por sí solos la asistencia a empresa.</p></section>${
      p
        ? `<section class="card feature-gap practice-card"><h2>${esc(p.company || "Prácticas de FP")}</h2><p>Inicio de prácticas: ${practiceDate(p.start)} · Duración configurada: ${p.amount ? `${p.amount} ${{ months: "meses naturales", weeks: "semanas", days: "días naturales" }[p.unit]}` : "definida por fecha final"} · Fin previsto: ${practiceDate(p.end)}${p.manualEnd ? " (ajuste manual)" : ""}</p><div class="progress-track"><div class="practice-fill" style="width:${Math.min(100, (stats.naturalElapsed / stats.naturalTotal) * 100)}%"></div></div><p>${stats.naturalElapsed} / ${stats.naturalTotal} días naturales transcurridos · ${stats.naturalTotal - stats.naturalElapsed} restantes</p><p>${stats.scheduled.length} jornadas programadas · ${stats.scheduledElapsed} transcurridas · ${stats.remaining} futuras · ${stats.attended} asistencias registradas</p><p>${fmt(stats.hours)} horas efectivas${p.totalHours ? ` / ${fmt(p.totalHours)} previstas · ${fmt(Math.max(0, p.totalHours - stats.hours))} pendientes` : ""}</p><p>Próxima jornada: ${stats.next ? formatDate(stats.next) : "No hay más jornadas programadas"}</p><a class="text-link" href="#calendar">Ver en calendario →</a></section><div class="feature-grid feature-gap"><section class="card"><h2>Registro de asistencia</h2><form id="attendanceForm" class="form-grid">${field("Fecha", "date", "date", "", "required")}${field("Horas realizadas", "hours", "number", "", 'min="0" max="24" step="0.25" required')}<label>Observaciones<textarea name="notes" maxlength="2000"></textarea></label><button>Guardar asistencia</button></form>${(
            p.logs || []
          )
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date))
            .map(
              (l) =>
                `<div class="record-row"><span>${formatDate(l.date)} · ${fmt(l.hours)} h<br>${esc(l.notes || "")}</span><button class="secondary" data-attendance-delete="${l.date}">Eliminar</button></div>`,
            )
            .join(
              "",
            )}</section><section class="card"><h2>Excepciones de asistencia</h2><form id="exceptionForm" class="form-grid">${field("Fecha", "date", "date", "", "required")}<label>Asistencia<select name="attend"><option value="no">No asistir</option><option value="yes">Asistir aunque no sea día habitual</option></select></label><button>Guardar excepción</button></form>${(p.exceptions || []).map((e) => `<div class="record-row"><span>${formatDate(e.date)} · ${e.attend ? "Asistir" : "No asistir"}</span><button class="secondary" data-exception-delete="${e.date}">Eliminar</button></div>`).join("")}</section></div>`
        : ""
    }`
  );
}
function practiceScheduled(p, day) {
  const exception = p.exceptions?.find((e) => e.date === day);
  return exception
    ? exception.attend
    : p.weekdays.includes(V4.date(day).getDay());
}
function practiceTimetableSummary() {
  const p = state.practice,
    day = today();
  if (!p || day < p.start || day > p.end || !practiceScheduled(p, day))
    return "";
  return `<p class="practice-details">Hoy también tienes una jornada programada de formación en empresa${p.company ? " · " + esc(p.company) : ""}${p.timeStart ? " · " + p.timeStart + "–" + p.timeEnd : ""}. No modifica tus bloques del horario.</p>`;
}
function practiceCalendarLabels(day) {
  const p = state.practice;
  if (!p || day < p.start || day > p.end) return "";
  const attend = practiceScheduled(p, day);
  if (!attend && day !== p.start && day !== p.end) return "";
  return `<button class="practice-event" data-day="${day}">${day === p.start && day === p.end ? "Inicio y fin de prácticas: " + practiceDate(day) : day === p.start ? "Inicio de prácticas: " + practiceDate(day) : day === p.end ? "Fin previsto de prácticas: " + practiceDate(day) : "Prácticas"}${p.company ? " · " + esc(p.company) : ""}</button>`;
}
function practiceDayDetails(day) {
  const p = state.practice;
  if (!p || day < p.start || day > p.end) return "";
  const attend = practiceScheduled(p, day),
    log = p.logs?.find((l) => l.date === day);
  return `<section class="practice-details"><h3>Prácticas${p.company ? " · " + esc(p.company) : ""}</h3><p>${attend ? "Jornada programada" : "Sin asistencia programada para este día"}${p.timeStart ? " · " + p.timeStart + "–" + p.timeEnd : ""}</p><p>Inicio de prácticas: ${practiceDate(p.start)}<br>Duración configurada: ${p.amount ? `${p.amount} ${{ months: "meses naturales", weeks: "semanas", days: "días naturales" }[p.unit]}` : "definida por fecha final"}<br>Fin previsto de prácticas: ${practiceDate(p.end)}${p.manualEnd ? " (ajuste manual)" : ""}</p><p>${esc(p.location || "")}</p>${p.notes ? `<p class="task-description">${esc(p.notes)}</p>` : ""}${log ? `<p>Registradas ${fmt(log.hours)} h · ${esc(log.notes || "")}</p>` : ""}<a class="text-link" href="#practice" data-close-day>Ver seguimiento →</a></section>`;
}
function remindersView() {
  const rows = V4.reminders(state, today());
  return (
    head("Tus próximos pasos", "Recordatorios internos, sin duplicados.") +
    `<section class="card"><form id="reminderSettings" class="form-grid">${field("Anticipación (días)", "leadDays", "number", state.reminderSettings?.leadDays ?? 3, 'min="0" max="60" required')}<button>Guardar anticipación</button></form>${reminderRows(rows)}<p class="muted">Se muestran al abrir StudyFlow; no se envían avisos con el navegador cerrado.</p></section>`
  );
}
function reminderRows(rows) {
  return (
    rows
      .map(
        (r) =>
          `<div class="record-row"><div><strong>${esc(r.title)}</strong><p class="muted">${formatDate(r.due)}${r.distance < 0 ? " · Atrasada" : ""}</p></div><button class="secondary" data-reminder-dismiss="${esc(r.id)}">Descartar</button></div>`,
      )
      .join("") || empty("No tienes recordatorios pendientes.")
  );
}
function v4ImportReview() {
  const a = state.importArchive;
  if (!a?.activities?.length) return "";
  return `<section class="card"><h2>Datos importados conservados</h2><p>El servicio externo se ha retirado. Estas copias siguen guardadas; puedes convertir las que tengan título conocido en tareas locales. Las fechas son las de la última copia, no una actualización del servicio.</p>${a.activities
    .map((item) => {
      const meta = item.limited ? item.previousMetadata : item,
        useful =
          Boolean(meta?.name) &&
          !/^Entrega propia|^Actividad sin título/.test(meta.name),
        converted =
          (a.converted || []).includes(item.id) ||
          state.tasks.some((t) => t.importKey === item.id);
      return `<div class="record-row"><div><strong>${esc(useful ? meta.name : "Actividad sin metadatos suficientes")}</strong><p class="muted">${esc(item.courseName || "")} · ${useful && meta.due ? formatDate(meta.due) : "Sin fecha conservada"}</p></div><button class="secondary" data-import-local="${esc(item.id)}" ${!useful || converted ? "disabled" : ""}>${converted ? "Conservada como local" : "Conservar como tarea local"}</button></div>`;
    })
    .join("")}</section>`;
}
function v4Dashboard() {
  const done = state.tasks.filter((t) => t.done).length,
    pending = state.tasks.filter((t) => !t.done),
    sessions = V4.studyStats(state.studySessions || []),
    final = gradeGroups().filter((g) => g.result.final !== null),
    average = final.length
      ? final.reduce((a, g) => a + g.result.final, 0) / final.length
      : null,
    reminders = V4.reminders(state, today()),
    p = state.practice,
    practice = p ? V4.practice(p, today()) : null;
  return (
    head(
      `Tu espacio, ${esc(state.settings.name || "a tu ritmo")} ✦`,
      "Aprende, organiza y construye tu próximo paso.",
      addButtons(),
    ) +
    `<div class="stats">${[
      ["Tareas pendientes", pending.length, "accent"],
      ["Tareas completadas", done, "mint"],
      ["Media de evaluaciones completas", fmt(average), "peach"],
      ["Estudio esta semana", fmt(sessions.week / 3600) + " h", "blue"],
    ]
      .map(
        ([label, n, c]) =>
          `<section class="card"><div class="stat-label">${label}</div><div class="stat-value ${c}">${n}</div></section>`,
      )
      .join(
        "",
      )}</div><div class="dashboard-grid"><div class="stack"><section class="card"><div class="section-head"><h2>Próximas entregas</h2><a href="#tasks" class="text-link">Ver todas →</a></div>${taskRows(
      orderedTasks()
        .filter((t) => !t.done)
        .slice(0, 5),
    )}</section><section class="card"><div class="section-head"><h2>Recordatorios importantes</h2><a href="#reminders" class="text-link">Ver todos (${reminders.length}) →</a></div>${reminderRows(reminders.slice(0, 4))}</section></div><div class="stack">${timetableDashboard()}<section class="card"><h2>Próximos exámenes</h2>${examRows(
      state.exams
        .filter((e) => e.date >= today())
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 3),
    )}</section><section class="card practice-card"><h2>Prácticas de FP</h2>${p ? `<p>${esc(p.company || "Periodo configurado")} · ${formatDate(p.start)} – ${formatDate(p.end)}</p><p>${practice.naturalElapsed}/${practice.naturalTotal} días naturales · ${fmt(practice.hours)} horas registradas</p>${practiceTimetableSummary()}` : '<p class="muted">Configura tu periodo de formación en empresa, sin fechas predeterminadas.</p>'}<a class="text-link" href="#practice">Ver prácticas →</a></section></div></div>`
  );
}
function newTimer(phase, subjectId = "") {
  const duration = studyConfig()[phase] * 60;
  return {
    id: uid(),
    phase,
    subjectId,
    duration,
    remaining: duration,
    running: false,
    endAt: null,
    finished: false,
    segments: [],
  };
}
function settleStudy(showAlert = false) {
  if (typeof state === "undefined" || storageBlocked) return;
  const result = V4.settleTimer(
    state.pomodoro,
    state.studySessions || [],
    Date.now(),
  );
  if (!result.completed) {
    if (showAlert && state.pomodoro?.finished && !state.pomodoro.notified) {
      const next = structuredClone(state);
      next.pomodoro.notified = true;
      if (commit(next, false))
        notify(
          state.pomodoro.phase === "focus"
            ? "Sesión de estudio completada. Buen momento para descansar."
            : "Descanso terminado.",
        );
    }
    return;
  }
  const next = structuredClone(state);
  next.pomodoro = { ...result.timer, notified: showAlert };
  next.studySessions = result.sessions;
  if (commit(next, false)) {
    if (showAlert)
      notify(
        result.timer.phase === "focus"
          ? "Sesión de estudio completada. Buen momento para descansar."
          : "Descanso terminado.",
      );
    if (
      ["study", "dashboard", "stats"].includes(view()) &&
      !document.querySelector("dialog[open]")
    )
      render();
  }
}
function studyAction(action) {
  settleStudy();
  const next = structuredClone(state);
  let timer =
    next.pomodoro ||
    newTimer("focus", document.getElementById("studySubject")?.value || "");
  if (action === "reset") {
    timer = newTimer(timer.phase, timer.subjectId);
  } else if (action === "pause" && timer.running) {
    const end = Math.min(Date.now(), timer.endAt);
    timer.segments ??= [];
    if (timer.segmentStart && end > timer.segmentStart)
      timer.segments.push({ start: timer.segmentStart, end });
    timer.remaining = Math.max(0, (timer.endAt - end) / 1000);
    timer.running = false;
    timer.endAt = null;
    timer.segmentStart = null;
  } else if (action === "start") {
    if (timer.finished || timer.remaining <= 0)
      timer = newTimer(
        timer.phase,
        document.getElementById("studySubject")?.value || timer.subjectId,
      );
    timer.subjectId =
      document.getElementById("studySubject")?.value || timer.subjectId || "";
    timer.running = true;
    timer.hasStarted = true;
    const now = Date.now();
    timer.segmentStart = now;
    timer.endAt = now + timer.remaining * 1000;
  }
  next.pomodoro = timer;
  commit(next);
}
function saveNote(form) {
  const next = structuredClone(state),
    note = (next.notes || []).find((n) => n.id === form.dataset.id);
  if (!note) return;
  Object.assign(note, {
    title: form.elements.title.value,
    content: form.elements.content.value,
    subjectId: form.elements.subjectId.value,
    updatedAt: new Date().toISOString(),
  });
  if (commit(next, false)) {
    document.getElementById("notePreview").innerHTML = safeFormat(note.content);
    document.getElementById("noteSaveStatus").textContent =
      "En el navegador · Guardado a las " +
      new Date().toLocaleTimeString("es-ES");
  } else
    document.getElementById("noteSaveStatus").textContent =
      "No se pudo guardar. Conserva el contenido antes de cerrar.";
}
document.addEventListener("submit", (e) => {
  const form = e.target,
    f = form.elements;
  if (
    ![
      "gradeSettings",
      "gradeForm",
      "studySettings",
      "practiceForm",
      "attendanceForm",
      "exceptionForm",
      "reminderSettings",
      "noteForm",
    ].includes(form.id)
  )
    return;
  e.preventDefault();
  try {
    if (form.id === "gradeSettings")
      mutate(
        (s) =>
          (s.gradeSettings = {
            ...s.gradeSettings,
            scale: Number(f.scale.value),
            target: Number(f.target.value),
          }),
      );
    if (form.id === "gradeForm") {
      const row = {
        id: form.dataset.id || uid(),
        subjectId: f.subjectId.value,
        term: f.term.value.trim(),
        title: f.title.value.trim(),
        type: f.type.value,
        date: f.date.value,
        weight: Number(f.weight.value),
        score: f.score.value === "" ? null : Number(f.score.value),
      };
      gradeTerm = row.term;
      mutate((s) => {
        s.grades ??= [];
        const i = s.grades.findIndex((r) => r.id === row.id);
        if (i < 0) s.grades.push(row);
        else s.grades[i] = row;
      });
    }
    if (form.id === "studySettings") {
      if (state.pomodoro?.running) {
        notify("Pausa el temporizador antes de cambiar las duraciones.");
        return;
      }
      mutate((s) => {
        s.studySettings = {
          focus: Number(f.focus.value),
          short: Number(f.short.value),
          long: Number(f.long.value),
        };
        if (s.pomodoro && !s.pomodoro.hasStarted) {
          const seconds = s.studySettings[s.pomodoro.phase] * 60;
          s.pomodoro.duration = seconds;
          s.pomodoro.remaining = seconds;
        }
      });
    }
    if (form.id === "practiceForm") {
      const start = f.start.value,
        manual = f.end.value,
        amount = f.amount.value ? Number(f.amount.value) : null,
        unit = f.unit.value,
        end = manual || V4.addDuration(start, amount, unit);
      V4.date(end);
      const weekdays = [...form.querySelectorAll("[name=weekday]:checked")].map(
        (i) => Number(i.value),
      );
      const p = {
        ...state.practice,
        start,
        end,
        manualEnd: Boolean(manual),
        amount,
        unit,
        company: f.company.value.trim(),
        location: f.location.value.trim(),
        timeStart: f.timeStart.value,
        timeEnd: f.timeEnd.value,
        totalHours: f.totalHours.value ? Number(f.totalHours.value) : null,
        notes: f.notes.value,
        weekdays,
        logs: state.practice?.logs || [],
        exceptions: state.practice?.exceptions || [],
      };
      mutate((s) => (s.practice = p));
    }
    if (form.id === "attendanceForm") {
      const entry = {
        date: f.date.value,
        hours: Number(f.hours.value),
        notes: f.notes.value,
      };
      mutate((s) => {
        s.practice.logs = s.practice.logs.filter((l) => l.date !== entry.date);
        s.practice.logs.push(entry);
      });
    }
    if (form.id === "exceptionForm") {
      const entry = { date: f.date.value, attend: f.attend.value === "yes" };
      mutate((s) => {
        s.practice.exceptions = s.practice.exceptions.filter(
          (l) => l.date !== entry.date,
        );
        s.practice.exceptions.push(entry);
      });
    }
    if (form.id === "reminderSettings")
      mutate(
        (s) =>
          (s.reminderSettings = {
            ...s.reminderSettings,
            leadDays: Number(f.leadDays.value),
          }),
      );
    if (form.id === "noteForm") saveNote(form);
  } catch (error) {
    notify(error.message);
  }
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const d = b.dataset;
  if (d.gradeEdit) {
    const r = (state.grades || []).find((r) => r.id === d.gradeEdit);
    if (!r) return;
    gradeTerm = r.term;
    render();
    const form = document.getElementById("gradeForm");
    form.dataset.id = r.id;
    for (const k of [
      "subjectId",
      "term",
      "title",
      "type",
      "date",
      "weight",
      "score",
    ])
      form.elements[k].value = r[k] ?? "";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (d.gradeDelete && confirm("¿Eliminar esta nota?"))
    mutate((s) => (s.grades = s.grades.filter((r) => r.id !== d.gradeDelete)));
  if (d.studyPhase && !state.pomodoro?.running)
    mutate(
      (s) =>
        (s.pomodoro = newTimer(
          d.studyPhase,
          document.getElementById("studySubject")?.value || "",
        )),
    );
  if (d.studyAction) {
    if (
      d.studyAction === "reset" &&
      state.pomodoro?.running &&
      !confirm("¿Reiniciar? La sesión incompleta no se registrará.")
    )
      return;
    studyAction(d.studyAction);
  }
  if (d.noteAction === "new") {
    noteEditing = uid();
    mutate((s) => {
      s.notes ??= [];
      s.notes.push({
        id: noteEditing,
        title: "",
        content: "",
        subjectId: "",
        favorite: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
  }
  if (d.noteOpen) {
    noteEditing = d.noteOpen;
    render();
  }
  if (d.noteFavorite)
    mutate((s) => {
      const n = s.notes.find((n) => n.id === d.noteFavorite);
      n.favorite = !n.favorite;
    });
  if (d.noteDelete && confirm("¿Eliminar este apunte?")) {
    mutate((s) => (s.notes = s.notes.filter((n) => n.id !== d.noteDelete)));
    noteEditing = null;
    render();
  }
  if (d.reminderDismiss)
    mutate(
      (s) =>
        (s.dismissedReminders = [
          ...new Set([...(s.dismissedReminders || []), d.reminderDismiss]),
        ]),
    );
  if (d.attendanceDelete && confirm("¿Eliminar este registro de asistencia?"))
    mutate(
      (s) =>
        (s.practice.logs = s.practice.logs.filter(
          (l) => l.date !== d.attendanceDelete,
        )),
    );
  if (d.exceptionDelete)
    mutate(
      (s) =>
        (s.practice.exceptions = s.practice.exceptions.filter(
          (l) => l.date !== d.exceptionDelete,
        )),
    );
  if (d.importLocal) {
    try {
      commit(V4.convertImport(state, d.importLocal));
    } catch (error) {
      notify(error.message);
    }
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "noteSearch") {
    const position = e.target.selectionStart;
    noteSearch = e.target.value;
    render();
    const input = document.getElementById("noteSearch");
    input.focus();
    input.setSelectionRange(position, position);
    return;
  }
  if (e.target.closest("#noteForm")) saveNote(e.target.form);
});
document.addEventListener("change", (e) => {
  if (e.target.id === "gradeTerm") {
    gradeTerm = e.target.value.trim() || "1ª evaluación";
    render();
  }
  if (e.target.id === "noteSearch") {
    noteSearch = e.target.value;
    render();
  }
  if (e.target.id === "noteOrder") {
    noteOrder = e.target.value;
    render();
  }
  if (e.target.id === "noteFavorite") {
    noteFavorite = e.target.checked;
    render();
  }
  if (e.target.id === "studySubject" && !state.pomodoro?.running)
    mutate((s) => {
      s.pomodoro = s.pomodoro || newTimer("focus");
      s.pomodoro.subjectId = e.target.value;
    });
});
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-close-day]"))
    document.getElementById("dayDetails").close();
});
setInterval(() => {
  if (typeof state === "undefined") return;
  settleStudy(!document.hidden);
  const timer = state.pomodoro;
  if (view() !== "study" || !timer) return;
  const text = document.getElementById("timerText"),
    bar = document.getElementById("timerProgress");
  if (text) text.textContent = clockText(V4.remaining(timer, Date.now()));
  if (bar)
    bar.style.width =
      Math.max(
        0,
        Math.min(
          100,
          (1 - V4.remaining(timer, Date.now()) / timer.duration) * 100,
        ),
      ) + "%";
}, 500);
window.addEventListener("pageshow", () => settleStudy(true));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) settleStudy(true);
});
