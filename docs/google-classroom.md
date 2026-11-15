# Conectar Google Classroom a StudyFlow

La integración usa Google Identity Services (GIS), OAuth 2.0 para JavaScript y la API oficial de Google Classroom. Funciona en GitHub Pages sin servidor y es de **solo lectura**. No solicita tu contraseña en StudyFlow ni utiliza un Client Secret. Hasta configurar tu Client ID muestra **Pendiente de configuración**.

## 1. Crear el proyecto

Accede a [Google Cloud Console](https://console.cloud.google.com/), selecciona tu cuenta y crea un proyecto, por ejemplo «StudyFlow». Anota qué proyecto seleccionas: la API habilitada y el cliente OAuth deben pertenecer al mismo proyecto. No hace falta introducir credenciales de Google Cloud en el repositorio.

## 2. Habilitar la API

En **APIs y servicios → Biblioteca**, busca **Google Classroom API** y pulsa **Habilitar** para ese proyecto.

## 3. Configurar el consentimiento

En **Google Auth Platform** (o **APIs y servicios → Pantalla de consentimiento OAuth**, según la consola):

- Configura el nombre StudyFlow, correo de asistencia y correo de contacto.
- Selecciona el público. **Interno** solo está disponible en una organización de Google Workspace y limita el acceso a sus cuentas. Para cuentas personales o pruebas fuera de la organización usa **Externo**.
- Añade los permisos de la siguiente sección en **Acceso a los datos / Data access**.
- Si Google solicita dominio autorizado y no puedes acreditar un subdominio de GitHub Pages, no declares ser propietario de `github.io`: sigue las indicaciones de Google o utiliza un dominio propio verificable para publicar el consentimiento. El origen JavaScript del cliente sí debe ser el origen real de la aplicación.
- Para ofrecer la aplicación al público, Google puede exigir verificación por los permisos de Classroom. Cambiar el código de StudyFlow no evita ese requisito. Para tus pruebas personales puedes mantenerla en modo de prueba con tu cuenta autorizada.

## 4. Permisos mínimos solicitados

| Permiso                                                            | Finalidad                                                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `https://www.googleapis.com/auth/classroom.courses.readonly`       | Listar tus clases, con `studentId=me`.                                                                                                                 |
| `https://www.googleapis.com/auth/classroom.coursework.me.readonly` | Leer actividades y el estado de tus propias entregas. Este permiso ya permite consultar tus entregas; no se piden permisos sobre las de otros alumnos. |
| `openid` y `email`                                                 | Identificar la cuenta conectada y mostrar su correo cuando Google lo facilite.                                                                         |

No se solicitan permisos de escritura, publicación, entrega de trabajos, Drive, Gmail ni modificación de clases. La app hace solicitudes GET a Classroom y al servicio de identidad; la única acción de autorización adicional es la revocación al desconectar.

## 5. Crear el OAuth Client ID

En **Clientes / Clients → Crear cliente**, o **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**:

1. Selecciona **Aplicación web**.
2. Asigna un nombre al cliente.
3. En **Orígenes de JavaScript autorizados**, añade exactamente:

   ```text
   https://filipireneusz23.github.io
   ```

   El origen **no** incluye `/StudyFlow/`, barras finales, rutas ni comodines.

4. Para desarrollo local, añade separadamente los orígenes que realmente uses, por ejemplo `http://localhost:8000` y `http://127.0.0.1:8000`.
5. Guarda y copia el **Client ID**, terminado en `.apps.googleusercontent.com`. El flujo GIS de token por ventana emergente usado por StudyFlow no necesita un URI de redirección de backend. No copies el Client Secret a StudyFlow ni a GitHub.

El Client ID es un identificador público. La app lo guarda en tu navegador; no hay un cliente inventado o predeterminado en el código. Las modificaciones de la configuración OAuth pueden tardar en propagarse.

## 6. Añadir usuarios de prueba

Si la aplicación es externa y está en modo **Testing / Prueba**, añade el correo exacto de tu cuenta de Classroom en **Audience / Público → Usuarios de prueba**. Debe ser la cuenta que está matriculada en las clases. Las cuentas educativas pueden necesitar además que el administrador autorice el Client ID y los permisos solicitados.

## 7. Introducirlo en StudyFlow

Abre [StudyFlow](https://filipireneusz23.github.io/StudyFlow/), entra en **Ajustes → Integraciones → Google Classroom**, pega el Client ID y pulsa **Guardar Client ID**. Una vez cargado el acceso de Google, pulsa **Conectar con Google Classroom**. Acepta la ventana oficial de Google y los permisos de lectura. Nunca escribas tu contraseña en formularios de StudyFlow.

Si un bloqueador impide cargar GIS, permite `https://accounts.google.com/gsi/client` y pulsa **Cargar acceso de Google**. Las consultas utilizan `https://classroom.googleapis.com` y `https://openidconnect.googleapis.com`. No necesitas un plugin de Classroom para usar esta integración.

## 8. Comprobar la conexión y usarla

Después de una autorización y consulta correctas deben aparecer **Conectado**, tu correo (si está disponible), tus clases y una fecha de última sincronización correcta. Si no perteneces a ninguna clase como alumno, una consulta correcta puede devolver una lista vacía.

- En Ajustes, relaciona cada clase con una asignatura personal si quieres. Los nombres coincidentes se relacionan automáticamente. Las asignaturas personales no se renombran ni se borran.
- En Tareas, filtra por asignatura, origen y estado (pendientes, completadas, vencidas o archivadas/no disponibles).
- Las tareas sin fecha aparecen en la lista, nunca en una fecha inventada del calendario.
- Las fechas y horas de Classroom son UTC. StudyFlow muestra los instantes en la zona horaria del navegador, incluido el cambio de día cuando corresponda. Las fechas sin hora se conservan como fechas sin inventar una hora.
- Pulsa una tarea de Classroom para ver descripción, estado y enlace al original. No puedes completarla, editarla ni entregarla desde StudyFlow.
- **Sincronizar ahora** fuerza una consulta, con separación mínima entre intentos. Durante una sesión con autorización válida también se consulta al volver a la pestaña y cada cinco minutos. Se evitan solicitudes solapadas, se recorre la paginación y se limitan los reintentos ante cuotas o fallos temporales.

Los datos solo se sustituyen tras completar una consulta íntegra. Una actividad que desaparece de una clase consultada correctamente se marca como **no disponible**; las de cursos archivados o ya no accesibles por la lista de matriculación se conservan como **archivadas**. No se presupone que hayan sido borradas definitivamente. Los errores de red o permisos conservan la copia anterior y su fecha de última sincronización.

## 9. Caducidad, desconexión y problemas

Los tokens de acceso viven **solo en memoria**, con un margen de caducidad. No se guardan en localStorage, archivos, exportaciones ni el repositorio. No se usa un refresh token. Al recargar o caducar la autorización, pulsa de nuevo **Conectar**; la copia local seguirá identificada como tal. No se puede prometer una sesión permanente sin conservar tokens.

**Desconectar** elimina la copia de Classroom e intenta revocar el token mediante Google. No borra tareas personales, exámenes, asignaturas, ajustes personales ni el calendario escolar. Si el token ya no está disponible o Google no confirma la revocación, la app lo indica: retira el acceso desde [Conexiones de tu cuenta de Google](https://myaccount.google.com/connections). Desconectar no cierra tu sesión global de Google.

| Problema                                 | Qué revisar                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Pendiente de configuración               | Falta guardar el Client ID real en Ajustes.                                                             |
| Origen no autorizado / `origin_mismatch` | El cliente es de tipo aplicación web y tiene `https://filipireneusz23.github.io` como origen, sin ruta. |
| `invalid_client`                         | Se ha copiado el Client ID del proyecto correcto, no una clave API ni el secreto.                       |
| Acceso bloqueado / usuario no autorizado | Usuario de prueba, público interno/externo, consentimiento y aprobación del administrador educativo.    |
| Permisos insuficientes / HTTP 403        | API habilitada, ambos permisos de Classroom aceptados y política del centro compatible.                 |
| Ventana no abierta o cerrada             | Permitir ventanas emergentes; conectar mediante el botón de la app.                                     |
| HTTP 401 / autorización caducada         | Volver a conectar. No se fingirá una sesión válida.                                                     |
| Límite de solicitudes / HTTP 429         | Esperar antes de sincronizar; se conserva la copia anterior.                                            |
| Sin clases                               | Usar la cuenta matriculada como alumno; revisar también las restricciones de la organización.           |

## Almacenamiento y límites de la validación

`studyflow-v1` y las copias personales existentes se mantienen. La configuración pública y las relaciones de asignaturas están en `studyflow-classroom-config`; la copia de cursos, actividades, correo e identificador de cuenta y última sincronización en `studyflow-classroom-cache`. Estas claves nunca contienen tokens. La caché de Classroom está separada de la exportación/importación personal de StudyFlow. Cambiar de cuenta descarta la caché de la cuenta anterior para no mezclar actividades.

Las pruebas automatizadas usan respuestas controladas de GIS y de la API para validar permisos, estados, caducidad, errores, paginación, duplicados, fechas, revocación y conservación de datos. **No equivalen a una autorización real de Google.** Esta implementación se entrega pendiente de que el propietario configure Google Cloud y autorice su cuenta real; no se ha realizado esa autorización durante el desarrollo.

Referencias oficiales: [modelo de token de GIS](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [permisos de Classroom](https://developers.google.com/classroom/guides/auth), [API Classroom](https://developers.google.com/classroom/reference/rest), [discovery de la API mantenido por Google](https://github.com/googleapis/google-api-go-client/blob/main/classroom/v1/classroom-api.json). Se contrastaron las rutas, permisos de lectura, paginación, comodín de entregas propias y fechas UTC con este último documento.
