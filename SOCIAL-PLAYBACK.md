# Reproducción social y avatares

Los videos del feed y del perfil comparten un coordinador: reproduce un solo video principal visible, pausa los anteriores y limita la reproducción al diálogo abierto cuando corresponde. El sonido mantiene la preferencia compartida. Una interrupción de `play()` durante un desplazamiento no se interpreta como una pausa manual. Las políticas del navegador pueden exigir silenciar una reproducción automática.

Los avatares de video son clips MP4 silenciosos de hasta tres segundos, 320 × 320 y 12 fps. Se generan con FFmpeg, tienen un máximo de 250 KB y conservan una portada WebP. Los cuatro perfiles importados pesan entre 36 y 45 KB por clip. Solo se cargan/reproducen cuando están visibles y se pausan al ocultar la página; se respeta la preferencia de movimiento reducido. El video original no se modifica para convertirlo en avatar.

Al subir un video como avatar desde el perfil se utiliza la cola de medios existente y se asigna al terminar. Para los cuatro perfiles importados anteriormente se ejecutó `node scripts/backfill-avatar-loops.mjs`; puede repetirse sin duplicar los clips existentes. Las migraciones 008 y 009 añaden la referencia de animación y limpian las leyendas visibles de la población de pruebas. La pertenencia interna a pruebas y las credenciales permanecen intactas.

Los carruseles de historias conservan desplazamiento táctil, navegación por flechas y ajuste a las tarjetas sin una barra de desplazamiento visible. El contacto desde Momentos respeta la disponibilidad directa del perfil, sin exigir estar en Aventura; los perfiles de Conexiones siguen requiriendo un match y muestran la explicación dentro del perfil.

`npm run test:social-playback` valida en navegador local autoplay al desplazarse, sonido compartido, reproducción dentro del perfil, contacto directo desde Momentos, proporciones del avatar de chat, carrusel, animaciones y subida de avatar en video. Crea y elimina una cuenta temporal verificada directamente en la base local; no envía correos. Requiere la población local y los procesadores activos.
