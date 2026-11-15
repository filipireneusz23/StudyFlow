/* Personal weekly schedules; never inferred from Classroom or the school calendar. */
(function (root) {
  "use strict";
  const minutes = (time) => {
    if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
      throw Error("Hora no válida.");
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };
  const defaults = () => ({
    activeId: "default",
    schedules: [{ id: "default", name: "Horario principal", blocks: [] }],
  });
  const get = (state) => state.timetable || defaults();
  function validateBlock(block) {
    if (
      !block ||
      typeof block.id !== "string" ||
      !block.id ||
      !Number.isInteger(block.day) ||
      block.day < 1 ||
      block.day > 5 ||
      !["class", "break", "free"].includes(block.type)
    )
      throw Error("Bloque del horario no válido.");
    if (minutes(block.end) <= minutes(block.start))
      throw Error("La hora de fin debe ser posterior a la de inicio.");
    if (!/^#[a-f\d]{6}$/i.test(block.color))
      throw Error("Color del bloque no válido.");
    if (
      block.type === "class" &&
      (typeof block.subjectId !== "string" || !block.subjectId)
    )
      throw Error("Elige una asignatura para la clase.");
    for (const key of ["room", "teacher", "subjectName"])
      if (
        block[key] !== undefined &&
        (typeof block[key] !== "string" || block[key].length > 120)
      )
        throw Error("Texto del bloque no válido.");
  }
  function validate(table) {
    if (
      !table ||
      !Array.isArray(table.schedules) ||
      !table.schedules.length ||
      !table.schedules.some((s) => s.id === table.activeId)
    )
      throw Error("Horario no válido.");
    const ids = new Set();
    for (const schedule of table.schedules) {
      if (
        !schedule ||
        typeof schedule.id !== "string" ||
        !schedule.id ||
        ids.has(schedule.id) ||
        typeof schedule.name !== "string" ||
        !schedule.name.trim() ||
        schedule.name.length > 80 ||
        !Array.isArray(schedule.blocks)
      )
        throw Error("Perfil de horario no válido.");
      ids.add(schedule.id);
      const blocks = new Set();
      for (const block of schedule.blocks) {
        validateBlock(block);
        if (blocks.has(block.id)) throw Error("Hay bloques duplicados.");
        blocks.add(block.id);
      }
      for (let day = 1; day <= 5; day++) {
        const list = schedule.blocks
          .filter((b) => b.day === day)
          .sort((a, b) => minutes(a.start) - minutes(b.start));
        for (let i = 1; i < list.length; i++)
          if (minutes(list[i].start) < minutes(list[i - 1].end))
            throw Error("Los bloques de un mismo día no pueden solaparse.");
      }
    }
    return table;
  }
  const active = (state) => {
    const t = get(state);
    return t.schedules.find((s) => s.id === t.activeId);
  };
  const onDay = (schedule, day) =>
    schedule.blocks
      .filter((b) => b.day === day)
      .slice()
      .sort((a, b) => minutes(a.start) - minutes(b.start));
  function status(schedule, now, isOff) {
    const off = isOff(now),
      minute = now.getHours() * 60 + now.getMinutes();
    const blocks = onDay(schedule, now.getDay());
    const current = !off
      ? blocks.find(
          (b) => minutes(b.start) <= minute && minutes(b.end) > minute,
        ) || null
      : null;
    let next = null;
    for (let i = 0; i <= 370 && !next; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      if (isOff(d)) continue;
      const found = onDay(schedule, d.getDay()).find(
        (b) => b.type === "class" && (i > 0 || minutes(b.start) > minute),
      );
      if (found) next = { block: found, date: d };
    }
    return { off, blocks, current, next };
  }
  function upsert(table, block) {
    const next = structuredClone(table),
      schedule = next.schedules.find((s) => s.id === next.activeId);
    const index = schedule.blocks.findIndex((b) => b.id === block.id);
    if (index < 0) schedule.blocks.push(block);
    else schedule.blocks[index] = block;
    return validate(next);
  }
  function copyDay(table, from, to, idFactory) {
    if (from === to) throw Error("Elige dos días distintos.");
    const next = structuredClone(table),
      schedule = next.schedules.find((s) => s.id === next.activeId);
    schedule.blocks.push(
      ...onDay(schedule, from).map((b) => ({ ...b, id: idFactory(), day: to })),
    );
    return validate(next);
  }
  const api = {
    minutes,
    defaults,
    get,
    validate,
    active,
    onDay,
    status,
    upsert,
    copyDay,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Timetable = api;
})(globalThis);
