/* Verified against the official DOE PDFs. See docs/calendario-2026-2027.md.
 * Academic records never enter personal localStorage or the user's exams/tasks.
 */
const ACADEMIC_CALENDAR = Object.freeze({
  course: "2026/2027",
  location: "Cabezuela del Valle (Cáceres)",
  education: "FP Grado Medio · régimen general",
  verified: true,
  verifiedOn: "2026-11-15",
  courseStart: "2026-09-01",
  courseEnd: "2027-08-31",
  teachingStart: "2026-09-10",
  teachingEnd: "2027-06-04",
  sources: [
    "https://doe.juntaex.es/pdfs/doe/2026/1160o/26061567.pdf",
    "https://doe.juntaex.es/pdfs/doe/2026/2070o/26062650.pdf",
    "https://doe.juntaex.es/pdfs/doe/2026/1080o/26040142.pdf",
    "https://doe.juntaex.es/pdfs/doe/2025/940o/25040070.pdf",
  ],
  events: Object.freeze(
    [
      {
        start: "2026-09-01",
        end: "2026-09-09",
        name: "Antes del inicio de clases",
        description:
          "Preparación y organización del curso. Las clases ordinarias de FP Grado Medio comienzan el 10 de septiembre (resuelvo tercero).",
        source: 0,
        type: "break",
        nonTeaching: true,
      },
      {
        start: "2026-09-08",
        end: "2026-09-08",
        name: "Día de Extremadura",
        description: "Festividad autonómica, recogida en el resuelvo sexto.3.",
        source: 0,
        type: "holiday",
        nonTeaching: true,
      },
      {
        start: "2026-09-10",
        end: "2026-09-10",
        name: "Inicio de clases de FP Grado Medio",
        description:
          "Inicio de las actividades lectivas de ciclos formativos de Grado Medio y Superior: 10 de septiembre de 2026 (resuelvo tercero, tabla).",
        source: 0,
        type: "milestone",
        nonTeaching: false,
      },
      {
        start: "2026-10-12",
        end: "2026-10-12",
        name: "Fiesta Nacional de España",
        description: "Festivo nacional, recogido en el resuelvo sexto.3.",
        source: 0,
        type: "holiday",
        nonTeaching: true,
      },
      {
        start: "2026-11-01",
        end: "2026-11-01",
        name: "Todos los Santos",
        description: "Festividad del 1 de noviembre; coincide con domingo.",
        source: 0,
        type: "holiday",
        nonTeaching: true,
      },
      {
        start: "2026-11-02",
        end: "2026-11-02",
        name: "Descanso de Todos los Santos",
        description:
          "Lunes siguiente al día de Todos los Santos, expresamente no lectivo en el resuelvo sexto.3.",
        source: 0,
        type: "holiday",
        nonTeaching: true,
      },
      {
        start: "2026-12-06",
        end: "2026-12-06",
        name: "Día de la Constitución Española",
        description: "Festividad del 6 de diciembre; coincide con domingo.",
        source: 0,
        type: "holiday",
        nonTeaching: true,
      },
      {
        start: "2026-12-07",
        end: "2026-12-07",
        name: "Descanso de la Constitución",
        description:
          "Lunes siguiente al Día de la Constitución, expresamente no lectivo en el resuelvo sexto.3.",
        source: 0,
        type: "holiday",
        nonTeaching: true,
      },
      {
        start: "2026-12-08",
        end: "2026-12-08",
        name: "Inmaculada Concepción",
        description: "Festivo, recogido en el resuelvo sexto.3.",
        source: 0,
        type: "holiday",
        nonTeaching: true,
      },
      {
        start: "2026-12-23",
        end: "2027-01-07",
        name: "Vacaciones de Navidad",
        description:
          "Del 23 de diciembre de 2026 al 7 de enero de 2027, ambos incluidos (resuelvo sexto.2).",
        source: 0,
        type: "vacation",
        nonTeaching: true,
      },
      {
        start: "2026-12-25",
        end: "2026-12-25",
        name: "Natividad del Señor",
        description:
          "Festivo del 25 de diciembre de 2026 (Decreto 40/2025, artículo 1). Coincide con las vacaciones de Navidad.",
        source: 3,
        type: "holiday",
        nonTeaching: true,
      },
      {
        start: "2027-01-01",
        end: "2027-01-01",
        name: "Año Nuevo",
        description:
          "Festivo autonómico/nacional, Decreto 119/2026, artículo 1.",
        source: 2,
        type: "holiday",
        nonTeaching: true,
      },
      {
        start: "2027-01-06",
        end: "2027-01-06",
        name: "Epifanía del Señor",
        description:
          "Festivo, recogido en el resuelvo sexto.3; también está dentro de las vacaciones de Navidad.",
        source: 0,
        type: "holiday",
        nonTeaching: true,
      },
      {
        start: "2027-01-29",
        end: "2027-01-29",
        name: "Día del Docente",
        description:
          "Día no lectivo para las enseñanzas de régimen general, incluida FP. La excepción de conservatorios no se aplica a este calendario (resuelvo sexto.3).",
        source: 0,
        type: "holiday",
        nonTeaching: true,
      },
      {
        start: "2027-02-08",
        end: "2027-02-09",
        name: "Carnaval",
        description:
          "8 y 9 de febrero de 2027: días no lectivos de Carnavales (resuelvo sexto.3).",
        source: 0,
        type: "vacation",
        nonTeaching: true,
      },
      {
        start: "2027-03-22",
        end: "2027-03-29",
        name: "Vacaciones de Semana Santa",
        description:
          "Del 22 al 29 de marzo de 2027, ambos incluidos (resuelvo sexto.2).",
        source: 0,
        type: "vacation",
        nonTeaching: true,
      },
      {
        start: "2027-03-25",
        end: "2027-03-25",
        name: "Jueves Santo",
        description:
          "Festivo del 25 de marzo de 2027, Decreto 119/2026, artículo 1; coincide con Semana Santa.",
        source: 2,
        type: "holiday",
        nonTeaching: true,
      },
      {
        start: "2027-03-26",
        end: "2027-03-26",
        name: "Viernes Santo",
        description:
          "Festivo del 26 de marzo de 2027, Decreto 119/2026, artículo 1; coincide con Semana Santa.",
        source: 2,
        type: "holiday",
        nonTeaching: true,
      },
      {
        start: "2027-05-01",
        end: "2027-05-01",
        name: "Fiesta del Trabajo",
        description:
          "Festivo, recogido en el resuelvo sexto.3; coincide con sábado.",
        source: 0,
        type: "holiday",
        nonTeaching: true,
      },
      {
        start: "2027-06-04",
        end: "2027-06-04",
        name: "Fin de clases de FP Grado Medio",
        description:
          "Fin de las actividades lectivas de los ciclos formativos de Grado Medio y Superior (resuelvo tercero, tabla). No equivale al fin de evaluaciones o de la actividad del centro.",
        source: 0,
        type: "milestone",
        nonTeaching: false,
      },
      {
        start: "2027-06-05",
        end: "2027-08-31",
        name: "Sin clases ordinarias de FP",
        description:
          "Las actividades lectivas ordinarias de FP Grado Medio terminan el 4 de junio. Puede haber evaluaciones, recuperación, formación en empresa/FCT o convocatorias conforme al calendario del centro. La resolución fija entrega de calificaciones ordinarias el 10 de junio y extraordinarias el 21 de junio. El curso administrativo acaba el 31 de agosto (resuelvo tercero).",
        source: 0,
        type: "break",
        nonTeaching: true,
      },
      {
        start: "2027-07-23",
        end: "2027-07-23",
        name: "Festivo local de Cabezuela del Valle",
        description:
          "Fiesta local de Cabezuela del Valle (Cáceres), confirmada en el anexo de la Resolución de 15 de octubre de 2026, DOE 207, página 44625. No se asigna un nombre de celebración ni un día sustitutivo sin confirmación del centro.",
        source: 1,
        type: "holiday",
        nonTeaching: true,
      },
      {
        start: "2027-07-26",
        end: "2027-07-26",
        name: "Festivo local de Cabezuela del Valle",
        description:
          "Fiesta local de Cabezuela del Valle (Cáceres), confirmada en el anexo de la Resolución de 15 de octubre de 2026, DOE 207, página 44625. No se asigna un nombre de celebración ni un día sustitutivo sin confirmación del centro.",
        source: 1,
        type: "holiday",
        nonTeaching: true,
      },
      {
        start: "2027-08-15",
        end: "2027-08-15",
        name: "Asunción de la Virgen",
        description:
          "Festividad del 15 de agosto de 2027, domingo. Su descanso se traslada al 11 de octubre de 2027, fuera de este curso; no al 16 de agosto (Decreto 119/2026, artículos 1 y 2).",
        source: 2,
        type: "holiday",
        nonTeaching: true,
      },
    ].map((event) => Object.freeze(event)),
  ),
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
    inCourse:
      date >= ACADEMIC_CALENDAR.courseStart &&
      date <= ACADEMIC_CALENDAR.courseEnd,
    nonTeaching: weekend || events.some((event) => event.nonTeaching),
  };
}
