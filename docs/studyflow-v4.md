# StudyFlow 4.0: cálculos y seguimiento

## Notas

Cada registro pertenece a una asignatura y evaluación; puede representar examen, trabajo o actividad. El peso debe ser positivo y la suma de pesos del grupo no puede superar el 100 %. Una nota vacía es pendiente, no un cero. Escala inicial 0–10, configurable; cambiarla no rescale notas existentes y se rechazan valores incompatibles.

La media provisional se normaliza solo sobre los pesos ya evaluados. La media final solo se muestra cuando los pesos suman 100 % y todas las notas están registradas. Para un objetivo T y un peso pendiente P, la media necesaria es `(T − contribución ya obtenida) / (P / 100)`. Sin pesos completos no se ofrece un objetivo ficticio. Se indica si el objetivo ya se ha alcanzado o si no es posible con la escala configurada.

Las gráficas utilizan registros reales ordenados por fecha. La media general es la media simple de las evaluaciones completas; no se suponen pesos entre trimestres o asignaturas.

## Estudio

Duraciones iniciales: estudio 25 min, descanso corto 5 min, largo 15 min. Puedes modificarlas y elegir asignatura. El temporizador guarda la fecha de finalización prevista y los intervalos activos; pausar detiene el cómputo y continuar conserva el tiempo restante. Los intervalos se reparten por día local cuando cruzan medianoche. Cambiar las duraciones no descarta una sesión pausada: los cambios se aplican a la siguiente sesión.

Se registra una sesión de estudio solo cuando se completa. Los descansos y sesiones reiniciadas incompletas no inflan las estadísticas. Cambiar de fase no inicia automáticamente otra. Tras un cierre o suspensión se completa, como máximo, la sesión que estaba en curso, con su fecha final original; no se cuentan todas las horas que el navegador estuvo cerrado. La página abierta muestra un aviso al terminar. No se prometen avisos con el navegador cerrado ni sesiones de fondo perpetuas.

## Apuntes y avisos

Los apuntes se guardan con cada cambio y pueden buscarse, ordenarse por fecha/asignatura y marcarse como favoritos. Se admiten títulos con `#`, `##`, `###`, negrita con `**texto**` y cursiva con `*texto*`. El contenido se escapa antes de aplicar formato: el HTML y los scripts nunca se ejecutan.

Los recordatorios se calculan con identificadores estables del registro y su fecha. Descartar uno se conserva; cambiar la fecha del registro puede generar un aviso nuevo, porque es otro vencimiento. La anticipación es configurable. Los avisos se muestran en el dashboard y Recordatorios; no son notificaciones push fuera de la aplicación.

## Formación en empresa

No se añaden fechas reales por defecto. Configura inicio, duración o fin manual, empresa, horario, días de asistencia y observaciones. El fin manual prevalece. Los meses se suman de forma natural: 31 de enero + 1 mes termina el 28 o 29 de febrero; 30 de noviembre + 3 meses termina el 28 o 29 de febrero. Semanas y días se suman a la fecha inicial. La fecha final es inclusiva para la programación de jornadas, por lo que el número de fechas del periodo puede ser uno más que el intervalo aditivo. Se muestran ambos conceptos sin convertir meses en una cantidad fija de días.

Los días naturales transcurridos son fechas completas anteriores a hoy; las jornadas transcurridas son jornadas programadas anteriores a hoy. La programación usa únicamente los días de semana y las excepciones que configures: **los festivos y vacaciones escolares no cancelan las prácticas automáticamente**. El periodo máximo es diez años, para evitar configuraciones accidentales desmesuradas.

Los indicadores turquesa se superponen sin sustituir los fondos morado/rojo del calendario. Pulsar cualquier día del periodo muestra los detalles, incluso si no tiene asistencia programada. Los inicios y fines aparecen como eventos.

Las horas efectivas provienen únicamente de registros de asistencia. Guardar la misma fecha actualiza ese registro, sin duplicarlo. Un registro de cero horas sirve como observación y no cuenta como asistencia positiva. No se infieren horas realizadas multiplicando jornadas por un horario. La próxima jornada incluye hoy si hay asistencia programada. Los registros y excepciones fuera del periodo se rechazan, evitando perderlos al cambiar fechas accidentalmente.

## Datos locales

Toda la información usa el almacenamiento de este navegador y las copias JSON. No hay sincronización entre dispositivos, servidor de cuentas ni llamadas a Classroom. La migración a 4.0 hace una copia previa y conserva los registros importados; los que carezcan de título útil no se convierten en tareas inventadas. Revisar y convertir una copia importada es una decisión local del usuario, no una actualización desde el origen.

Las copias completas nuevas reemplazan los apartados que incluyen tras confirmación. Las antiguas que no contienen notas, apuntes, estudio, prácticas u horario no borran esos apartados actuales; se preservan las asignaturas necesarias para sus referencias. Los errores de validación o almacenamiento no se presentan como guardados correctos.

### Notas y enlaces de cada tarea

El formulario de creación y edición incluye instrucciones de varias líneas y hasta 50 enlaces manuales con nombre personalizado. «Detalles» muestra las instrucciones como texto y los enlaces se abren en otra pestaña con protección `noopener noreferrer`. Se pueden editar o eliminar desde «Editar tarea». Guardar conserva estos campos junto con el resto de la tarea, sin servicios externos ni autorización de Google; se puede pegar una URL de Classroom como cualquier enlace.

Se admiten únicamente URL absolutas HTTP y HTTPS. Las notas y nombres nunca se interpretan como HTML. Las tareas antiguas siguen funcionando sin estos campos opcionales (`notes` y `links`, lista de `{label, url}`), sin reescribirlas al cargar. Las copias JSON incluyen los campos y su importación valida los enlaces antes de guardar. El resto de los datos de cada tarea se conserva.

Pruebas adicionales: `node --test tests/task-details.cjs` y `NODE_PATH=/tmp/studyflow-tests/node_modules node tests/task-details-browser.cjs` (Playwright con Chromium). Cubren compatibilidad, persistencia, edición, eliminación, contenido seguro, exportación/importación y pantalla móvil.

### Urgencia de las tareas

Las tareas del panel, de la lista y del calendario muestran un borde, fondo sutil y etiqueta con texto según el vencimiento: más de 7 días verde `#22C55E`; 4–7 lima `#84CC16`; 2–3 amarillo `#EAB308`; mañana naranja `#F97316`; hoy rojo `#EF4444`; atrasadas rojo oscuro `#991B1B`. Las completadas y sin fecha son neutrales. Los colores de las celdas del calendario escolar no cambian.

Los días restantes se calculan con fechas civiles locales, sin dividir milisegundos entre 24 horas. La hora opcional (`dueTime`, `HH:mm`) también es local; al llegar a esa hora la tarea pasa a atrasada. Sin hora, vence al terminar el día. En cambios de horario, una hora repetida utiliza la primera ocurrencia y una hora inexistente avanza por el salto horario, siguiendo la resolución del navegador. El estado se calcula al mostrar las tareas, cada segundo mientras la página está activa y al volver a la pestaña. No se guarda ningún color derivado ni se reescriben las tareas antiguas. Notas y enlaces permanecen intactos y la hora se incluye en las copias JSON.

Pruebas: `node --test tests/task-urgency.cjs` y `NODE_PATH=/tmp/studyflow-tests/node_modules node tests/task-urgency-browser.cjs`. Incluyen todos los niveles, límites de mes/año, año bisiesto, cambios de horario y zonas horarias, medianoche en navegador, hora límite, edición, completar tareas, persistencia, móvil y fondos escolares.
