# Personas de prueba desde carpetas

## Estado y estructura

La lista estable está en `assets/test-users/population.json`: **500 fichas** con IDs `persona-0001` a `persona-0500`, nombres ficticios, edades asignadas de 18 a 31 años, género Mujer y ubicaciones de 16 ciudades de México. Estos datos se generaron una vez; no se vuelven a sortear al actualizar. No son datos reales de las personas de las fotografías. Las edades de los perfiles existentes se calculan desde la fecha de nacimiento guardada al crear la cuenta.

La biblioteca local está en **`test-data/personas`**. Se copiaron desde el ZIP suministrado 51 personas y 107 archivos: 51 perfiles y 56 archivos de publicaciones. Cuatro perfiles son videos; para ellos se extrae el primer fotograma como foto fija. Los originales permanecen en la biblioteca y fuera de Git y del directorio público.

```text
test-data/personas/
  persona-0052/
    perfil.jpg
    publicacion/
      foto-01.jpg
      video-01.mp4
    historias/
      foto-02.webp
```

La carpeta `historias` es opcional. Acepta JPG, JPEG, PNG, WebP, AVIF, MP4 y WebM; máximo 50 MB por archivo y 100 contenidos por persona. Debe haber una imagen/video de perfil; puede conservar un nombre arbitrario si es el único archivo principal, o llamarse `perfil` con su extensión. Las carpetas sin perfil quedan pendientes y no generan usuarios. Los enlaces simbólicos y rutas fuera de la biblioteca se rechazan.

## Backoffice

En `/admin` → **Cuentas de prueba**:

- **Añadir todas:** crea las fichas que ya tienen archivos.
- **Actualizar personas de prueba:** vuelve a leer las carpetas e incorpora personas y contenidos nuevos. Conserva IDs de usuario, datos y contraseñas. Pulsarlo repetidamente no duplica cuentas ni publicaciones. Los archivos reemplazados se detectan por su contenido al actualizar la carpeta.
- **Lista fija de 500 personas:** descarga un CSV con sus datos y disponibilidad de archivos.
- **Descargar credenciales:** exporta las cuentas ya creadas con correo reservado y contraseña aleatoria. El acceso a esa exportación queda auditado.
- **Eliminar todos los usuarios de prueba:** exige escribir `ELIMINAR CUENTAS DE PRUEBA`. Borra únicamente cuentas registradas en las tablas de pruebas y sus contenidos. Conserva cuentas reales, catálogo y archivos originales. Después puede usarse Añadir todas para volver a crearlas.

Actualmente quedan 449 fichas sin archivos. Para añadir una persona, llena por ejemplo `persona-0052` y pulsa Actualizar. No es necesario completar las 500 antes de probar.

El worker funciona en segundo plano y conserva el avance en PostgreSQL. Añadir todas y Actualizar usan un único lote activo para esta población, con una restricción única por ficha; no se crean poblaciones duplicadas en cada clic. El borrado usa el mismo bloqueo que la importación.

## Contenidos y videos

Cada archivo de `publicacion` crea una publicación de su propio autor. Para alimentar las historias, se comparte además el primer contenido de cada tercera persona (IDs divisibles entre tres). Los archivos de `historias` crean únicamente historias. Una sincronización sin novedades no renueva su caducidad ni vuelve a publicarlos. No se inventan 150 contenidos si la biblioteca contiene menos archivos.

Las imágenes se validan y convierten a WebP; los videos pasan por la cola FFmpeg existente y solo se publican al terminar. Sus portadas se extraen del primer fotograma. El perfil de video se convierte únicamente en foto fija: no se implementó el editor de fragmentos ni el avatar animado que se había discutido como idea.

Si un video falla, el panel informa que el lote necesita revisión. Corregir el archivo y pulsar Actualizar permite reintentar. Borrar un archivo de la biblioteca no elimina automáticamente su contenido publicado: para limpiar las cuentas usar los controles de borrado del backoffice.

Los archivos de medios publicados se registran en la cola de eliminación cuando se borra una cuenta; `npm run maintenance` completa su limpieza. Los archivos originales de `test-data/personas` permanecen intactos.

## Operación

`TEST_USERS_ROOT` permite configurar otra ruta de biblioteca. En Docker se monta `test-data/personas` como volumen de solo lectura; los archivos de usuario no se empaquetan en la imagen. `TEST_USERS_ENABLED=true` habilita la creación en producción/staging; en desarrollo está disponible. La limpieza de cuentas permanece operativa incluso si se deshabilitan nuevas altas.

El worker se inicia con `npm run dev` y `npm start`. Las cuentas usan Better Auth y contraseñas reales aleatorias, cifradas para su exportación con una clave derivada de `BETTER_AUTH_SECRET`. No reciben correo externo, no tienen roles administrativos ni respuestas automáticas. Se identifican con «Prueba».

`npm run test:folders` prueba una biblioteca temporal pequeña, actualización incremental, estabilidad de credenciales, permisos, propiedad de contenidos, vista móvil y borrado general conservando perfiles reales. Se debe ejecutar antes de crear una población activa; se niega a modificar un lote de carpetas existente. Las pruebas no envían correo.
