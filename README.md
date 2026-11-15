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
