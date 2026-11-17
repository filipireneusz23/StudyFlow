# Exámenes avanzados

El menú «Exámenes» permite crear, editar y consultar exámenes con instrucciones de varias líneas, enlaces manuales HTTP/HTTPS y temarios PDF. Los exámenes anteriores siguen funcionando sin añadirles campos al cargar ni inventar una fecha de creación. Se conservan sus identificadores, fechas, asignaturas y otros datos. Las notas y nombres se muestran como texto; los enlaces se escapan y se abren con `noopener noreferrer`.

## Fechas, colores y ordenación

La fecha y hora son opcionales y locales al navegador. Sin hora, un examen pasa a pasado al terminar su día. Con hora, pasa al llegar a ese instante. Se reutiliza el motor de urgencia de Tareas: verde >7 días, lima 4–7, amarillo 2–3, naranja mañana, rojo hoy y rojo oscuro pasado. Sin fecha es neutral. Cada examen muestra también una etiqueta de texto, borde lateral y fondo sutil en listas, dashboard, detalles y evento del calendario. El fondo del día escolar no cambia.

Los días se cuentan como fechas civiles, sin dividir intervalos entre 24 horas. En cambios de horario una hora repetida usa la primera ocurrencia; una inexistente avanza por el salto horario. Los indicadores se recalculan cada segundo y al volver a la pestaña. Los filtros y el panel de próximos exámenes se actualizan al vencer un examen sin cerrar formularios ni perder borradores.

Por defecto aparecen primero los futuros por proximidad, después los pasados (más reciente primero) y finalmente los que no tienen fecha. Se puede invertir el orden de los futuros, ordenar por asignatura o por creación, y filtrar próximos, pasados o sin fecha. Los antiguos sin fecha de creación mantienen su orden entre ellos al ordenar por creación.

## PDF privados en este navegador

Los archivos se guardan en IndexedDB `studyflow-exam-files`, almacén `pdfs`, nunca en localStorage ni en servidores. Los datos personales guardan solo referencias `{id, name, size, type}` dentro de `exam.pdfs`. Cada registro de archivo incluye su examen y un Blob de tipo PDF.

Se permiten hasta 10 PDF por examen, 20 MiB por archivo y 100 MiB en el almacén local. Se comprueban extensión `.pdf`, tipo MIME cuando existe, tamaño y cabecera `%PDF-`; no se interpreta su contenido. La vista muestra nombre y tamaño y permite abrir o descargar. «Eliminar PDF» pide confirmación y se aplica al guardar el examen. Cancelar conserva los archivos originales. Eliminar un examen también retira sus PDF actuales.

Los PDF seleccionados solo se escriben al guardar. Primero se valida el examen, luego se guardan los archivos en una transacción y después los datos personales. Si falla el almacenamiento personal se intenta retirar únicamente los archivos nuevos y se conserva el estado previo. Los errores de cuota muestran instrucciones para exportar y liberar espacio. Si se retiró una referencia pero no se pudo liberar el archivo, se informa del fallo.

Borrar datos del navegador, cambiar de dirección web o de dispositivo puede dejar los PDF inaccesibles. No existe sincronización automática. Un archivo ausente muestra un mensaje para restaurar la copia completa o adjuntarlo de nuevo.

## Copias de seguridad

La copia JSON habitual sigue disponible y conserva todos los campos personales, notas, enlaces y referencias, pero **no contiene los PDF**. Importarla en otro navegador requiere después adjuntar los archivos o restaurar una copia completa.

En Ajustes, «Exportar copia completa con PDF» crea un JSON de formato `studyflow-complete-v1` con `state` y `attachments` (archivos codificados en base64). «Importar copia completa con PDF» valida los datos y cada archivo, su tamaño, relación con el examen, unicidad e integridad de las referencias antes de escribir. El límite de lectura del fichero completo es 145 MiB. Si falta un PDF local, la exportación completa se detiene y explica cuál falta.

Una importación conserva los datos personales previos en `studyflow-before-import`. Los archivos preexistentes no se sobrescriben. Si un PDF de la copia coincide exactamente con uno local se reutiliza; si su identificador coincide pero su contenido cambia se crea un identificador nuevo. Se conservan archivos anteriores que puedan estar referenciados por copias previas, por lo que también cuentan para el límite local. La copia completa permite trasladar los temarios a otro navegador sin subirlos a un servidor. Guarda el archivo exportado de forma privada: contiene tus datos y documentos.

## Estudiar con ChatGPT

Cada examen ofrece cuatro opciones: resumir temario, crear 20 preguntas tipo test, simular examen y crear flashcards. El prompt incluye nombre del examen, asignatura, notas si las hay y nombres de los temarios. Si no hay notas, se omite esa sección.

Al elegir se abre `https://chatgpt.com/` y se intenta copiar el prompt. La interfaz indica: «Hemos copiado tu prompt. Pégalo en ChatGPT y adjunta el PDF de tu temario». Descarga el PDF desde los detalles y adjúntalo manualmente en ChatGPT. StudyFlow no envía el PDF ni el prompt automáticamente y no usa API, claves ni servicios de pago. Si el navegador bloquea el portapapeles o la pestaña, hay un campo para copiar manualmente y un enlace para abrir ChatGPT. En GitHub Pages el portapapeles utiliza el contexto HTTPS, sujeto a los permisos del navegador.

## Validación

`tests/exams.cjs` cubre modelos, todos los colores, límites, ordenación, filtros, cuatro prompts y compatibilidad. `tests/exams-browser.cjs` cubre creación/edición, texto seguro, enlaces, PDF, cancelación, descarga/apertura, prompts, restauración completa en otro contexto de navegador, JSON y móvil. `tests/exam-storage-browser.cjs` verifica IndexedDB real, fallo de cuota, transacciones, colisiones, archivos ausentes y recuperación ante fallo de localStorage. `tests/exam-urgency-browser.cjs` verifica medianoche, vencimiento por hora, filtros dinámicos, dashboard, pestaña, borradores y colores escolares. Los navegadores de pruebas están aislados de los datos personales del usuario.
