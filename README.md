# StudyFlow 4.0

Aplicación académica en español para FP: diseño oscuro adaptable a móvil, archivos estáticos y datos locales. No requiere cuentas, OAuth, claves, paquetes de producción ni llamadas a servicios externos.

## Funciones

- Dashboard, tareas con prioridades, notas, enlaces y colores de urgencia; asignaturas personalizadas.
- Exámenes avanzados con filtros, notas, enlaces, urgencia, temarios PDF locales, copia completa y cuatro prompts para estudiar con ChatGPT.
- Calendario oficial 2026/2027 de Extremadura para FP Grado Medio y Cabezuela del Valle: fines de semana morados y festivos/vacaciones rojos. [Fuentes y fechas verificadas](docs/calendario-2026-2027.md).
- Horario semanal, varios perfiles, clases/recreos/horas libres, colores y copia entre días. [Uso del horario](docs/horario.md).
- Notas por asignatura y evaluación, pesos explícitos, medias provisionales/finales, escala y objetivos.
- Pomodoro configurable, pausas, registro de sesiones y estadísticas reales por día, semana, mes y asignatura.
- Apuntes con autoguardado, búsqueda, favoritos y formato de texto seguro.
- Centro de recordatorios descartables y seguimiento de prácticas: calendario, jornadas, excepciones y horas efectivas.

Todo empieza sin registros académicos ficticios ni fechas de prácticas predeterminadas. Se conservan los datos existentes.

## Desarrollo

```sh
cd /workspace/StudyFlow
python3 -m http.server 8000 --bind 127.0.0.1
```

No hay compilación. GitHub Pages puede publicar los archivos de la raíz. Las funciones funcionan localmente después de cargar la página; no se promete una instalación PWA ni cargar de nuevo el sitio sin red si el navegador no conserva sus archivos.

## Datos y actualización

La clave personal sigue siendo `studyflow-v1`, con esquema versión 4. La migración conserva tareas, exámenes, asignaturas, ajustes y horarios. Antes de migrar guarda una copia en `studyflow-backup-before-v4`. Se mantienen también las copias anteriores. No se borran notas, sesiones o prácticas por recargar.

La antigua integración externa se ha retirado. Sus actividades se conservan en un archivo local dentro de los datos personales. En **Ajustes → Datos importados conservados** puedes convertir, sin duplicados, registros que tengan título útil en tareas locales. Los registros sin metadatos suficientes y las copias originales siguen conservados. La configuración de conexión anterior deja de utilizarse y se elimina. No se hacen consultas al servicio.

**Los datos no se sincronizan entre dispositivos.** Exporta una copia JSON desde Ajustes antes de borrar almacenamiento, cambiar de navegador o dirección web. Las copias JSON incluyen notas y enlaces de tareas y exámenes y las referencias a los PDF, pero no sus archivos. Para trasladar los temarios utiliza **Ajustes → Exportar copia completa con PDF** e impórtala con la opción de copia completa. Los PDF solo se guardan en IndexedDB del navegador; borrarlo puede eliminarlos. Las importaciones validan el archivo y guardan el estado previo en `studyflow-before-import`; los apartados nuevos que no existan en una copia antigua se conservan. Las asignaturas necesarias para los registros conservados también se retienen.

Consulta [StudyFlow 4.0: cálculos, prácticas y límites](docs/studyflow-v4.md) y [Exámenes avanzados, PDF y ChatGPT](docs/examenes.md).

## Pruebas

Requiere Node.js, Chromium y Playwright para las pruebas de navegador. Instala herramientas fuera del repositorio:

```sh
npm install --prefix /tmp/studyflow-tests --cache /tmp/npm-cache --no-audit --no-fund playwright
node --test tests/v4-core.cjs tests/timetable.cjs tests/task-details.cjs tests/task-urgency.cjs tests/exams.cjs
node tests/academic-data.cjs
NODE_PATH=/tmp/studyflow-tests/node_modules node tests/v4-browser.cjs
NODE_PATH=/tmp/studyflow-tests/node_modules node tests/v4-migration.cjs
NODE_PATH=/tmp/studyflow-tests/node_modules node tests/smoke.cjs
NODE_PATH=/tmp/studyflow-tests/node_modules node tests/academic-calendar.cjs
NODE_PATH=/tmp/studyflow-tests/node_modules node tests/timetable-browser.cjs
NODE_PATH=/tmp/studyflow-tests/node_modules node tests/task-details-browser.cjs
NODE_PATH=/tmp/studyflow-tests/node_modules node tests/task-urgency-browser.cjs
NODE_PATH=/tmp/studyflow-tests/node_modules node tests/exams-browser.cjs
NODE_PATH=/tmp/studyflow-tests/node_modules node tests/exam-storage-browser.cjs
NODE_PATH=/tmp/studyflow-tests/node_modules node tests/exam-urgency-browser.cjs
```

Con el servidor anterior en marcha, los navegadores temporales usan datos de prueba aislados, nunca el perfil del usuario. `CHROMIUM_PATH` permite seleccionar el ejecutable. Las pruebas comprueban migración, cálculos, temporizador, autoguardado, seguridad de texto, prácticas, colores, horario, copias y conservación de datos. No requieren acceso a Google ni credenciales.
