const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const TT = require("../timetable.js");
const context = vm.createContext({});
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "../academic-calendar.js"), "utf8") +
    "\nglobalThis.day = academicDay;",
  context,
);
const localKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const off = (d) => context.day(localKey(d)).nonTeaching;
const block = (id, start, end, type = "class") => ({
  id,
  day: 1,
  type,
  subjectId: "physics",
  subjectName: "Física",
  start,
  end,
  color: "#aabbcc",
  room: "A1",
  teacher: "Ana",
});
test("empty by default, immutable edits, valid times and no overlaps", () => {
  const state = { tasks: [{ name: "preserve" }] };
  const before = JSON.stringify(state);
  assert.equal(TT.active(state).blocks.length, 0);
  assert.equal(JSON.stringify(state), before);
  const initial = TT.defaults();
  const table = TT.upsert(initial, block("a", "08:30", "09:30"));
  assert.equal(initial.schedules[0].blocks.length, 0);
  assert.equal(table.schedules[0].blocks.length, 1);
  for (const invalid of [
    block("x", "09:00", "10:00"),
    block("x", "10:00", "09:00"),
    { ...block("x", "10:00", "11:00"), day: 6 },
    { ...block("x", "10:00", "11:00"), color: "red" },
    { ...block("x", "10:00", "11:00"), subjectId: "" },
  ])
    assert.throws(() => TT.upsert(table, invalid));
  assert.equal(
    TT.upsert(table, block("b", "09:30", "10:00", "break")).schedules[0].blocks
      .length,
    2,
  );
});
test("copy between days makes independent IDs and rejects overlapping copies", () => {
  const table = TT.upsert(TT.defaults(), block("a", "08:30", "09:30"));
  const copied = TT.copyDay(table, 1, 2, () => "copy");
  assert.equal(copied.schedules[0].blocks.length, 2);
  assert.equal(copied.schedules[0].blocks[1].day, 2);
  assert.equal(table.schedules[0].blocks.length, 1);
  assert.throws(() => TT.copyDay(copied, 1, 2, () => "copy-again"));
  assert.throws(() => TT.copyDay(table, 1, 1, () => "bad"));
});
test("current class and next class use exact boundaries and skip breaks and official holidays", () => {
  let table = TT.defaults();
  for (const b of [
    block("a", "08:30", "09:30"),
    block("break", "09:30", "09:45", "break"),
    block("free", "09:45", "10:00", "free"),
    block("b", "10:00", "11:00"),
  ])
    table = TT.upsert(table, b);
  const s = table.schedules[0];
  assert.equal(
    TT.status(s, new Date("2026-11-16T08:45:00"), off).current.id,
    "a",
  );
  assert.equal(
    TT.status(s, new Date("2026-11-16T09:30:00"), off).current.id,
    "break",
  );
  assert.equal(
    TT.status(s, new Date("2026-11-16T08:45:00"), off).next.block.id,
    "b",
  );
  assert.equal(TT.status(s, new Date("2026-11-15T08:45:00"), off).off, true);
  const christmas = TT.status(s, new Date("2026-12-28T08:45:00"), off);
  assert.equal(christmas.off, true);
  assert.equal(christmas.current, null);
  assert.equal(localKey(christmas.next.date), "2027-01-11");
  const carnival = TT.status(s, new Date("2027-02-08T08:45:00"), off);
  assert.equal(carnival.off, true);
  assert.equal(localKey(carnival.next.date), "2027-02-15");
});
test("schedule profiles round-trip in JSON and malformed imports are rejected", () => {
  const table = TT.upsert(TT.defaults(), block("a", "08:30", "09:30"));
  table.schedules.push({ id: "other", name: "Horario alterno", blocks: [] });
  table.activeId = "other";
  assert.deepEqual(TT.validate(JSON.parse(JSON.stringify(table))), table);
  assert.equal(TT.active({ timetable: table }).blocks.length, 0);
  assert.throws(() => TT.validate({ ...table, activeId: "missing" }));
});
