# Biblioteca local de personas de prueba

Cada carpeta corresponde a una ficha fija de `assets/test-users/population.json`:

```text
persona-0001/
  perfil.jpg
  publicacion/
    foto-01.jpg
    video-01.mp4
  historias/
    historia-01.jpg
```

Usa `persona-0001` a `persona-0500`. Coloca un único archivo `perfil` (JPG, PNG, WebP, AVIF, MP4 o WebM). Si el perfil es un video, se extrae su primer fotograma como foto fija. Las carpetas vacías permanecen pendientes y no crean usuarios.

Después de agregar carpetas o archivos, abre **Administración → Cuentas de prueba → Actualizar personas de prueba**. Se conservan los nombres, edades ficticias, ciudades y credenciales existentes. Solo se agregan personas o contenidos nuevos y se detectan archivos reemplazados. La ausencia de un archivo no elimina usuarios automáticamente.

Las imágenes y videos originales no se publican directamente ni se incluyen en Git. Se validan y procesan antes de mostrarse. Todos los datos del catálogo son ficticios, con edades asignadas entre 18 y 31 años; no representan los datos reales de las personas fotografiadas. Usa únicamente contenido de adultos autorizado para este entorno de pruebas.
