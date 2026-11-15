# Qué permite cada permiso de Classroom

Comprobación del 15/11/2026 contra la [definición de descubrimiento oficial mantenida por Google](https://github.com/googleapis/google-api-go-client/blob/main/classroom/v1/classroom-api.json), revisión **20261028**. Las páginas de documentación de developers.google.com no fueron accesibles desde la red del entorno; se consultó directamente este contrato de API publicado en el repositorio de Google, incluidos los scopes por método y los campos de StudentSubmission.

## Lo que admite la API

| Método                                                                                                                                               | Permisos de lectura admitidos                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [`courses.courseWork.list`](https://developers.google.com/classroom/reference/rest/v1/courses.courseWork/list)                                       | `classroom.coursework.me.readonly` o `classroom.coursework.students.readonly`                                             |
| [`courses.courseWork.get`](https://developers.google.com/classroom/reference/rest/v1/courses.courseWork/get)                                         | Los mismos que list. No es una alternativa con el permiso de entregas propias.                                            |
| [`courses.courseWork.studentSubmissions.list`](https://developers.google.com/classroom/reference/rest/v1/courses.courseWork.studentSubmissions/list) | Los anteriores, además de `classroom.student-submissions.me.readonly` o `classroom.student-submissions.students.readonly` |

Todos los nombres anteriores llevan el prefijo `https://www.googleapis.com/auth/`. Los métodos también admiten las variantes `classroom.coursework.me` y `classroom.coursework.students`, de escritura; StudyFlow **no** las solicita para sortear este bloqueo. Los permisos para alumnos de una clase no convierten a un alumno en profesor: también se comprueba la relación de la cuenta con el curso.

`classroom.coursework.me.readonly` sigue figurando como scope válido en el contrato oficial de API consultado. Esto no garantiza que Google Cloud lo muestre o permita seleccionarlo en todo proyecto. El contrato no explica el motivo concreto por el que la consola lo rechaza en una cuenta determinada; no sería correcto afirmar que está retirado globalmente ni atribuir sin evidencia el rechazo a un administrador concreto.

Las descripciones del catálogo para `coursework.me.readonly` y `student-submissions.me.readonly` son parecidas, pero **los métodos que los admiten difieren**. No son equivalentes. `courses.readonly`, `openid` y `email` tampoco conceden acceso a `courseWork.list`.

## Alternativa implementada: modo de entregas propias

Ajustes → Integraciones ofrece dos modos independientes:

- **Entregas propias · acceso limitado** (predeterminado, también para configuraciones antiguas sin modo). Solicita `courses.readonly`, `student-submissions.me.readonly`, `openid` y `email`. Lista cursos con `studentId=me` y entregas con `courseWorkId=-` y `userId=me`, una combinación expresamente documentada. No llama a `courseWork.list` ni `courseWork.get`.
- **Actividades completas**. Solo si Google permite y concede `coursework.me.readonly`. Conserva el flujo de actividades completas y sus fechas. Es una elección explícita; no se cambia de scope ni se amplían permisos en silencio.

El modo limitado muestra el identificador de actividad, la clase, el estado de entrega, el indicador `late` y el enlace oficial. Solicita únicamente esos campos de la respuesta; no almacena respuestas del alumno, adjuntos o calificaciones. Se sincroniza y evita duplicados por curso y actividad.

**StudentSubmission no contiene el título, el enunciado ni la fecha de entrega.** La fecha de creación o actualización de una entrega no es su fecha límite. Se muestra «Entrega propia · actividad ID» y «Fecha no disponible con este permiso», nunca un título supuesto o una fecha inventada. Las entregas no se colocan en el calendario y solo se consideran vencidas cuando la API lo indica mediante `late`. Las tareas y exámenes personales mantienen sus fechas y funciones.

Si ya existía una copia de metadatos completos de una actividad, se conserva como `previousMetadata` dentro de la caché al pasar al modo limitado, pero no se presenta como información recién consultada ni como fecha vigente. Una entrega que desaparece se conserva como no disponible, sin deducir que se haya borrado la actividad. Los errores preservan la última sincronización correcta.

## Qué cambiar en la configuración

1. En StudyFlow, desconecta si hay una sesión activa. No borres almacenamiento ni datos personales.
2. Deja seleccionado **Entregas propias · acceso limitado**, conserva tu Client ID y pulsa **Guardar Client ID**.
3. En Google Cloud, declara los permisos que ya puedes conceder: cursos, entregas propias e identidad básica. El Client ID debe pertenecer al proyecto con Classroom API habilitada y tener como origen JavaScript `https://filipireneusz23.github.io`.
4. Conecta y acepta el consentimiento. Los detalles muestran los scopes del modo elegido. `userinfo.email` se reconoce como la forma canónica de `email` (no son dos permisos adicionales a solicitar).
5. Si la organización deniega incluso las entregas propias, el administrador de Workspace debe revisar el OAuth Client ID exacto y los scopes en Seguridad → Controles de API → Control de acceso de aplicaciones, para la unidad o grupo del alumno.

Para obtener títulos, descripciones y fechas automáticamente hay que conseguir un scope admitido por `courseWork.list`. Un backend o un flujo de autorización diferente no convierte el permiso de entregas en permiso de actividades. La delegación de dominio requeriría autorización del administrador y un backend seguro; no se puede incrustar una cuenta de servicio o un secreto en GitHub Pages, y no elimina los requisitos del endpoint. No se implementa como evasión de la política del centro.

Si Google no permite un scope compatible con actividades completas, la alternativa viable es este acceso limitado con enlace al original y mantener las fechas en tus tareas personales de StudyFlow, o solicitar al centro una vía autorizada para esos metadatos. No se usan scraping ni permisos de escritura como atajos.

## Límites de la comprobación

Los tests comprueban la elección de endpoints y scopes, los estados, la caché, la ausencia de fechas inventadas y la conservación de los datos. Las respuestas de Google en las pruebas están controladas: no se ha autorizado una cuenta educativa real ni se ha comprobado la política privada del centro. El modo limitado usa un contrato oficial compatible con los scopes comunicados por el usuario; la autorización real sigue sujeta a Google y a su organización.
