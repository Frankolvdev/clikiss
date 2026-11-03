# Operación y despliegue de Conecta

## Estado verificado localmente

PostgreSQL, cuentas confirmadas, recuperación, chat WebSocket, mapas/Places/radar, backoffice y TOTP funcionan en el entorno local. Mailjet aceptó un único correo real de prueba. Esto confirma aceptación SMTP, no recepción en bandeja de entrada.

`npm run dev` y `npm start` inician web, WebSockets y procesador de video. Mantener los tres procesos activos. `npm run dev:qa` reemplaza SMTP por Mailpit únicamente para pruebas automatizadas: antes de ejecutar las integraciones, detener el servidor normal e iniciar este modo. Evita enviar sus correos temporales mediante SMTP externo.

## Administración

1. Registrar y confirmar la cuenta habitual en la web.
2. Con acceso al servidor, ejecutar `npm run staff:grant -- correo@dominio.com admin`.
3. Abrir `/admin` e introducir la contraseña para configurar una aplicación autenticadora TOTP. Guardar los códigos de recuperación fuera del servidor.

Roles disponibles: `admin`, `moderator`, `support`, `none`. Support consulta usuarios/reportes; moderator modera publicaciones/reseñas y suspende usuarios sin rol; admin consulta auditoría y cambia roles. Los cambios requieren motivo y se registran. La suspensión revoca sesiones. En producción el panel exige TOTP por defecto. El alta de roles no tiene un endpoint público de bootstrap.

## Accesos sociales

Completar las variables privadas `GOOGLE_CLIENT_ID/SECRET`, `FACEBOOK_CLIENT_ID/SECRET`, `APPLE_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET` de `.env.example`; registrar las aplicaciones correspondientes y permitir sus callbacks:

```text
https://DOMINIO/api/auth/callback/google
https://DOMINIO/api/auth/callback/facebook
https://DOMINIO/api/auth/callback/apple
https://DOMINIO/api/auth/callback/microsoft
```

Apple requiere generar su client secret firmado y renovarlo antes de que expire. La clave Maps es independiente de OAuth. Reiniciar la aplicación tras configurar variables. Los proveedores no configurados no se ofrecen como accesos funcionales. La autorización externa completa queda pendiente de esas credenciales y de la configuración de cada proveedor.

## Archivos y trabajos

Por defecto se usa `.data/media`, que debe ser persistente. Para S3 o un servicio compatible configurar `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` y, si corresponde, `S3_ENDPOINT`/`S3_FORCE_PATH_STYLE`. Mantener el bucket privado: los archivos pasan por autorización del servidor. Cambiar el backend no migra archivos existentes; copiarlos conservando sus claves antes de activar el bucket. S3 externo y CDN no se probaron sin una cuenta configurada.

Imágenes: validación real, eliminación de metadatos, WebP hasta 1920 px y miniatura. Videos: cola PostgreSQL con bloqueo de trabajos, FFmpeg H264/AAC/faststart y miniatura; no se publican hasta estar listos. Límite de entrada 8 MB para imagen, 25 MB para video; salida de video hasta 50 MB. Cuota predeterminada 500 MB por cuenta configurable con `MEDIA_QUOTA_MB`. Son límites iniciales, no un servicio de streaming adaptativo HLS.

Ejecutar `npm run maintenance` periódicamente: limpia pases y señales caducadas, contadores antiguos, publicaciones expiradas/eliminadas y medios huérfanos con más de 24 horas. Los contenidos reportados se conservan. Las eliminaciones de objetos se reintentan mediante una cola durable.

## Ubuntu con Docker y Nginx

Copiar `.env.example` a `.env.production`, llenar valores reales y limitar sus permisos a `600`. Usar una contraseña PostgreSQL larga alfanumérica (o codificada para URL), un `BETTER_AUTH_SECRET` aleatorio y `APP_URL=https://DOMINIO`. Configurar SMTP, Maps y proveedores deseados. Las variables públicas Maps se incorporan al compilar.

```sh
docker compose --env-file .env.production -f deploy/compose.production.yaml build
docker compose --env-file .env.production -f deploy/compose.production.yaml up -d database
docker compose --env-file .env.production -f deploy/compose.production.yaml run --rm --no-deps app npm run db:migrate
docker compose --env-file .env.production -f deploy/compose.production.yaml up -d app
```

Adaptar `deploy/nginx.conf.example` al dominio y certificado TLS reales. Solo Nginx debe ser público; PostgreSQL y puertos de aplicación quedan privados. No publicar Mailpit. No se ha desplegado ni construido la imagen Docker en un servidor remoto durante esta sesión.

Para otorgar el rol en Docker ejecutar el comando `staff:grant` dentro del contenedor app. Programar mantenimiento diario mediante cron/systemd ejecutando `docker compose ... exec -T app npm run maintenance` con las rutas absolutas del despliegue. El worker de video se inicia junto con la aplicación; no requiere cron.

## Respaldos y observación

En desarrollo: `npm run backup:local` guarda dump PostgreSQL, archivos locales y manifiesto en `.backups/`. `npm run test:restore` restaura un dump en una base temporal aislada, comprueba tablas y elimina solo esa copia. No sobrescribe la base activa.

En producción programar `pg_dump -Fc` del servicio database y respaldo del volumen media a almacenamiento externo cifrado. El script `backup:local` apunta específicamente al compose local; no usarlo como respaldo del servidor de producción. Si se usa S3, activar versionado y retención con el proveedor. Definir retención y ensayar recuperación de base y archivos juntos antes del lanzamiento. La copia con escritura activa no garantiza un punto idéntico entre dump y archivos: para recuperación consistente pausar publicaciones/subidas durante la copia o configurar snapshots coordinados/PITR.

`GET /api/health` comprueba conexión PostgreSQL y devuelve 200/503 sin datos privados. Docker incluye healthcheck y reinicio del proceso si termina; un estado unhealthy por sí solo no reinicia el contenedor. Configurar un monitor externo con alertas y revisar logs con `docker compose ... logs --tail 100 app`. Vigilar CPU, memoria, disco, conexiones PostgreSQL, trabajos atascados y entregabilidad de correo; no registrar cookies, enlaces de recuperación ni secretos. El monitor externo y la programación de respaldos requieren el servidor real.

## Comprobaciones

Con `dev:qa` y servicios Docker locales activos:

```sh
npm test
npm run test:postgres
npm run test:features
npm run test:realtime
npm run test:admin-media
npm run test:browser
npm run test:restore
npm run test:load
npm run lint
npm run build
```

La prueba de carga es un smoke test local de 120 peticiones y concurrencia 8; no certifica capacidad para miles o millones de usuarios. Antes de anunciar capacidad se necesitan datos representativos y pruebas graduales en el servidor final, incluyendo WebSockets, uploads y colas. Ver `SCALING.md`.
