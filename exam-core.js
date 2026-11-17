/* Exam presentation models reuse the task deadline engine. */
(function (root) {
  const V =
    typeof module !== "undefined" && module.exports
      ? require("./v4-core.js")
      : root.V4;
  function urgency(exam, now = new Date()) {
    const u = V.taskUrgency({ due: exam.date, dueTime: exam.time }, now);
    return {
      ...u,
      text:
        u.level === "overdue"
          ? "Examen pasado"
          : u.level === "today"
            ? "Hoy"
            : u.level === "tomorrow"
              ? "Mañana"
              : u.text,
    };
  }
  function sorted(exams, order = "near", filter = "all", now = new Date()) {
    const group = (e) =>
      !e.date ? 2 : urgency(e, now).level === "overdue" ? 1 : 0;
    return exams
      .map((exam, index) => ({ exam, index }))
      .filter(
        ({ exam: e }) =>
          filter === "all" ||
          (filter === "past"
            ? group(e) === 1
            : filter === "undated"
              ? group(e) === 2
              : group(e) === 0),
      )
      .sort((a, b) => {
        const x = a.exam,
          y = b.exam;
        const byDate = () =>
          `${x.date || "9999"}T${x.time || "23:59"}`.localeCompare(
            `${y.date || "9999"}T${y.time || "23:59"}`,
          );
        if (order === "subject")
          return (
            x.subject.localeCompare(y.subject, "es") ||
            group(x) - group(y) ||
            byDate() ||
            a.index - b.index
          );
        if (order === "created")
          return (
            (y.createdAt ? Date.parse(y.createdAt) : -Infinity) -
              (x.createdAt ? Date.parse(x.createdAt) : -Infinity) ||
            a.index - b.index
          );
        return (
          group(x) - group(y) ||
          (group(x) === 2
            ? 0
            : order === "far" || group(x) === 1
              ? -byDate()
              : byDate()) ||
          a.index - b.index
        );
      })
      .map((x) => x.exam);
  }
  function prompt(exam, mode) {
    const notes = exam.notes?.trim();
    const names = (exam.pdfs || []).map((x) => x.name);
    const context = notes
      ? `\n\nMis indicaciones para estudiar son: ${notes}.`
      : "";
    const files = names.length
      ? `\n\nTemarios que adjuntaré manualmente: ${names.join(", ")}.`
      : "";
    const start = `Examen: ${exam.name}. Asignatura: ${exam.subject}.`;
    const templates = {
      summary: `Voy a adjuntar el PDF del temario de mi examen de ${exam.subject}, titulado ${exam.name}.${context}\n\nQuiero que analices el documento completo y prepares un resumen claro y bien organizado para estudiar.\n\nDivide el resumen por temas y apartados, explica los conceptos importantes con palabras sencillas, conserva las definiciones relevantes y utiliza ejemplos cuando ayuden a entender el contenido.\n\nDestaca los conceptos importantes para memorizar y termina con un repaso de los puntos clave.\n\nBasa el contenido en el PDF adjunto. No inventes información. Si alguna página no se puede leer, avísame.\n\nUtiliza un lenguaje adecuado para FP de Grado Medio`,
      quiz: `Analiza el PDF adjunto del examen ${exam.name}, de la asignatura ${exam.subject}.${context}\n\nGenera 20 preguntas tipo test basadas en el temario, con cuatro opciones por pregunta.\n\nAl final, incluye las respuestas correctas y una breve explicación de cada una.\n\nNo inventes información que no aparezca en el documento`,
      mock: `Quiero practicar para mi examen ${exam.name}, de ${exam.subject}, utilizando exclusivamente el PDF adjunto.${context}\n\nPrepara un examen de práctica con preguntas variadas y dificultad progresiva.\n\nNo muestres las soluciones hasta que responda.\n\nDespués, corrige mis respuestas, explica mis errores y dame una calificación orientativa de 0 a 10`,
      flashcards: `Analiza el PDF adjunto del examen ${exam.name}, de ${exam.subject}.${context}\n\nCrea tarjetas de estudio con una pregunta en el anverso y una respuesta breve y precisa en el reverso.\n\nOrganízalas por temas y prioriza definiciones, conceptos importantes y contenidos que debo memorizar.\n\nNo añadas información que no aparezca en el documento`,
    };
    if (!Object.hasOwn(templates, mode))
      throw Error("Opción de estudio no válida.");
    return `${start}\n\n${templates[mode]}${files}`;
  }
  const api = { urgency, sorted, prompt };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Exams = api;
})(globalThis);
