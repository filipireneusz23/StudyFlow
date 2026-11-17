/* Local exam workflow. No API integrations. */
let examOrder = "near",
  examFilter = "all",
  examDraft = null;
function examUrgencyAttributes(exam) {
  const u = Exams.urgency(exam);
  return `data-urgency-exam="${esc(exam.id)}" data-urgency="${u.level}" style="--urgency:${u.color}"`;
}
function examUrgencyBadge(exam) {
  return `<span class="urgency-badge">${Exams.urgency(exam).text}</span>`;
}
function refreshExamUrgency() {
  const lists = [
    ["examList", () => Exams.sorted(state.exams, examOrder, examFilter)],
    [
      "dashboardExams",
      () => Exams.sorted(state.exams, "near", "upcoming").slice(0, 3),
    ],
  ];
  for (const [id, items] of lists) {
    const node = document.getElementById(id);
    if (!node) continue;
    const exams = items();
    const current = [...node.querySelectorAll("[data-exam-id]")].map(
      (e) => e.dataset.examId,
    );
    if (
      JSON.stringify(current) !== JSON.stringify(exams.map((e) => String(e.id)))
    )
      node.innerHTML = examRows(exams);
  }

  for (const node of document.querySelectorAll("[data-urgency-exam]")) {
    const e = state.exams.find(
      (e) => String(e.id) === node.dataset.urgencyExam,
    );
    if (!e) continue;
    const u = Exams.urgency(e);
    node.dataset.urgency = u.level;
    node.style.setProperty("--urgency", u.color);
    const badge = node.querySelector(".urgency-badge");
    if (badge) badge.textContent = u.text;
  }
}
function examRows(exams) {
  return exams.length
    ? exams
        .map(
          (e) =>
            `<div class="exam-row urgency-item" data-exam-id="${esc(e.id)}" ${examUrgencyAttributes(e)}><div class="date-box">${e.date ? Number(e.date.slice(8)) : "—"}<small>${e.date ? esc(new Intl.DateTimeFormat("es-ES", { month: "short" }).format(new Date(e.date + "T12:00:00")) + " " + e.date.slice(0, 4)) : "Sin fecha"}</small></div><div class="item-body"><div class="item-title">${esc(e.name)}</div><div class="item-meta">${esc(e.subject)}${e.time ? " · " + esc(e.time) : ""}</div>${examUrgencyBadge(e)}</div><div class="row-actions"><button data-exam-details="${esc(e.id)}">Detalles</button><button data-edit="${esc(e.id)}" data-kind="exam">Editar</button><button class="study-exam-button" data-study-exam="${esc(e.id)}">Estudiar con ChatGPT</button><button data-delete="${esc(e.id)}" data-kind="exam" aria-label="Eliminar ${esc(e.name)}">×</button></div></div>`,
        )
        .join("")
    : '<div class="empty">No hay exámenes en esta vista.</div>';
}
function examsView() {
  return (
    head(
      "Exámenes",
      "Tus temarios y tu preparación, en un solo lugar.",
      '<button data-action="new-exam">＋ Examen</button>',
    ) +
    `<section class="card"><div class="exam-controls"><label>Mostrar<select id="examFilter">${[
      ["all", "Todos"],
      ["upcoming", "Próximos"],
      ["past", "Pasados"],
      ["undated", "Sin fecha"],
    ]
      .map(
        ([v, n]) =>
          `<option value="${v}" ${v === examFilter ? "selected" : ""}>${n}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Ordenar exámenes<select id="examOrder">${[
      ["near", "Más próximos primero"],
      ["far", "Más lejanos primero"],
      ["subject", "Por asignatura"],
      ["created", "Por fecha de creación"],
    ]
      .map(
        ([v, n]) =>
          `<option value="${v}" ${v === examOrder ? "selected" : ""}>${n}</option>`,
      )
      .join(
        "",
      )}</select></label></div><p class="muted">Por fecha: próximos primero, pasados en su grupo y sin fecha al final. Por creación: recientes primero; los antiguos sin fecha de creación mantienen su orden.</p><div id="examList">${examRows(Exams.sorted(state.exams, examOrder, examFilter))}</div></section>`
  );
}
function prepareExamExtras(kind, item) {
  document.getElementById("examExtras").hidden = kind !== "exam";
  document.getElementById("examPdfInput").disabled = kind !== "exam";
  examDraft =
    kind === "exam"
      ? {
          id: String(item?.id || uid()),
          pdfs: structuredClone(item?.pdfs || []),
          additions: [],
          busy: false,
        }
      : null;
  document.getElementById("examFileMessage").textContent = "";
  renderExamDraft();
}
const pdfSize = (n) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${(n / 1024).toFixed(1)} KB`;
function pdfRows(pdfs, draft = false) {
  return pdfs.length
    ? pdfs
        .map(
          (p) =>
            `<div class="pdf-row"><div><strong>${esc(p.name)}</strong><small>${pdfSize(p.size)}</small></div><div class="actions"><button type="button" class="secondary" data-pdf-open="${esc(p.id)}">Abrir PDF</button><button type="button" class="secondary" data-pdf-download="${esc(p.id)}">Descargar PDF</button>${draft ? `<button type="button" class="secondary" data-pdf-remove="${esc(p.id)}">Eliminar PDF</button>` : ""}</div></div>`,
        )
        .join("")
    : '<p class="muted">Sin temarios adjuntos.</p>';
}
function renderExamDraft() {
  document.getElementById("examPdfDraft").innerHTML = pdfRows(
    examDraft?.pdfs || [],
    true,
  );
}
async function saveExamChanges(fields, id) {
  const draft = examDraft;
  if (!draft || draft.busy)
    throw Error("Espera a que termine la lectura de los PDF.");
  const next = structuredClone(state),
    old = next.exams.find((e) => String(e.id) === id),
    exam = {
      ...(old || {}),
      ...fields,
      id: old?.id || draft.id,
      pdfs: structuredClone(draft.pdfs),
    };
  if (!old) exam.createdAt = new Date().toISOString();
  if (old) Object.assign(old, exam);
  else next.exams.push(exam);
  V4.validate(next);
  const additions = draft.additions.filter((a) =>
      exam.pdfs.some((p) => p.id === a.id),
    ),
    remove = (state.exams.find((e) => String(e.id) === id)?.pdfs || [])
      .filter((p) => !exam.pdfs.some((x) => p.id === x.id))
      .map((p) => p.id);
  if (additions.length) await ExamFiles.apply(additions);
  if (!commit(next)) {
    if (additions.length)
      try {
        await ExamFiles.apply(
          [],
          additions.map((a) => a.id),
        );
      } catch {}
    return false;
  }
  if (remove.length)
    try {
      await ExamFiles.apply([], remove);
    } catch (error) {
      return (
        "Examen guardado, pero no se pudo liberar el archivo retirado: " +
        error.message
      );
    }
  return true;
}
function openExamDetails(id, study = false) {
  const exam = state.exams.find((e) => String(e.id) === id);
  if (!exam) return;
  const dialog = document.getElementById("examDetails");
  dialog.dataset.examId = id;
  document.getElementById("examDetailsTitle").textContent = exam.name;
  document.getElementById("examDetailsMeta").textContent =
    `${exam.subject} · ${exam.date ? formatDate(exam.date) : "Sin fecha"}${exam.time ? " · " + exam.time : ""}`;
  document.getElementById("examDetailsUrgency").innerHTML =
    `<div class="exam-detail-indicator urgency-item" ${examUrgencyAttributes(exam)}>${examUrgencyBadge(exam)}</div>`;
  document.getElementById("examDetailsNotes").textContent =
    (exam.notes ?? exam.description) || "Sin notas.";
  document.getElementById("examDetailsLinks").innerHTML =
    taskLinksHTML(exam) || '<p class="muted">Sin enlaces guardados.</p>';
  document.getElementById("examDetailsPdfs").innerHTML = pdfRows(
    exam.pdfs || [],
  );
  document.getElementById("examStudy").hidden = !study;
  document.getElementById("examPrompt").value = "";
  document.getElementById("examPromptMessage").textContent = "";
  dialog.showModal();
}
document
  .getElementById("examPdfInput")
  .addEventListener("change", async (event) => {
    const draft = examDraft;
    if (!draft) return;
    const files = [...event.target.files];
    event.target.value = "";
    if (draft.busy) {
      notify("Espera a que termine la lectura de los PDF.");
      return;
    }
    if (draft.pdfs.length + files.length > ExamFiles.MAX_COUNT) {
      notify("Se permiten hasta 10 PDF por examen.");
      return;
    }
    draft.busy = true;
    document.getElementById("examFileMessage").textContent = "Comprobando PDF…";
    try {
      const records = await ExamFiles.prepare(files, draft.id);
      if (examDraft !== draft) return;
      draft.additions.push(...records);
      draft.pdfs.push(...records.map(ExamFiles.meta));
      renderExamDraft();
      document.getElementById("examFileMessage").textContent =
        "PDF preparados. Pulsa Guardar para conservarlos con el examen.";
    } catch (error) {
      if (examDraft === draft) {
        document.getElementById("examFileMessage").textContent = error.message;
        notify(error.message);
      }
    } finally {
      draft.busy = false;
    }
  });
document.getElementById("closeExamDetails").onclick = () =>
  document.getElementById("examDetails").close();
document.getElementById("editExamDetails").onclick = () => {
  const d = document.getElementById("examDetails");
  d.close();
  openEditor("exam", d.dataset.examId);
};
document.getElementById("studyExamDetails").onclick = () => {
  document.getElementById("examStudy").hidden = false;
  document.getElementById("examStudy").scrollIntoView({ block: "nearest" });
};
document.addEventListener("change", async (event) => {
  if (event.target.id === "examFilter" || event.target.id === "examOrder") {
    examFilter = document.getElementById("examFilter").value;
    examOrder = document.getElementById("examOrder").value;
    document.getElementById("examList").innerHTML = examRows(
      Exams.sorted(state.exams, examOrder, examFilter),
    );
  }
  if (event.target.id !== "completeImportFile" || !event.target.files[0])
    return;
  const file = event.target.files[0];
  event.target.value = "";
  try {
    if (file.size > 145 * 1024 * 1024)
      throw Error("La copia completa supera el límite de 145 MB.");
    const bundle = JSON.parse(await file.text());
    if (bundle?.format !== "studyflow-complete-v1")
      throw Error("Selecciona una copia completa con PDF.");
    bundle.state = normalize(bundle.state);
    const { next: decoded, records, count } = await ExamFiles.decode(bundle),
      next = normalize(decoded);
    if (
      !confirm(
        `¿Restaurar ${next.tasks.length} tareas, ${next.exams.length} exámenes y ${count} PDF? Se conservará una copia previa de los datos actuales.`,
      )
    )
      return;
    if (storageBlocked) throw Error(loadError);
    localStorage.setItem("studyflow-before-import", JSON.stringify(state));
    if (records.length) await ExamFiles.apply(records);
    if (!commit(next)) {
      if (records.length)
        await ExamFiles.apply(
          [],
          records.map((r) => r.id),
        );
      return;
    }
    notify("Copia completa importada correctamente, incluidos los PDF.");
  } catch (error) {
    notify("No se ha importado la copia completa: " + error.message);
  }
});
document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const d = button.dataset;
  if (d.examDetails) openExamDetails(d.examDetails);
  if (d.studyExam) openExamDetails(d.studyExam, true);
  if (
    d.pdfRemove &&
    examDraft &&
    confirm("¿Eliminar este PDF del examen al guardar?")
  ) {
    examDraft.pdfs = examDraft.pdfs.filter((p) => p.id !== d.pdfRemove);
    examDraft.additions = examDraft.additions.filter(
      (p) => p.id !== d.pdfRemove,
    );
    renderExamDraft();
  }
  if (d.pdfOpen || d.pdfDownload) {
    try {
      const id = d.pdfOpen || d.pdfDownload,
        staged = examDraft?.additions.find((a) => a.id === id);
      if (staged)
        ExamFiles.saveBlob(staged.blob, staged.name, Boolean(d.pdfOpen));
      else await ExamFiles.use(id, Boolean(d.pdfOpen));
    } catch (error) {
      notify(error.message);
    }
  }
  if (d.examPrompt) {
    const exam = state.exams.find(
      (e) =>
        String(e.id) === document.getElementById("examDetails").dataset.examId,
    );
    if (!exam) return;
    const prompt = Exams.prompt(exam, d.examPrompt);
    document.getElementById("examPrompt").value = prompt;
    // Open during the user's click to avoid popup blocking after clipboard awaits.
    window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    try {
      await navigator.clipboard.writeText(prompt);
      document.getElementById("examPromptMessage").textContent =
        "Hemos copiado tu prompt. Pégalo en ChatGPT y adjunta el PDF de tu temario. Si no se abrió la pestaña, usa «Abrir ChatGPT».";
    } catch {
      document.getElementById("examPromptMessage").textContent =
        "No se pudo copiar al portapapeles. Copia el texto del campo, abre ChatGPT con el enlace y adjunta el PDF manualmente.";
      document.getElementById("examPrompt").focus();
      document.getElementById("examPrompt").select();
    }
  }
  if (d.examBackup === "import")
    document.getElementById("completeImportFile").click();
  if (d.examBackup === "export") {
    button.disabled = true;
    try {
      const bundle = await ExamFiles.bundle(state);
      download(JSON.stringify(bundle), "studyflow-completa-con-pdf.json");
      notify(
        "Copia completa preparada con todos los PDF. Guárdala en un lugar seguro.",
      );
    } catch (error) {
      notify("No se ha exportado la copia completa: " + error.message);
    } finally {
      button.disabled = false;
    }
  }
});
