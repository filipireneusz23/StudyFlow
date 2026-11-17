/* PDFs are private, local IndexedDB blobs. Never stored in localStorage. */
const ExamFiles = (() => {
  const MAX_FILE = 20 * 1024 * 1024,
    MAX_TOTAL = 100 * 1024 * 1024,
    MAX_COUNT = 10;
  function friendly(error) {
    return Error(
      error?.name === "QuotaExceededError"
        ? "No hay espacio suficiente para los PDF. Descarga una copia completa y libera espacio en el navegador."
        : `No se pudo acceder a los PDF locales: ${error?.message || "almacenamiento no disponible"}`,
    );
  }
  function db() {
    return new Promise((resolve, reject) => {
      let req;
      try {
        req = indexedDB.open("studyflow-exam-files", 1);
      } catch (e) {
        reject(friendly(e));
        return;
      }
      req.onupgradeneeded = () =>
        req.result.createObjectStore("pdfs", { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(friendly(req.error));
      req.onblocked = () =>
        reject(
          Error(
            "Cierra otras pestañas de StudyFlow para abrir el almacén de PDF.",
          ),
        );
    });
  }
  async function all() {
    const d = await db();
    try {
      return await new Promise((resolve, reject) => {
        const tx = d.transaction("pdfs", "readonly"),
          r = tx.objectStore("pdfs").getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(friendly(r.error));
      });
    } finally {
      d.close();
    }
  }
  async function get(id) {
    const d = await db();
    try {
      return await new Promise((resolve, reject) => {
        const r = d.transaction("pdfs", "readonly").objectStore("pdfs").get(id);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(friendly(r.error));
      });
    } finally {
      d.close();
    }
  }
  async function apply(additions = [], remove = []) {
    const existing = await all();
    const removed = new Set(remove);
    const size =
      existing
        .filter(
          (x) => !removed.has(x.id) && !additions.some((a) => a.id === x.id),
        )
        .reduce((n, x) => n + x.blob.size, 0) +
      additions.reduce((n, x) => n + x.blob.size, 0);
    if (size > MAX_TOTAL)
      throw Error(
        "Los PDF locales superan el límite de 100 MB. Exporta una copia completa antes de eliminar archivos.",
      );
    const d = await db();
    try {
      await new Promise((resolve, reject) => {
        const tx = d.transaction("pdfs", "readwrite"),
          store = tx.objectStore("pdfs");
        tx.oncomplete = resolve;
        tx.onerror = () => reject(friendly(tx.error));
        tx.onabort = () => reject(friendly(tx.error));
        try {
          for (const id of remove) store.delete(id);
          for (const file of additions) store.add(file);
        } catch (error) {
          tx.abort();
          reject(friendly(error));
        }
      });
    } finally {
      d.close();
    }
  }
  async function validate(file) {
    if (
      !file ||
      !Number.isFinite(file.size) ||
      file.size < 5 ||
      file.size > MAX_FILE
    )
      throw Error("Cada PDF debe ocupar entre 5 bytes y 20 MB.");
    if (
      typeof file.name !== "string" ||
      file.name.length > 255 ||
      !/\.pdf$/i.test(file.name) ||
      (file.type && file.type !== "application/pdf")
    )
      throw Error("Selecciona un archivo PDF (.pdf).");
    if (
      new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== "%PDF-"
    )
      throw Error("El contenido del archivo no es un PDF válido.");
  }
  function meta(file) {
    return {
      id: file.id,
      name: file.name,
      size: file.blob.size,
      type: "application/pdf",
    };
  }
  async function prepare(files, examId) {
    const results = [];
    for (const file of files) {
      await validate(file);
      results.push({
        id: crypto.randomUUID(),
        examId,
        name: file.name,
        blob: new Blob([file], { type: "application/pdf" }),
      });
    }
    return results;
  }
  function saveBlob(blob, name, open = false) {
    const url = URL.createObjectURL(blob);
    if (open) {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function use(id, open = false) {
    const file = await get(id);
    if (!file)
      throw Error(
        "Este PDF no está en este navegador. Restaura una copia completa con archivos o vuelve a adjuntarlo.",
      );
    saveBlob(file.blob, file.name, open);
  }
  function encode(buffer) {
    const bytes = new Uint8Array(buffer);
    let result = "";
    for (let i = 0; i < bytes.length; i += 16384)
      result += String.fromCharCode(...bytes.subarray(i, i + 16384));
    return btoa(result);
  }
  async function bundle(state) {
    const attachments = [];
    for (const exam of state.exams)
      for (const pdf of exam.pdfs || []) {
        const record = await get(pdf.id);
        if (!record || record.examId !== String(exam.id))
          throw Error(
            `No se encuentra el PDF «${pdf.name}». Vuelve a adjuntarlo antes de crear una copia completa.`,
          );
        attachments.push({
          ...meta(record),
          examId: String(exam.id),
          data: encode(await record.blob.arrayBuffer()),
        });
      }
    return {
      format: "studyflow-complete-v1",
      state: structuredClone(state),
      attachments,
    };
  }
  async function decode(bundle) {
    if (
      bundle?.format !== "studyflow-complete-v1" ||
      !Array.isArray(bundle.attachments) ||
      !bundle.state
    )
      throw Error("Formato de copia completa no válido.");
    const next = structuredClone(bundle.state),
      records = [],
      seen = new Set();
    let total = 0;
    for (const item of bundle.attachments) {
      if (
        !item ||
        typeof item.id !== "string" ||
        seen.has(item.id) ||
        typeof item.data !== "string" ||
        item.data.length > Math.ceil(MAX_FILE / 3) * 4
      )
        throw Error("Adjuntos duplicados o no válidos.");
      seen.add(item.id);
      const exam = next.exams?.find((e) => String(e.id) === item.examId),
        ref = exam?.pdfs?.find((p) => p.id === item.id);
      if (!ref || ref.name !== item.name || ref.size !== item.size)
        throw Error("El PDF no coincide con su examen.");
      let binary;
      try {
        binary = atob(item.data);
      } catch {
        throw Error("PDF codificado incorrectamente.");
      }
      total += binary.length;
      if (total > MAX_TOTAL) throw Error("Los adjuntos superan los 100 MB.");
      const file = new File(
        [Uint8Array.from(binary, (c) => c.charCodeAt(0))],
        item.name,
        { type: "application/pdf" },
      );
      if (file.size !== item.size)
        throw Error("El tamaño del PDF no coincide.");
      await validate(file);
      const existing = await get(item.id);
      let reusable = false;
      if (
        existing &&
        existing.examId === item.examId &&
        existing.name === item.name &&
        existing.blob.size === file.size
      ) {
        const bytes = new Uint8Array(await existing.blob.arrayBuffer());
        reusable = bytes.every((value, i) => value === binary.charCodeAt(i));
      }
      if (!reusable) {
        const [record] = await prepare([file], item.examId);
        ref.id = record.id;
        records.push(record);
      }
    }
    const count = next.exams.reduce((n, e) => n + (e.pdfs || []).length, 0);
    if (count !== bundle.attachments.length)
      throw Error("La copia completa no contiene todos los PDF.");
    return { next, records, count };
  }
  return {
    MAX_FILE,
    MAX_TOTAL,
    MAX_COUNT,
    all,
    get,
    apply,
    validate,
    prepare,
    meta,
    use,
    bundle,
    decode,
    saveBlob,
  };
})();
