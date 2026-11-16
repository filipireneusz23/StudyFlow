# Horario personal

Horario empieza vacío. Puedes añadir clases, recreos y horas libres de lunes a viernes, elegir una asignatura local, crearla desde el formulario y configurar horas, colores, aula y profesor. Edita o elimina un bloque pulsándolo.

Los perfiles permiten alternar horarios manualmente, sin inventar fechas de semanas A/B. Copiar un día crea bloques independientes; se rechazan solapamientos sin borrar los del destino. La tabla se desplaza horizontalmente en móvil y resalta el día y el bloque en curso.

El dashboard muestra el horario de hoy y la próxima clase, omitiendo fines de semana y días no lectivos oficiales. No se pronostican clases del siguiente curso más allá del calendario verificado. Las prácticas en empresa son independientes: pueden coincidir con un día sin clases lectivas y no cancelan automáticamente los bloques del horario.

Se mantiene `studyflow-v1.timetable` y todos los perfiles se incluyen en las copias JSON. Si importas una copia antigua sin horario, se conserva el actual y sus asignaturas necesarias. Las importaciones se validan antes de sustituir los datos. Los nombres de asignaturas se relacionan mediante identificadores; no se puede eliminar una asignatura que tenga bloques asociados sin reasignarlos antes.

Las referencias antiguas a asignaturas importadas se convierten en referencias locales durante la migración a 4.0, conservando nombres, colores, horas y bloques. No se necesita ninguna conexión externa.
