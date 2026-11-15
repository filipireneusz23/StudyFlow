/* UI uses the existing personal-state save/export path. */
const TT_DAYS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
function ttSubjects() {
  return [
    ...state.subjects.map((s) => ({
      id: String(s.id),
      name: s.name,
      color: s.color,
    })),
    ...classroom.cache.courses
      .filter(
        (c) => classroom.isCourseVisible(c.id) && !classroomManualSubject(c.id),
      )
      .map((c) => ({ id: "gc:" + c.id, name: c.name, color: "#86b7ef" })),
  ];
}
function ttName(block) {
  return block.type === "break"
    ? "Recreo"
    : block.type === "free"
      ? "Hora libre"
      : ttSubjects().find((s) => s.id === block.subjectId)?.name ||
        block.subjectName ||
        "Asignatura no disponible";
}
function ttStatus() {
  const info = Timetable.status(
    Timetable.active(state),
    new Date(),
    (d) => academicDay(localDate(d)).nonTeaching,
  );
  if (info.next && localDate(info.next.date) > ACADEMIC_CALENDAR.courseEnd)
    info.next = null;
  return info;
}
function ttNext(info) {
  return info.next
    ? `${TT_DAYS[info.next.date.getDay()]} ${formatDate(localDate(info.next.date))}, ${info.next.block.start} · ${esc(ttName(info.next.block))}`
    : "Sin próxima clase configurada.";
}
function timetableDashboard() {
  const info = ttStatus();
  return `<section class="card timetable-summary"><div class="section-head"><h2>Horario de hoy</h2><a class="text-link" href="#timetable">Ver horario →</a></div><p>${info.off ? "Hoy no hay clases" : info.current ? `Ahora: <strong>${esc(ttName(info.current))}</strong> · ${info.current.start}–${info.current.end}` : "No hay ningún bloque en curso."}</p>${!info.off ? info.blocks.map((b) => `<div class="tt-today ${info.current?.id === b.id ? "tt-current" : ""}"><span>${b.start}–${b.end}</span><strong>${esc(ttName(b))}</strong></div>`).join("") || '<p class="muted">Tu horario está vacío. Configúralo para ver tus clases.</p>' : ""}<p class="muted">Próxima clase: ${ttNext(info)}</p></section>`;
}
function timetableView() {
  const table = Timetable.get(state),
    schedule = Timetable.active(state),
    info = ttStatus(),
    bounds = [
      ...new Set(schedule.blocks.flatMap((b) => [b.start, b.end])),
    ].sort((a, b) => Timetable.minutes(a) - Timetable.minutes(b));
  let rows = "";
  for (let i = 0; i < bounds.length - 1; i++) {
    rows += `<tr><th scope="row">${bounds[i]}<small>${bounds[i + 1]}</small></th>`;
    for (let day = 1; day <= 5; day++) {
      const block = schedule.blocks.find(
        (b) => b.day === day && b.start === bounds[i],
      );
      const inside = schedule.blocks.some(
        (b) => b.day === day && b.start < bounds[i] && b.end > bounds[i],
      );
      if (inside) continue;
      if (!block) {
        rows += '<td class="tt-gap"></td>';
        continue;
      }
      const span = bounds.indexOf(block.end) - i;
      rows += `<td rowspan="${span}" class="tt-cell ${block.type} ${info.current?.id === block.id ? "tt-current" : ""}" style="--block-color:${block.color}"><button data-tt-edit="${esc(block.id)}"><strong>${esc(ttName(block))}</strong><span>${block.start}–${block.end}</span>${block.room ? `<span>Aula: ${esc(block.room)}</span>` : ""}${block.teacher ? `<span>${esc(block.teacher)}</span>` : ""}${info.current?.id === block.id ? "<b>En curso</b>" : ""}</button></td>`;
    }
    rows += "</tr>";
  }
  return (
    head(
      "Tu semana, organizada",
      "Configura tu horario. No se añaden clases automáticamente.",
      '<button data-tt-action="new-block">＋ Nuevo bloque</button>',
    ) +
    `<section class="card"><div class="tt-toolbar"><label>Horario activo<select id="ttSchedule">${table.schedules.map((s) => `<option value="${esc(s.id)}" ${s.id === table.activeId ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label><button class="secondary" data-tt-action="new-profile">Nuevo horario</button><button class="secondary" data-tt-action="rename-profile">Renombrar</button><button class="secondary" data-tt-action="delete-profile" ${table.schedules.length === 1 ? "disabled" : ""}>Eliminar horario</button></div><p>${info.off ? "Hoy no hay clases" : info.current ? `En curso: ${esc(ttName(info.current))}` : "No hay ningún bloque en curso."}</p><p class="muted">Próxima clase: ${ttNext(info)}</p>${
      bounds.length
        ? `<div class="tt-scroll" tabindex="0" aria-label="Horario semanal: desplaza horizontalmente en móvil"><table class="tt-table"><thead><tr><th>Hora</th>${TT_DAYS.slice(
            1,
          )
            .map(
              (day, i) =>
                `<th class="${new Date().getDay() === i + 1 ? "tt-day-today" : ""}" scope="col">${day}${new Date().getDay() === i + 1 ? " · Hoy" : ""}</th>`,
            )
            .join("")}</tr></thead><tbody>${rows}</tbody></table></div>`
        : '<div class="empty">Tu horario está vacío. Añade tu primer bloque de clase, recreo u hora libre.</div>'
    }<form id="ttCopy" class="tt-toolbar"><label>Copiar bloques de<select name="from">${TT_DAYS.slice(
      1,
    )
      .map((d, i) => `<option value="${i + 1}">${d}</option>`)
      .join("")}</select></label><label>A<select name="to">${TT_DAYS.slice(1)
      .map(
        (d, i) =>
          `<option value="${i + 1}" ${i === 1 ? "selected" : ""}>${d}</option>`,
      )
      .join(
        "",
      )}</select></label><button class="secondary" ${!schedule.blocks.length ? "disabled" : ""}>Copiar día</button></form><p class="muted">Los recreos y horas libres se diferencian de las clases. Los festivos y vacaciones oficiales suspenden los indicadores de clase actual. Las copias JSON incluyen todos tus horarios.</p></section>`
  );
}
function ttCommit(table) {
  try {
    Timetable.validate(table);
    return mutate((s) => (s.timetable = table));
  } catch (error) {
    notify(error.message);
    return false;
  }
}
function ttOpen(id) {
  const block = Timetable.active(state).blocks.find((b) => b.id === id),
    form = document.getElementById("ttForm");
  form.reset();
  form.dataset.id = id || "";
  const subjects = ttSubjects();
  if (
    block?.type === "class" &&
    !subjects.some((s) => s.id === block.subjectId)
  )
    subjects.push({
      id: block.subjectId,
      name: block.subjectName || "Asignatura anterior",
      color: block.color,
    });
  form.elements.subject.innerHTML =
    '<option value="">Elige una asignatura</option>' +
    subjects
      .map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`)
      .join("");
  form.elements.day.value =
    block?.day || Math.min(5, Math.max(1, new Date().getDay()));
  form.elements.type.value = block?.type || "class";
  form.elements.subject.value = block?.subjectId || "";
  form.elements.start.value = block?.start || "";
  form.elements.end.value = block?.end || "";
  form.elements.room.value = block?.room || "";
  form.elements.teacher.value = block?.teacher || "";
  form.elements.color.value = block?.color || "#b4a3ff";
  document.getElementById("ttDelete").hidden = !block;
  document.getElementById("ttTitle").textContent = block
    ? "Editar bloque"
    : "Nuevo bloque";
  ttType();
  document.getElementById("ttDialog").showModal();
}
function ttType() {
  const f = document.getElementById("ttForm");
  document.getElementById("ttSubjectLabel").hidden =
    f.elements.type.value !== "class";
  f.elements.subject.required = f.elements.type.value === "class";
}
document.getElementById("ttClose").onclick = () =>
  document.getElementById("ttDialog").close();
document.getElementById("ttForm").onsubmit = (e) => {
  e.preventDefault();
  const f = e.target.elements,
    subject = ttSubjects().find((s) => s.id === f.subject.value),
    old = Timetable.active(state).blocks.find(
      (b) => b.id === e.target.dataset.id,
    );
  const block = {
    id: e.target.dataset.id || uid(),
    day: Number(f.day.value),
    type: f.type.value,
    subjectId: f.subject.value,
    subjectName: subject?.name || old?.subjectName || "",
    start: f.start.value,
    end: f.end.value,
    color: f.color.value,
    room: f.room.value.trim(),
    teacher: f.teacher.value.trim(),
  };
  try {
    if (ttCommit(Timetable.upsert(Timetable.get(state), block)))
      document.getElementById("ttDialog").close();
  } catch (error) {
    notify(error.message);
  }
};
document.getElementById("ttDelete").onclick = () => {
  if (!confirm("¿Eliminar este bloque?")) return;
  const id = document.getElementById("ttForm").dataset.id,
    table = structuredClone(Timetable.get(state));
  table.schedules.find((s) => s.id === table.activeId).blocks = table.schedules
    .find((s) => s.id === table.activeId)
    .blocks.filter((b) => b.id !== id);
  if (ttCommit(table)) document.getElementById("ttDialog").close();
};
document.addEventListener("change", (e) => {
  if (e.target.id === "ttSchedule") {
    const table = structuredClone(Timetable.get(state));
    table.activeId = e.target.value;
    ttCommit(table);
  }
  if (e.target.closest("#ttForm") && e.target.name === "type") ttType();
  if (e.target.closest("#ttForm") && e.target.name === "subject") {
    const s = ttSubjects().find((s) => s.id === e.target.value);
    if (s) document.getElementById("ttForm").elements.color.value = s.color;
  }
});
document.addEventListener("submit", (e) => {
  if (e.target.id === "ttCopy") {
    e.preventDefault();
    try {
      ttCommit(
        Timetable.copyDay(
          Timetable.get(state),
          Number(e.target.elements.from.value),
          Number(e.target.elements.to.value),
          uid,
        ),
      );
    } catch (error) {
      notify(error.message);
    }
  }
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.ttEdit) ttOpen(b.dataset.ttEdit);
  const action = b.dataset.ttAction;
  if (!action) return;
  if (action === "new-block") {
    ttOpen();
    return;
  }
  if (action === "new-subject") {
    const name = prompt("Nombre de la asignatura")?.trim();
    if (!name) return;
    if (
      name.length > 80 ||
      ttSubjects().some((s) => s.name.toLowerCase() === name.toLowerCase())
    ) {
      notify("Usa un nombre único de hasta 80 caracteres.");
      return;
    }
    const id = uid(),
      form = document.getElementById("ttForm");
    if (
      mutate((s) =>
        s.subjects.push({ id, name, color: form.elements.color.value }),
      )
    ) {
      form.elements.subject.add(new Option(name, id));
      form.elements.subject.value = id;
    }
    return;
  }

  const table = structuredClone(Timetable.get(state)),
    schedule = table.schedules.find((s) => s.id === table.activeId);
  if (action === "new-profile" || action === "rename-profile") {
    const name = prompt(
      action === "new-profile"
        ? "Nombre del nuevo horario"
        : "Nombre del horario",
      action === "new-profile" ? "" : schedule.name,
    )?.trim();
    if (!name) return;
    if (name.length > 80) {
      notify("Usa un nombre de hasta 80 caracteres.");
      return;
    }
    if (action === "new-profile") {
      const id = uid();
      table.schedules.push({ id, name, blocks: [] });
      table.activeId = id;
    } else schedule.name = name;
    ttCommit(table);
  }
  if (
    action === "delete-profile" &&
    table.schedules.length > 1 &&
    confirm("¿Eliminar este horario y sus bloques?")
  ) {
    table.schedules = table.schedules.filter((s) => s.id !== table.activeId);
    table.activeId = table.schedules[0].id;
    ttCommit(table);
  }
});
setInterval(() => {
  if (
    ["timetable", "dashboard"].includes(view()) &&
    !document.hidden &&
    !document.querySelector("dialog[open]") &&
    !document.querySelector("main form:focus-within")
  )
    render();
}, 60000);
