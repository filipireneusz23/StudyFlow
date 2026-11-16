/* Offline academic models. No network dependencies or invented student data. */
(function (root) {
  "use strict";
  const key = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function date(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s))
      throw Error("Fecha no válida.");
    const d = new Date(s + "T12:00:00");
    if (key(d) !== s) throw Error("Fecha no válida.");
    return d;
  }
  const days = (a, b) => Math.round((date(b) - date(a)) / 86400000);
  function addDuration(start, amount, unit) {
    const d = date(start);
    if (!Number.isInteger(amount) || amount < 1 || amount > 3650)
      throw Error("Duración no válida.");
    if (unit === "months") {
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + amount);
      d.setDate(
        Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()),
      );
    } else if (["weeks", "days"].includes(unit))
      d.setDate(d.getDate() + amount * (unit === "weeks" ? 7 : 1));
    else throw Error("Unidad no válida.");
    return key(d);
  }
  function grades(rows, scale = 10, target = 5) {
    if (
      !Number.isFinite(scale) ||
      scale <= 0 ||
      !Number.isFinite(target) ||
      target < 0 ||
      target > scale
    )
      throw Error("Escala u objetivo no válido.");
    let total = 0,
      earned = 0,
      graded = 0;
    for (const r of rows) {
      if (!Number.isFinite(r.weight) || r.weight <= 0 || r.weight > 100)
        throw Error("Los pesos deben estar entre 0 y 100.");
      total += r.weight;
      if (r.score !== null && r.score !== undefined && r.score !== "") {
        if (!Number.isFinite(r.score) || r.score < 0 || r.score > scale)
          throw Error("Nota fuera de escala.");
        earned += (r.score * r.weight) / 100;
        graded += r.weight;
      }
    }
    if (total > 100 + 1e-6) throw Error("Los pesos superan el 100 %.");
    const valid = Math.abs(total - 100) < 1e-6,
      pending = total - graded;
    return {
      weight: total,
      graded,
      average: graded ? earned / (graded / 100) : null,
      final: valid && pending === 0 ? earned : null,
      needed: valid && pending > 0 ? (target - earned) / (pending / 100) : null,
      valid,
      pending,
    };
  }
  function studyStats(sessions, now = new Date()) {
    const today = key(now),
      week = new Date(now);
    week.setDate(week.getDate() - ((week.getDay() + 6) % 7));
    const month = today.slice(0, 7),
      byDay = Object.create(null),
      bySubject = Object.create(null);
    let day = 0,
      weekly = 0,
      monthly = 0,
      total = 0;
    for (const session of sessions) {
      total += session.seconds;
      bySubject[session.subjectId || "none"] =
        (bySubject[session.subjectId || "none"] || 0) + session.seconds;
      if (session.segments?.length) {
        for (const segment of session.segments) {
          let cursor = segment.start;
          while (cursor < segment.end) {
            const start = new Date(cursor),
              boundary = new Date(start);
            boundary.setHours(24, 0, 0, 0);
            const end = Math.min(segment.end, boundary.getTime()),
              k = key(start);
            byDay[k] = (byDay[k] || 0) + (end - cursor) / 1000;
            cursor = end;
          }
        }
      } else {
        const k = key(new Date(session.completedAt));
        byDay[k] = (byDay[k] || 0) + session.seconds;
      }
    }
    for (const [k, seconds] of Object.entries(byDay)) {
      if (k === today) day += seconds;
      if (k >= key(week) && k <= today) weekly += seconds;
      if (k.startsWith(month) && k <= today) monthly += seconds;
    }
    return { day, week: weekly, month: monthly, total, byDay, bySubject };
  }
  function settleTimer(timer, sessions, now) {
    if (!timer?.running || timer.endAt > now)
      return { timer, sessions, completed: false };
    const next = {
      ...timer,
      running: false,
      remaining: 0,
      endAt: null,
      finished: true,
    };
    const list = sessions.slice();
    if (timer.phase === "focus" && !list.some((s) => s.id === timer.id)) {
      const segments = [...(timer.segments || [])];
      if (timer.segmentStart && timer.endAt > timer.segmentStart)
        segments.push({ start: timer.segmentStart, end: timer.endAt });
      list.push({
        id: timer.id,
        subjectId: timer.subjectId || "",
        seconds: timer.duration,
        segments,
        completedAt: new Date(timer.endAt).toISOString(),
      });
    }
    return { timer: next, sessions: list, completed: true };
  }
  const remaining = (timer, now) =>
    timer.running
      ? Math.max(0, Math.ceil((timer.endAt - now) / 1000))
      : timer.remaining;
  function practice(p, today) {
    if (!p) return null;
    date(p.start);
    date(p.end);
    if (p.end < p.start) throw Error("La fecha final precede al inicio.");
    const scheduled = [];
    for (
      let d = date(p.start), i = 0;
      key(d) <= p.end;
      d.setDate(d.getDate() + 1), i++
    ) {
      if (i > 3660) throw Error("El periodo no puede superar diez años.");
      const k = key(d),
        exception = p.exceptions?.find((e) => e.date === k);
      if (exception ? exception.attend : p.weekdays.includes(d.getDay()))
        scheduled.push(k);
    }
    const elapsed = Math.max(
      0,
      Math.min(days(p.start, p.end) + 1, days(p.start, today)),
    );
    const logs = p.logs || [];
    return {
      scheduled,
      naturalTotal: days(p.start, p.end) + 1,
      naturalElapsed: elapsed,
      scheduledElapsed: scheduled.filter((d) => d < today).length,
      remaining: scheduled.filter((d) => d > today).length,
      next: scheduled.find((d) => d >= today) || null,
      hours: logs.reduce((a, l) => a + l.hours, 0),
      attended: logs.filter((l) => l.hours > 0).length,
    };
  }
  function reminders(state, today) {
    const settings = state.reminderSettings || {},
      lead = settings.leadDays ?? 3,
      dismissed = new Set(state.dismissedReminders || []),
      out = [];
    const add = (id, title, due) => {
      const distance = days(today, due);
      if (distance <= lead) out.push({ id, title, due, distance });
    };
    for (const t of state.tasks)
      if (!t.done && t.due)
        add(
          `task:${t.id}:${t.due}`,
          days(today, t.due) < 0
            ? "Entrega atrasada: " + t.name
            : days(today, t.due) === 1
              ? "Vence mañana: " + t.name
              : "Próxima entrega: " + t.name,
          t.due,
        );
    for (const e of state.exams)
      if (e.date >= today)
        add(`exam:${e.id}:${e.date}`, "Examen: " + e.name, e.date);
    if (state.practice) {
      const p = state.practice;
      if (p.start >= today)
        add(
          "practice:start:" + p.start,
          "Inicio de prácticas" + (p.company ? " · " + p.company : ""),
          p.start,
        );
      if (p.end >= today)
        add("practice:end:" + p.end, "Fin previsto de prácticas", p.end);
    }
    return out
      .filter((r) => !dismissed.has(r.id))
      .sort((a, b) => a.due.localeCompare(b.due));
  }
  function migrate(state, cache) {
    const s = structuredClone(state);
    s.version = 4;
    const courses = Array.isArray(cache?.courses)
        ? cache.courses.filter((c) => c && typeof c.name === "string")
        : [],
      activities = Array.isArray(cache?.tasks)
        ? cache.tasks.filter(
            (a) =>
              a &&
              typeof a.id === "string" &&
              (!a.name || typeof a.name === "string"),
          )
        : [];
    if (!s.importArchive && activities.length)
      s.importArchive = {
        courses,
        activities,
        converted: [],
        lastSync: cache.lastSync || null,
      };
    if (s.timetable)
      for (const schedule of s.timetable.schedules)
        for (const b of schedule.blocks) {
          if (!b.subjectId?.startsWith("gc:")) continue;
          const oldId = b.subjectId.slice(3),
            name =
              courses.find((c) => String(c.id) === oldId)?.name ||
              b.subjectName;
          if (!name) continue;
          let subject =
            s.subjects.find((x) => x.id === "legacy-subject:" + oldId) ||
            s.subjects.find((x) => x.name === name);
          if (!subject) {
            subject = {
              id: "legacy-subject:" + oldId,
              name,
              color: b.color || "#86b7ef",
            };
            s.subjects.push(subject);
          }
          b.subjectId = subject.id;
          b.subjectName = name;
        }
    return s;
  }
  function convertImport(state, id) {
    const next = structuredClone(state),
      archive = next.importArchive,
      item = archive?.activities.find((a) => a.id === id);
    if (!item) throw Error("Actividad no disponible.");
    archive.converted ??= [];
    if (
      archive.converted.includes(id) ||
      next.tasks.some((t) => t.importKey === id)
    )
      return next;
    const meta = item.limited ? item.previousMetadata : item;
    if (!meta?.name || /^Entrega propia|^Actividad sin título/.test(meta.name))
      throw Error(
        "Esta actividad no tiene un título útil conservado. Crea una tarea personal con la información que conozcas.",
      );
    const subjectName =
      item.courseName ||
      archive.courses.find((c) => String(c.id) === item.courseId)?.name ||
      "";
    const knownSubject =
      next.subjects.find((s) => s.id === "legacy-subject:" + item.courseId) ||
      next.subjects.find((s) => s.name === subjectName);
    if (
      next.tasks.some(
        (t) =>
          t.id === id ||
          (t.name === meta.name &&
            t.subject === (knownSubject?.name || subjectName) &&
            (t.due || "") === (meta.due || "")),
      )
    ) {
      archive.converted.push(id);
      return next;
    }
    if (!subjectName)
      throw Error(
        "La copia no conserva la asignatura. Crea una tarea local con la asignatura correcta.",
      );
    let subject = knownSubject;
    if (!subject) {
      subject = {
        id: "legacy-subject:" + item.courseId,
        name: subjectName,
        color: "#86b7ef",
      };
      next.subjects.push(subject);
    }
    next.tasks.push({
      id: "local-import:" + id,
      importKey: id,
      name: meta.name,
      subject: subject.name,
      due: meta.due || "",
      description: meta.description || "",
      done: Boolean(item.done),
      priority: "medium",
    });
    archive.converted.push(id);
    return next;
  }
  function validate(state) {
    for (const task of state.tasks || []) {
      if (typeof task.name !== "string" || typeof task.subject !== "string")
        throw Error("Tarea no válida.");
      if (task.due) date(task.due);
    }
    for (const exam of state.exams || []) {
      if (typeof exam.name !== "string" || typeof exam.subject !== "string")
        throw Error("Examen no válido.");
      date(exam.date);
    }
    if (state.importArchive) {
      const a = state.importArchive;
      if (!Array.isArray(a.activities) || !Array.isArray(a.courses))
        throw Error("Archivo de importación no válido.");
      for (const item of a.activities) {
        if (
          !item ||
          typeof item.id !== "string" ||
          (item.name !== undefined && typeof item.name !== "string") ||
          (item.courseName !== undefined && typeof item.courseName !== "string")
        )
          throw Error("Actividad archivada no válida.");
      }
      for (const c of a.courses)
        if (!c || typeof c.name !== "string")
          throw Error("Asignatura archivada no válida.");
    }

    for (const field of [
      "grades",
      "notes",
      "studySessions",
      "dismissedReminders",
    ])
      if (state[field] !== undefined && !Array.isArray(state[field]))
        throw Error("Formato de datos no válido: " + field);
    for (const field of ["grades", "notes", "studySessions"]) {
      const ids = new Set();
      for (const item of state[field] || []) {
        if (
          !item ||
          typeof item.id !== "string" ||
          !item.id ||
          ids.has(item.id)
        )
          throw Error("Registros duplicados o no válidos en " + field);
        ids.add(item.id);
      }
    }
    function validateSegments(list, expected, completedAt) {
      if (!Array.isArray(list) || list.length > 10000)
        throw Error("Intervalos de estudio no válidos.");
      let sum = 0,
        last = -Infinity;
      for (const segment of list) {
        if (
          !Number.isFinite(segment.start) ||
          !Number.isFinite(segment.end) ||
          segment.end <= segment.start ||
          segment.end - segment.start > 86400000 ||
          segment.start < last ||
          segment.end > completedAt
        )
          throw Error("Intervalo de estudio no válido.");
        sum += (segment.end - segment.start) / 1000;
        last = segment.end;
      }
      if (expected !== null && list.length && Math.abs(sum - expected) > 0.1)
        throw Error(
          "El tiempo de las sesiones no coincide con sus intervalos.",
        );
    }
    for (const session of state.studySessions || [])
      if (session.segments)
        validateSegments(
          session.segments,
          session.seconds,
          Date.parse(session.completedAt),
        );
    if (state.pomodoro?.segments)
      validateSegments(state.pomodoro.segments, null, Infinity);

    if (state.grades !== undefined) {
      if (!Array.isArray(state.grades)) throw Error("Notas no válidas.");
      for (const r of state.grades) {
        if (
          typeof r.id !== "string" ||
          typeof r.subjectId !== "string" ||
          !r.subjectId ||
          typeof r.term !== "string" ||
          !r.term ||
          typeof r.title !== "string" ||
          !r.title.trim()
        )
          throw Error("Registro de nota no válido.");
        date(r.date);
      }
    }
    const scale = state.gradeSettings?.scale ?? 10,
      target = state.gradeSettings?.target ?? 5;
    if (
      !Number.isFinite(scale) ||
      scale <= 0 ||
      !Number.isFinite(target) ||
      target < 0 ||
      target > scale
    )
      throw Error("Escala u objetivo no válido.");
    const groups = new Map();
    for (const r of state.grades || []) {
      const k = JSON.stringify([r.subjectId, r.term]);
      groups.set(k, [...(groups.get(k) || []), r]);
    }
    for (const rows of groups.values()) grades(rows, scale, target);
    for (const n of state.notes || []) {
      if (
        typeof n.id !== "string" ||
        typeof n.title !== "string" ||
        typeof n.content !== "string" ||
        typeof n.subjectId !== "string" ||
        n.content.length > 200000 ||
        typeof n.updatedAt !== "string" ||
        !Number.isFinite(Date.parse(n.updatedAt))
      )
        throw Error("Apunte no válido.");
    }
    for (const s of state.studySessions || [])
      if (
        typeof s.id !== "string" ||
        !Number.isFinite(s.seconds) ||
        s.seconds <= 0 ||
        s.seconds > 86400 ||
        typeof s.completedAt !== "string" ||
        !Number.isFinite(Date.parse(s.completedAt))
      )
        throw Error("Sesión de estudio no válida.");
    if (state.pomodoro) {
      const t = state.pomodoro;
      if (
        typeof t.id !== "string" ||
        !["focus", "short", "long"].includes(t.phase) ||
        !Number.isFinite(t.duration) ||
        t.duration <= 0 ||
        t.duration > 86400 ||
        !Number.isFinite(t.remaining) ||
        t.remaining < 0 ||
        t.remaining > t.duration ||
        (t.running && !Number.isFinite(t.endAt))
      )
        throw Error("Temporizador no válido.");
    }
    if (state.studySettings)
      for (const k of ["focus", "short", "long"])
        if (
          !Number.isFinite(state.studySettings[k]) ||
          state.studySettings[k] < 1 ||
          state.studySettings[k] > 180
        )
          throw Error("Duraciones de estudio no válidas.");
    if (
      state.reminderSettings &&
      (!Number.isInteger(state.reminderSettings.leadDays) ||
        state.reminderSettings.leadDays < 0 ||
        state.reminderSettings.leadDays > 60)
    )
      throw Error("Anticipación no válida.");
    if (state.practice) {
      const p = state.practice;
      if (
        p.amount !== undefined &&
        p.amount !== null &&
        (!Number.isInteger(p.amount) ||
          p.amount < 1 ||
          !["months", "weeks", "days"].includes(p.unit))
      )
        throw Error("Duración de prácticas no válida.");
      date(p.start);
      date(p.end);
      if (
        !Array.isArray(p.weekdays) ||
        !p.weekdays.length ||
        p.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
      )
        throw Error("Días de asistencia no válidos.");
      if (
        p.totalHours !== null &&
        p.totalHours !== undefined &&
        (!Number.isFinite(p.totalHours) || p.totalHours <= 0)
      )
        throw Error("Horas previstas no válidas.");
      if (p.timeStart || p.timeEnd) {
        if (
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.timeStart) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.timeEnd) ||
          p.timeEnd <= p.timeStart
        )
          throw Error("Horario de prácticas no válido.");
      }
      const dates = new Set();
      for (const l of p.logs || []) {
        date(l.date);
        if (
          l.date < p.start ||
          l.date > p.end ||
          dates.has(l.date) ||
          !Number.isFinite(l.hours) ||
          l.hours < 0 ||
          l.hours > 24
        )
          throw Error("Registro de asistencia no válido.");
        dates.add(l.date);
      }
      const exceptions = new Set();
      for (const e of p.exceptions || []) {
        date(e.date);
        if (
          e.date < p.start ||
          e.date > p.end ||
          typeof e.attend !== "boolean" ||
          exceptions.has(e.date)
        )
          throw Error("Excepción no válida.");
        exceptions.add(e.date);
      }
      practice(p, p.start);
    }
    return state;
  }
  const api = {
    key,
    date,
    days,
    addDuration,
    grades,
    studyStats,
    settleTimer,
    remaining,
    practice,
    reminders,
    migrate,
    convertImport,
    validate,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.V4 = api;
})(globalThis);
