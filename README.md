# StudyFlow 3.0

Organizador de estudios en español, estático y sin dependencias de producción. Incluye panel principal, tareas con prioridades, exámenes, calendario mensual interactivo, asignaturas con colores y ajustes. Diseño oscuro adaptable a móvil.

## Desarrollo

Requiere Python 3 para el servidor local (o cualquier servidor de archivos estáticos):

```sh
cd /workspace/StudyFlow
python3 -m http.server 8000 --bind 127.0.0.1
```

No requiere compilación, credenciales ni servicios externos. Para desplegar en GitHub Pages, publica los archivos de la raíz del repositorio. Mantén el mismo dominio y ruta de acceso para utilizar los datos locales existentes.

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

## Calendario académico 2026/2027 (en preparación)

La rama `academic-calendar-2026-2027` prepara la visualización de días sin clase, los motivos, las acciones para crear tareas/exámenes desde cualquier fecha, la leyenda y el selector de mes. Los fines de semana se muestran en rojo oscuro; las tareas en azul y los exámenes en rojo intenso. Esta visualización no modifica los datos personales ni introduce festivos en localStorage.

**Pendiente antes de publicar:** consultar las dos resoluciones oficiales del DOE, verificar fechas para FP Grado Medio y Cabezuela del Valle, completar `academic-calendar.js` y validar los datos frente a las fuentes. Actualmente `verified` es `false` y no se han cargado fechas oficiales, incluidos los festivos locales propuestos del 23 y 26 de julio de 2027. No se presupone Día del Centro ni sustituciones. Un día sin marca no garantiza que haya clase mientras la verificación esté pendiente.

El acceso a `doe.juntaex.es` debe habilitarse en los ajustes de red del entorno. Fuentes:

- https://doe.juntaex.es/otrosFormatos/html.php?anio=2026&doe=1160o&xml=2026061567
- https://doe.juntaex.es/otrosFormatos/html.php?anio=2026&doe=2070o&xml=2026062650

La prueba `NODE_PATH=/tmp/studyflow-tests/node_modules node tests/academic-calendar.cjs` comprueba colores de cuadrado completo, motivos, coincidencia con eventos personales, navegación entre años y conservación exacta de datos existentes. El intervalo vacacional utilizado por la prueba es **sintético**: verifica el tratamiento inclusivo de intervalos y no acredita fechas oficiales.
