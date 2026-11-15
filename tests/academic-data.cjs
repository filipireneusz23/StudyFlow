// Expectations transcribed from the DOE PDFs cited in docs/calendario-2026-2027.md.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const context = vm.createContext({});
vm.runInContext(
  fs.readFileSync(
    require("node:path").join(__dirname, "../academic-calendar.js"),
    "utf8",
  ) +
    "\n globalThis.calendar = ACADEMIC_CALENDAR; globalThis.day = academicDay;",
  context,
);
const { calendar, day } = context;
assert.equal(calendar.verified, true);
assert.equal(calendar.teachingStart, "2026-09-10");
assert.equal(calendar.teachingEnd, "2027-06-04");
const holidays = [
  "2026-09-08",
  "2026-10-12",
  "2026-11-01",
  "2026-11-02",
  "2026-12-06",
  "2026-12-07",
  "2026-12-08",
  "2026-12-25",
  "2027-01-01",
  "2027-01-06",
  "2027-01-29",
  "2027-03-25",
  "2027-03-26",
  "2027-05-01",
  "2027-07-23",
  "2027-07-26",
  "2027-08-15",
];
const vacations = [
  ["2026-12-23", "2027-01-07"],
  ["2027-02-08", "2027-02-09"],
  ["2027-03-22", "2027-03-29"],
];
assert.deepEqual(
  Array.from(
    calendar.events.filter((e) => e.type === "holiday"),
    (e) => e.start,
  ).sort(),
  holidays.slice().sort(),
);
assert.deepEqual(
  Array.from(
    calendar.events.filter((e) => e.type === "vacation"),
    (e) => [e.start, e.end],
  ),
  vacations,
);
assert.equal(calendar.events.filter((e) => e.type === "milestone").length, 2);
assert.equal(calendar.events.filter((e) => e.type === "break").length, 2);
assert.equal(calendar.events.length, 24);
const unique = new Set();
for (const event of calendar.events) {
  assert(event.start <= event.end);
  assert(
    event.start >= calendar.courseStart && event.end <= calendar.courseEnd,
  );
  assert(
    Number.isInteger(event.source) &&
      calendar.sources[event.source]?.startsWith("https://doe.juntaex.es/"),
  );
  const id = [event.start, event.end, event.name].join("|");
  assert(!unique.has(id));
  unique.add(id);
  assert.equal(event.nonTeaching, event.type !== "milestone");
  assert(event.description.length > 20);
}
// Check every date, not just the endpoints of a holiday range.
for (
  let d = new Date("2026-09-01T12:00:00Z");
  d <= new Date("2027-08-31T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1)
) {
  const date = d.toISOString().slice(0, 10),
    weekend = [0, 6].includes(d.getUTCDay());
  const expected =
    weekend ||
    holidays.includes(date) ||
    vacations.some(([start, end]) => date >= start && date <= end) ||
    date < "2026-09-10" ||
    date > "2027-06-04";
  assert.equal(day(date).nonTeaching, expected, date);
}
for (const date of [
  "2026-09-10",
  "2026-11-23",
  "2026-12-04",
  "2026-12-22",
  "2027-01-08",
  "2027-02-10",
  "2027-02-11",
  "2027-03-19",
  "2027-03-30",
  "2027-06-04",
])
  assert.equal(day(date).nonTeaching, false, date);
// The annual decree moves the August Sunday rest to October 11, not August 16.
assert(!day("2027-08-16").events.some((e) => e.type === "holiday"));
assert.equal(day("2027-10-11").events.length, 0); // next school year is out of scope
assert.equal(day("2026-11-23").events.length, 0); // Santa Cecilia is conservatories only
console.log(
  "PASS: complete official date table, 365 daily classifications, exclusions, inclusive periods, course boundaries, source links, uniqueness.",
);
