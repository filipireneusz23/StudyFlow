# StudyFlow 3.0

Organizador de estudios en español, estático y sin dependencias de producción. Incluye panel principal, tareas con prioridades, exámenes, calendario mensual interactivo, asignaturas con colores y ajustes. Diseño oscuro adaptable a móvil.

## Desarrollo

Requiere Python 3 para el servidor local (o cualquier servidor de archivos estáticos):

```sh
cd /workspace/StudyFlow
python3 -m http.server 8000 --bind 127.0.0.1
```

No requiere compilación ni servicios externos para las funciones locales. La integración opcional de Classroom requiere un OAuth Client ID configurado por el usuario. Para desplegar en GitHub Pages, publica los archivos de la raíz del repositorio. Mantén el mismo dominio y ruta de acceso para utilizar los datos locales existentes.

## Datos y actualización

Se conserva la clave `studyflow-v1` y los campos de las tareas y exámenes existentes. Las tareas anteriores reciben prioridad media y sus asignaturas se incorporan automáticamente. Antes de la primera actualización se conserva el contenido original en `studyflow-backup-before-v3`. La migración se guarda al realizar la siguiente modificación.

Los datos pertenecen al navegador y al origen web: no se sincronizan con GitHub ni entre dispositivos. Exporta una copia JSON en Ajustes antes de cambiar de navegador, dirección web o borrar almacenamiento. La importación valida los registros, solicita confirmación y conserva el estado anterior en `studyflow-before-import`. No sobrescribe almacenamiento ilegible. La eliminación de una asignatura con registros se bloquea hasta reasignarlos.

## Validación

```sh
node --check app.js
# Instalar herramientas de prueba fuera del repositorio:
npm install --prefix /tmp/studyflow-tests --cache /tmp/npm-cache --no-audit --no-fund playwright
# Con el servidor anterior en marcha y Chromium instalado:
NODE_PATH=/tmp/studyflow-tests/node_modules node tests/smoke.cjs
```

La prueba usa datos aislados en un navegador temporal: migración desde 1.0, copia original, asignaturas, prioridades, fechas exactas en otra zona horaria, edición entre meses, completar tareas, persistencia, ajustes, exportación/importación y anchura móvil. `CHROMIUM_PATH` permite seleccionar el ejecutable de Chromium.

## Publicación

Revisa `git diff`, ejecuta las comprobaciones y crea un commit con los archivos de la aplicación, documentación y pruebas. No incluyas datos personales exportados. Después sube la rama a GitHub y configura GitHub Pages si corresponde. Esta actualización no necesita servidor backend.

## Calendario académico 2026/2027

Calendario oficial de Extremadura adaptado a Cabezuela del Valle (Cáceres), FP Grado Medio de régimen general. Clases ordinarias del **10/09/2026 al 04/06/2027**. Incluye Navidad, Carnaval, Semana Santa, festivos oficiales y los festivos locales del **23 y 26 de julio de 2027**, verificados en el anexo del DOE. No inventa Día del Centro ni sustituciones.

Los fines de semana se muestran en morado oscuro y los festivos y periodos sin clases en rojo oscuro, que prevalece si coinciden; se conservan las tareas y exámenes dentro de cada día. Los periodos anterior y posterior a las clases ordinarias se identifican como tales: pueden existir evaluaciones o formación en empresa según el centro. Los eventos académicos no se incorporan al almacenamiento personal. Consulta la [trazabilidad de fechas y fuentes oficiales](docs/calendario-2026-2027.md).

Con el servidor local y Playwright disponibles:

```sh
node tests/academic-data.cjs
NODE_PATH=/tmp/studyflow-tests/node_modules node tests/academic-calendar.cjs
NODE_PATH=/tmp/studyflow-tests/node_modules node tests/smoke.cjs
```

## Google Classroom (opcional, solo lectura)

Ajustes → Integraciones permite configurar un OAuth Client ID de aplicación web y conectar mediante Google Identity Services. Los tokens solo viven en memoria. Cursos y actividades se sincronizan en una caché separada de los datos personales, con IDs originales, estados, fechas UTC convertidas a la zona del navegador, tareas sin fecha y relaciones con asignaturas existentes. Las tareas de Classroom aparecen en el panel, las listas y el calendario. No se simula una conexión si falta configurar Google Cloud.

Consulta la [guía completa de Google Cloud y conexión](docs/google-classroom.md). No se ha realizado una autorización real de Google durante este desarrollo; las pruebas usan respuestas controladas.

```sh
node --test tests/classroom.cjs tests/oauth.cjs tests/scopes.cjs
NODE_PATH=/tmp/studyflow-tests/node_modules node tests/classroom-browser.cjs
NODE_PATH=/tmp/studyflow-tests/node_modules node tests/oauth-browser.cjs
NODE_PATH=/tmp/studyflow-tests/node_modules node tests/scopes-browser.cjs
```
