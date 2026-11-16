/* Local task links and plain-text instructions. No external API calls. */
function appendTaskLink(link = { label: "", url: "" }) {
  const row = document.createElement("div");
  row.className = "task-link-draft";
  row.innerHTML = `<label>Nombre del enlace<input data-link-label maxlength="120" value="${esc(link.label || "")}" placeholder="Ej. Abrir actividad en Classroom"></label><label>URL<input data-link-url type="url" required maxlength="8192" value="${esc(link.url || "")}" placeholder="https://…"></label><button type="button" class="secondary" data-remove-task-link>Eliminar enlace</button>`;
  document.getElementById("taskLinkRows").append(row);
}
function prepareTaskExtras(kind, item) {
  const box = document.getElementById("taskExtras");
  box.hidden = kind !== "task";
  box.disabled = kind !== "task";
  document.getElementById("taskLinkRows").replaceChildren();
  document.getElementById("itemForm").elements.taskNotes.value =
    kind === "task" ? (item?.notes ?? item?.description ?? "") : "";
  if (kind === "task")
    for (const link of V4.taskLinks(item?.links)) appendTaskLink(link);
}
function readTaskLinkDraft() {
  const links = [
    ...document.querySelectorAll("#taskLinkRows .task-link-draft"),
  ].map((row) => ({
    label: row.querySelector("[data-link-label]").value,
    url: row.querySelector("[data-link-url]").value,
  }));
  return V4.taskLinks(links);
}
function taskLinksHTML(task) {
  const links = V4.taskLinks(task.links);
  return links.length
    ? `<div class="task-links">${links.map((link) => `<a class="secondary task-link-button" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.label)} ↗</a>`).join("")}</div>`
    : "";
}
function openTaskDetails(id) {
  const task = state.tasks.find((t) => String(t.id) === id);
  if (!task) return;
  const dialog = document.getElementById("taskDetails");
  dialog.dataset.taskId = id;
  document.getElementById("taskDetailsTitle").textContent = task.name;
  document.getElementById("taskDetailsMeta").textContent =
    `${task.subject} · ${task.due ? formatDate(task.due) : "Sin fecha"} · ${task.done ? "Completada" : "Pendiente"}`;
  document.getElementById("taskDetailsNotes").textContent =
    task.notes ?? task.description ?? "Sin notas.";
  document.getElementById("taskDetailsLinks").innerHTML =
    taskLinksHTML(task) || '<p class="muted">Sin enlaces guardados.</p>';
  dialog.showModal();
}
document.getElementById("addTaskLink").onclick = () => {
  if (
    document.querySelectorAll("#taskLinkRows .task-link-draft").length >= 50
  ) {
    notify("Puedes añadir hasta 50 enlaces por tarea.");
    return;
  }
  appendTaskLink();
};
document.getElementById("closeTaskDetails").onclick = () =>
  document.getElementById("taskDetails").close();
document.getElementById("editTaskDetails").onclick = () => {
  const id = document.getElementById("taskDetails").dataset.taskId;
  document.getElementById("taskDetails").close();
  openEditor("task", id);
};
document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.hasAttribute("data-remove-task-link"))
    button.closest(".task-link-draft").remove();
  if (button.dataset.taskDetails) openTaskDetails(button.dataset.taskDetails);
});
