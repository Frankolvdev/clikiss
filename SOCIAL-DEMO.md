> Documento histórico de la primera demo. El almacenamiento local y las cuentas simuladas descritas aquí ya no se usan. Consultar [POSTGRESQL.md](POSTGRESQL.md) para la implementación vigente.

# Perfiles sociales de Conecta

Esta implementación funciona en el navegador como demostración, sin cuentas reales ni servidor de archivos.

## Probar publicaciones e historias

1. Abre **Mi perfil → Mi perfil social**.
2. Cambia la foto de perfil y la portada con los botones de cámara.
3. Selecciona una foto (hasta 8 MB) o un video MP4/WebM (hasta 25 MB), agrega una descripción y publica.
4. Activa **Historia · 24 h** para publicar contenido temporal. Las historias dejan de mostrarse a las 24 horas.
5. Reabre el perfil o recarga la página: el contenido se conserva en IndexedDB. Borrar los datos del sitio elimina también los archivos.

Los nombres y enlaces **Ver perfil, fotos e historias** abren los perfiles desde Descubrir, Aventura, likes y conversaciones. Los perfiles de demostración empiezan sin publicaciones sociales.

La tercera experiencia **Momentos** reúne las publicaciones de los perfiles guardados en este navegador, ordenadas de más reciente a más antigua. Incluye filtros de fotos, videos y guardados, historias activas y enlaces a los perfiles. El menú lateral conserva el nombre **Descubrir**.

**Publicar** y el botón **+** de **Tu historia** abren un formulario independiente del perfil. Se pueden seleccionar hasta diez archivos para publicar historias consecutivas. Si ya tienes historias activas, tocar tu círculo las reproduce y el botón **+** agrega otra.

## Reproducir historias

- Cada persona tiene un círculo que reúne sus historias. Se abre la primera sin ver, o la primera si ya se vieron todas.
- Dentro de cada persona se reproducen de más antigua a más reciente. Al terminar se avanza a la siguiente persona; al terminar la última se cierra el visor y se vuelve al feed.
- Las fotos duran cinco segundos. Los videos avanzan según su tiempo de reproducción y terminan al finalizar el video.
- Las barras superiores muestran el progreso. Mantener pulsado pausa; tocar un video alterna pausa y reproducción. Hay botones para pausar, silenciar, avanzar y retroceder.
- Se puede deslizar horizontalmente para navegar, deslizar hacia abajo para cerrar o usar flechas del teclado. Escape cierra. Cambiar de pestaña pausa la reproducción.
- Cerrar el visor desde Descubrir vuelve al feed. Solo tocar el nombre o avatar del encabezado abre el perfil.
- Las historias expiran después de 24 horas y sus archivos siguen siendo locales. Las historias propias también pueden eliminarse desde el visor.

## Interacciones del feed

Las publicaciones admiten likes, doble toque en fotos para dar like, comentarios y eliminación de comentarios propios, y guardados. Estas interacciones se conservan en IndexedDB. **Guardados** filtra las publicaciones marcadas por el usuario de demo. Compartir utiliza el diálogo del sistema si admite archivos; en otros navegadores descarga el archivo.

En Aventura, pulsar la tarjeta abre el perfil; el botón **Conversar** abre el chat. El perfil social ocupa casi toda la ventana en escritorio y toda la pantalla en móvil.

## Probar reseñas por invitación

1. Inicia al menos una conversación con un perfil de demo.
2. En **Mi perfil**, activa **Disponible en Aventura**.
3. Abre **Mi perfil social → Reseñas**.
4. Selecciona una persona de tus conversaciones y confirma el encuentro no comercial para habilitar una invitación.
5. **Probar como invitado (demo)** permite simular la escritura de una reseña; queda identificada como reseña de prueba.

Cada invitación autoriza una reseña para su destinatario. Una invitación pendiente puede revocarse. Las reseñas publicadas no pueden editarse o eliminarse por el dueño del perfil. Reportar solo marca una reseña para revisión local; no contacta a un equipo de moderación.

La invitación no verifica que un encuentro ocurrió. Los permisos en el cliente son parte de la simulación, no una medida de seguridad de producción.

## Para pasar a producción

Se necesitan autenticación, autorización y validación en el servidor, almacenamiento de archivos, cuotas y validación del contenido, cuentas separadas, entrega de invitaciones, moderación y caducidad de historias en el servidor. Actualmente no se comparte contenido entre dispositivos o personas.

## Verificación

```sh
npm run build
npm test
```

Las 19 pruebas cubren historias, invitaciones, migración de archivos, paginación, concurrencia, proporciones de medios, interacciones, selección de video visible y persistencia de la preferencia compartida de audio. No sustituyen las pruebas de carga y reproducción de archivos en un navegador.

## Optimización del feed

Las publicaciones se cargan por páginas de 12. Los archivos están separados de los metadatos y se cargan cuando se acercan a la pantalla; se liberan al alejarse. Solo se reproduce un video visible, inicialmente sin sonido. Abrir un modal u ocultar la pestaña pausa el video. Los formatos habituales llenan el encuadre con recorte moderado si hace falta; proporciones extremas se muestran completas con bandas.

La migración a la versión 2 de IndexedDB preserva tus datos locales. Consulta **SCALING.md** para la preparación implementada y los servicios pendientes antes de atender usuarios reales.

El perfil utiliza el mismo encuadre adaptable del feed. El audio comparte una única preferencia entre videos: al activar o silenciar uno, la elección se aplica a los demás y se guarda en el navegador. La reproducción automática con sonido también depende de los permisos del navegador.
