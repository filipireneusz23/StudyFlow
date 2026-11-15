/* Academic dates are separate from personal localStorage records.
 * Do not populate dates until the official documents have been read and checked.
 */
const ACADEMIC_CALENDAR = Object.freeze({
  course: "2026/2027",
  location: "Cabezuela del Valle (Cáceres)",
  education: "FP Grado Medio",
  verified: false,
  sources: [
    "https://doe.juntaex.es/otrosFormatos/html.php?anio=2026&doe=1160o&xml=2026061567",
    "https://doe.juntaex.es/otrosFormatos/html.php?anio=2026&doe=2070o&xml=2026062650",
  ],
  events: [],
});
function academicDay(date) {
  const weekday = new Date(date + "T12:00:00").getDay();
  const events = ACADEMIC_CALENDAR.events.filter(
    (event) => date >= event.start && date <= event.end,
  );
  const weekend = weekday === 0 || weekday === 6;
  return {
    events,
    weekend,
    nonTeaching: weekend || events.some((event) => event.nonTeaching),
  };
}
