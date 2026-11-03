# PostgreSQL en Conecta

El backend está en el mismo proyecto Next.js. PostgreSQL es la fuente de datos del sistema y Better Auth administra cuentas, contraseñas y sesiones persistentes en esa base. El SDK de Supabase fue retirado. La aplicación ya no utiliza IndexedDB/localStorage para perfiles, conversaciones, mensajes, posts, invitaciones o reseñas. Solo permanecen preferencias de interfaz, audio e historias vistas en el navegador.

## Arranque local

Requisitos: Node y dependencias del proyecto, Docker con motor Linux encendido.

```sh
npm run db:setup
npm run db:up
npm run db:migrate
npm run dev
```

`db:setup` genera contraseñas aleatorias y la clave de sesiones en `.env.local`, sin mostrarlas. Conserva una configuración existente. No copies `.env.example` antes de ejecutarlo: ese archivo es una referencia con valores vacíos.

PostgreSQL 17 se publica únicamente en `127.0.0.1:25432`. Se eligió ese puerto para no interferir con otras instalaciones. El volumen Docker `conecta_postgres` conserva los datos. `npm run db:stop` detiene el servicio sin borrar el volumen. No uses `docker compose down -v` si quieres conservar la base.

`db:migrate` crea las tablas oficiales de la versión instalada de Better Auth y después aplica las migraciones SQL versionadas, con bloqueo, checksum y transacción por migración. No modifica ni elimina tablas existentes de otros proyectos. No editar una migración que ya fue aplicada: crear la siguiente.

## Datos y autorización

- `server/db.ts`: pool compartido, límites de conexión y tiempo de consulta.
- `server/auth.ts`: Better Auth, contraseñas de al menos 12 caracteres, cookies de sesión y OAuth opcional.
- `server/profiles.ts`: perfiles, preferencias, likes, pases y matches reales por interés mutuo.
- `server/messages.ts`: autorización por participantes, mensajes idempotentes y últimos 50 mensajes. Admite cursor temporal `before`; queda pendiente conectarlo al desplazamiento del chat.
- `server/social.ts`: posts, historias con caducidad en servidor, feed por cursor, reacciones y comentarios.
- `server/reviews.ts`: invitaciones ligadas a conversaciones, una reseña por invitación y reportes.
- `server/media.ts`: validación de formato/tamaño, archivos fuera de `public`, permisos de lectura y solicitudes Range para video.

Las rutas `/api/v1/*` validan la sesión en servidor para las escrituras y rechazan orígenes ajenos. Las consultas usan parámetros; el cliente no decide el autor ni los permisos. PostgreSQL debe permanecer privado: esta implementación usa autorización en los servicios del backend, no permite acceso directo desde el navegador ni depende de políticas RLS de Supabase.

Tablas adicionales de roles de personal y auditoría están preparadas; el backoffice no está construido aún.

## Fotos y videos

PostgreSQL guarda referencias, autor y metadatos. Los archivos se almacenan en `MEDIA_ROOT`, por defecto `.data/media`. Hacer respaldo independiente del directorio. Es un adaptador inicial para un servidor persistente, no para disco efímero/serverless ni múltiples nodos. Antes de escalar, sustituirlo por almacenamiento de objetos, procesamiento y CDN. El feed y las historias reciben URLs, sin descargar toda la galería como Blobs.

## Proveedores sociales

Configurar las variables privadas de `.env.example` para cada proveedor. Callback de Better Auth:

```text
https://DOMINIO/api/auth/callback/google
https://DOMINIO/api/auth/callback/facebook
https://DOMINIO/api/auth/callback/apple
https://DOMINIO/api/auth/callback/microsoft
```

Sin credenciales, esos proveedores no están habilitados. Registro e inicio de sesión por correo/contraseña funcionan con PostgreSQL local. Confirmación y recuperación ya están implementadas por SMTP; en desarrollo se usa Mailpit. Configurar SMTP real antes de producción. Ver ACCOUNT-CHAT-MAPS.md.

## Pruebas

Con la aplicación local encendida:

```sh
npm run test:postgres
npm test
npm run build
```

La integración crea dos cuentas temporales y prueba registro, sesión, perfiles, matches, mensajes sin duplicados, archivos, feed, likes, propiedad de comentarios/publicaciones, reseñas por invitación y revocación de sesión. Limpia solo las cuentas y archivos creados por esa ejecución. Se niega a ejecutarse contra un host que no sea local.

## Estado y siguientes pasos

El cambio conecta el flujo actual con PostgreSQL; no certifica capacidad para millones de usuarios. El chat recibe avisos por WebSockets y recupera historial al reconectar; incluye estados de lectura y escritura, avisos e historial paginado. Hay backoffice por roles, TOTP, auditoría, bloqueos desde UI, límites de abuso de API en PostgreSQL, cuotas, limpieza y procesamiento de medios. Se verificaron restauración aislada y una prueba breve de concurrencia. Catálogo y perfiles aún tienen límites iniciales de lectura; faltan paginación completa y mediciones de carga representativas. Los likes del feed indican el estado propio; falta el contador global. Ver [PRODUCTION.md](PRODUCTION.md) para configuración y pendientes externos.

## WebSockets

`npm run dev` y `npm start` ejecutan Next.js y el proceso WebSocket del mismo repositorio. `npm run realtime` sirve para iniciar únicamente este último. Aplicar las migraciones antes de arrancar. El proceso escucha por defecto en `127.0.0.1:3001`. En desarrollo el navegador usa `ws://localhost:3001/realtime`; en producción usa `wss://DOMINIO/realtime`. Para otro puerto/dominio configurar también `NEXT_PUBLIC_REALTIME_URL` antes de compilar.

Cada conexión obtiene por HTTP un pase de un solo uso, válido 30 segundos y ligado a la sesión. Viaja en el encabezado de subprotocolo WebSocket, no en la URL. El servidor valida origen y sesión, consume el pase atómicamente y selecciona los destinatarios según los participantes y bloqueos en PostgreSQL. No permite que el cliente elija salas o identidades. Comprueba la sesión antes de entregar cada aviso y cada 20 segundos; cerrar sesión en el navegador desmonta su conexión.

PostgreSQL `LISTEN/NOTIFY` comunica eventos confirmados a los procesos WebSocket. Los avisos contienen identificadores, no textos de mensajes. La API autorizada sigue siendo la vía de escritura e historial. Los avisos no son una cola durable: al conectar, recuperar la conexión o volver a la pestaña, se sincroniza el historial desde PostgreSQL. El cliente reconecta con espera progresiva, sin consultar mensajes cada cinco segundos.

Para Ubuntu con Nginx, dentro del servidor HTTPS que ya redirige el resto de peticiones a Next.js:

```nginx
location /realtime {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header Origin $http_origin;
    proxy_read_timeout 75s;
}
```

No registrar encabezados de subprotocolo, cookies o pases en logs. La conexión `LISTEN` debe ser directa o usar un pool en modo sesión, nunca un pool transaccional. El proceso requiere un servidor persistente que acepte upgrades WebSocket; no puede alojarse como una función HTTP efímera. En varios nodos, cada proceso escucha el mismo canal y atiende sus propias conexiones. A gran escala hay que medir el fanout y el coste de las comprobaciones antes de elegir otra capa de mensajería.

`npm run test:realtime` requiere los servicios locales activos. Prueba autenticación, origen, pases de un uso/caducados, entrega entre participantes, aislamiento de una tercera cuenta, recuperación del historial e invalidación de sesión; elimina solo sus cuentas temporales.

El contenido antiguo de IndexedDB no se importa automáticamente ni se asigna a cuentas nuevas. Se conserva `app/legacy-social-store.ts` únicamente para compatibilidad y pruebas del formato antiguo; no está conectado a la aplicación. Si es necesario conservar contenido de pruebas, preparar una importación explícita con revisión de autoría. Los perfiles ficticios no se convierten en usuarios reales.

En Ubuntu se pueden usar los mismos comandos de Docker o una instancia PostgreSQL existente con su `DATABASE_URL`. Ajustar `APP_URL`, HTTPS, secretos, volumen de archivos y respaldos; usar un rol de ejecución con privilegios mínimos y reservar las credenciales DDL para migraciones.

La implementación de cuentas, chat y mapas se documenta en [ACCOUNT-CHAT-MAPS.md](ACCOUNT-CHAT-MAPS.md).
