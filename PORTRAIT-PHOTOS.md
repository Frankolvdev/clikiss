# Fotos verticales y foto de tarjetas

Aventura y Conexiones muestran imágenes en proporción **3:4**, con altura derivada del ancho en escritorio y móvil. Las tarjetas usan por defecto la foto del perfil; para imágenes se solicita el original optimizado y no la miniatura del avatar.

En **Mi perfil → Mi perfil social**, elegir una nueva imagen de avatar abre el editor vertical con zoom, arrastre y controles de posición accesibles. El encuadre inicial ya está preparado: se puede guardar directamente. Cancelar no sube archivos. Se aceptan imágenes de hasta 25 MB y 40 megapíxeles para el recorte local; el archivo resultante se limita a 1080 px de ancho y se vuelve a validar, optimizar y limpiar de metadatos en el servidor. Los videos de avatar conservan su flujo de procesamiento existente.

La sección **Foto para Aventura y Conexiones** permite subir otra imagen, con el mismo editor. Se guarda en `profiles.card_photo_id`, separada de `avatar_id` y `cover_id`. Ambas experiencias comparten esa foto. **Usar foto de perfil** pone a null únicamente `card_photo_id`, de modo que futuras modificaciones del avatar se reflejan automáticamente en las tarjetas mientras no haya una foto especial.

La API valida propiedad del archivo, estado ready y tipo de imagen. Una foto privada no se hace pública por conocer su ID; su lectura pública requiere que esté vinculada al perfil publicado y respeta bloqueos y suspensiones. La limpieza de medios conserva las fotos vinculadas a tarjetas. La migración 010 añade el campo sin cambiar las imágenes actuales.

`npm run test:portrait-photos` comprueba en navegador el recorte real y formato de salida, cancelación sin upload, foto independiente, permisos, restauración, proporciones de tarjetas en ambas experiencias y vista móvil. Crea y elimina una cuenta temporal local sin enviar correos. Requiere la plataforma local en ejecución y los perfiles locales existentes.
