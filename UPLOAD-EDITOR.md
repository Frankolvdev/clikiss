El editor de subida se comparte entre Momentos y el perfil, tanto para historias como para publicaciones.

- Publicar sin editar centra y recorta las fotos a un cuadrado WebP de hasta 1080 px. El botón «Editar encuadre» permite arrastrar, ampliar y elegir cuadrado, vertical, historia u horizontal. El recorte se aplica a los píxeles antes de subir.
- Los videos conservan su duración completa. «Editar vista previa y portada» elige el comienzo de un bucle silencioso de hasta tres segundos y un fotograma de portada, o permite subir una portada independiente. El valor predeterminado es el inicio del video.
- La línea de tiempo muestra ocho miniaturas locales compartidas entre la selección de tres segundos y el selector de portada. La ventana se arrastra con ratón o con el dedo; los controles también permiten ajustar con el teclado. Si el navegador no puede extraer miniaturas, los selectores continúan disponibles.
- La migración 011 guarda las opciones en PostgreSQL. El procesador de video debe reiniciarse al actualizar. Limita los tiempos solicitados a la duración real y genera el bucle liviano y la portada; no recorta el video principal.
- Las publicaciones del perfil permiten dar y quitar me gusta, guardar y comentar, además de eliminar los comentarios propios. Las acciones requieren una cuenta y usan los mismos permisos y endpoints que el feed.

Verificación local: `node scripts/test-upload-editor.mjs`. Usa una cuenta temporal verificada sin SMTP y elimina sus registros y archivos al terminar.
