# Horario personal de StudyFlow

La sección **Horario** empieza vacía. No se deduce un horario del calendario escolar ni de Classroom.

- Crea un bloque, selecciona lunes–viernes, tipo (clase, recreo u hora libre), inicio y fin. En una clase elige una asignatura personal o una clase de Classroom visible. Los cursos relacionados con una asignatura personal utilizan esa asignatura.
- El color inicial corresponde a la asignatura y puede cambiarse. Aula y profesor son opcionales y se introducen manualmente.
- Puedes crear una asignatura desde el formulario, editar o eliminar bloques pulsándolos, y copiar todos los bloques de un día a otro. La copia añade bloques independientes y rechaza solapamientos sin borrar lo que había en el destino.
- Crea varios perfiles (por ejemplo, semanas A/B) y elige cuál está activo. El cambio de perfil es manual, no se inventan fechas de alternancia.
- La tabla semanal se desplaza horizontalmente en móvil. Resalta el día actual y el bloque en curso. Los recreos y horas libres no se consideran la próxima clase.
- El dashboard muestra el horario del día y la próxima clase, saltando fines de semana y periodos no lectivos oficiales de Extremadura. Si hoy es no lectivo muestra «Hoy no hay clases». No se predicen clases del siguiente curso más allá del calendario oficial disponible. Los colores del calendario mensual no cambian.

El horario se guarda en `studyflow-v1.timetable`, junto a tus datos personales, solo al configurarlo. Las copias JSON existentes siguen siendo compatibles: una copia sin horario conserva el horario que ya tengas configurado (y no añade clases si aún no lo has creado). Las copias nuevas contienen todos los perfiles y bloques. La importación comprueba horas, colores, días, referencias y solapamientos antes de guardar; una copia inválida no reemplaza los datos actuales. Importar una copia sustituye el estado personal tras confirmación, igual que antes; el horario solo se reemplaza si el archivo contiene uno.

Los cambios de nombre de una asignatura personal se reflejan por su identificador estable. No se puede eliminar una asignatura personal utilizada en un horario hasta reasignar sus bloques. Si una clase de Classroom deja de estar disponible, el bloque conserva como referencia el nombre que tenía al crearlo; el horario no depende de que haya una sesión de Google abierta.

## Classroom y sesión

Las clases y actividades sincronizadas, la cuenta identificada y la fecha de última sincronización se conservan en la caché existente. Recargar o caducar la autorización no la borra. La aplicación muestra inmediatamente la copia y señala su antigüedad. «Volver a autorizar Google» utiliza el flujo oficial de GIS con la cuenta recordada como sugerencia y `prompt: ''`: Google decide si puede aprovechar su sesión o si debe pedir interacción. Se inicia por un clic para no provocar ventanas bloqueadas.

No se guardan tokens en localStorage, sessionStorage ni archivos. Al recargar se pierde únicamente el token en memoria: no se finge una sesión activa. Durante una sesión autorizada se sincroniza automáticamente; una consulta fallida conserva la copia anterior. Desconectar explícitamente continúa eliminando solo la caché de Classroom e intentando revocar el acceso, como indica su botón.

Una sesión de aplicación completamente persistente con renovación sin depender del navegador requeriría un backend seguro, OAuth de código de autorización y refresh tokens protegidos en el servidor. GitHub Pages por sí solo no ofrece ese backend. No se incrustan secretos ni cuentas de servicio en el frontend.

La API oficial consultada sigue sin incluir título, descripción ni fecha en `StudentSubmission`; `courseWork.list`/`get` requieren scopes del modo completo. En modo limitado se muestra **Actividad sin título disponible**, con el ID únicamente como referencia en los detalles. No se presenta un número como nombre real, ni la fecha de creación de la entrega como fecha límite. En modo completo se conservan la obtención del título, descripción y fecha/hora reales y su inclusión en el calendario. Consulta [los permisos y fuentes oficiales](classroom-permissions.md).

## Validación

```sh
node --test tests/timetable.cjs
NODE_PATH=/tmp/studyflow-tests/node_modules node tests/timetable-browser.cjs
NODE_PATH=/tmp/studyflow-tests/node_modules node tests/classroom-persistence.cjs
```

Las pruebas de Google usan servicios simulados: no acreditan una autorización real de una cuenta educativa.
