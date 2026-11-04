# Operación y despliegue de CliKiss

## Estado verificado localmente

PostgreSQL, cuentas confirmadas, recuperación, chat WebSocket, mapas/Places/radar, backoffice y TOTP funcionan en el entorno local. Mailjet aceptó un único correo real de prueba. Esto confirma aceptación SMTP, no recepción en bandeja de entrada.

`npm run dev` y `npm start` inician web, WebSockets y procesador de video. Mantener los tres procesos activos. `npm run dev:qa` reemplaza SMTP por Mailpit únicamente para pruebas automatizadas: antes de ejecutar las integraciones, detener el servidor normal e iniciar este modo. Evita enviar sus correos temporales mediante SMTP externo.

## Administración

1. Registrar y confirmar la cuenta habitual en la web.
2. Con acceso al servidor, ejecutar `npm run staff:grant -- correo@dominio.com admin`.
3. Abrir `/admin` e introducir la contraseña para configurar una aplicación autenticadora TOTP. Guardar los códigos de recuperación fuera del servidor.

Roles disponibles: `admin`, `moderator`, `support`, `none`. Support consulta usuarios/reportes; moderator modera publicaciones/reseñas y suspende usuarios sin rol; admin consulta auditoría y cambia roles. Los cambios requieren motivo y se registran. La suspensión revoca sesiones. En producción el panel exige TOTP por defecto. El alta de roles no tiene un endpoint público de bootstrap.

En **Usuarios**, DataTables proporciona búsqueda, ordenación, filtros de rol/estado/confirmación de correo y paginación procesados en PostgreSQL (10, 25, 50 o 100 filas). Solo `admin` puede registrar cuentas, editar nombre/correo/ubicación/género/biografía y cambiar contraseñas. Los formularios validan también en el servidor, detectan correos duplicados y rechazan ediciones de versiones antiguas. Las cuentas nuevas completan su perfil y fecha de nacimiento al entrar. Confirmar un correo manualmente requiere verificar su titularidad; el equipo conserva siempre correo confirmado.

El cambio de contraseña conserva el segundo factor, guarda únicamente el hash, revoca todas las sesiones y los enlaces de recuperación pendientes y termina las videollamadas activas. Cambiar el correo o retirar su confirmación también revoca sesiones. Los cambios quedan en auditoría sin contraseñas ni hashes. Si un administrador cambia su propia contraseña/correo debe iniciar sesión de nuevo. No se necesita una migración adicional para estas operaciones. `npm run test:admin-users` verifica la API y los formularios en escritorio y móvil usando cuentas temporales y servicios locales.

## Confirmación de correo al registrarse

En `/admin` → **Configuración**, un administrador puede cambiar **Exigir verificación de correo**. La migración `015_registration_settings.sql` conserva activada la verificación de forma predeterminada. La configuración se guarda en PostgreSQL, se comparte entre procesos y se aplica sin reiniciar la aplicación.

La migración `016_registration_email_policy.sql` guarda en cada cuenta la política vigente al registrarse. Desactivada: los registros nuevos entran automáticamente y conservan ese acceso aunque después se active el switch. Activada: los registros nuevos deben confirmar el correo. Desactivarla posteriormente no exime a cuentas que se registraron con verificación obligatoria. El correo no se marca falsamente como confirmado. HTTP, chat, WebSocket y videollamadas respetan la política individual. El equipo del backoffice siempre requiere correo realmente confirmado. Al migrar, las cuentas existentes conservan la exención si la configuración está desactivada en ese momento.

La migración `017_preserve_existing_registration_exemptions.sql` recupera también las exenciones anteriores cuando el historial auditado muestra que la cuenta se creó con el switch apagado, aunque actualmente esté encendido. No modifica cuentas registradas después de aplicar la política individual.

El cambio queda en auditoría. Si otra sesión modificó la configuración mientras la pantalla estaba abierta, se pide actualizar antes de guardar para no sobrescribirla.

Después de subir esta versión al servidor, aplicar `npm run db:migrate` **dentro del servicio app de tu Compose de producción** antes de recrearlo. En el despliegue Clouding existente:

```sh
docker compose -p clikiss --env-file .env.production -f compose.clouding.yaml build app
docker compose -p clikiss --env-file .env.production -f compose.clouding.yaml run --rm --no-deps app npm run db:migrate
docker compose -p clikiss --env-file .env.production -f compose.clouding.yaml up -d --no-deps --force-recreate app
```

Pruebas locales: `npm run test:settings` y, con `npm run dev:qa` para aislar el correo en Mailpit, `npm run test:settings:browser`. La segunda prueba crea cuentas temporales y restaura el valor original de la política; no se debe ejecutar en producción.

Los formularios de acceso usan validación propia por campo, sin avisos nativos de HTML5, y el servidor valida también nombre, correo y contraseña. Un registro con correo existente lleva a login conservando ese correo y limpiando la contraseña. Login distingue correo inexistente, contraseña incorrecta y cuenta con acceso social. El limitador de solicitudes de Better Auth se mantiene. `npm run test:auth:browser` comprueba estos flujos con una cuenta temporal local en escritorio y móvil.

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
