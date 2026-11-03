# Cuentas, chat y ubicación

## Confirmación y recuperación

Better Auth exige confirmar el correo antes de iniciar sesión con contraseña. El servidor también comprueba `emailVerified` para operaciones privadas y pases WebSocket, incluso si un proveedor social crea una sesión con email no verificado.

Registro → correo de confirmación → enlace → iniciar sesión. El modal permite reenviar confirmación. «¿Olvidaste tu contraseña?» envía un enlace de recuperación; la respuesta no indica si el correo existe. El enlace es temporal y de un solo uso. Al cambiar la contraseña se revocan las sesiones anteriores. El modal de nueva contraseña recibe el token en memoria y lo retira de la barra de direcciones.

El envío se hace por SMTP con Nodemailer. En desarrollo, `npm run db:up` inicia Mailpit junto a PostgreSQL. Su buzón está en **http://localhost:8025** y SMTP en `127.0.0.1:1025`. Captura correos localmente; no los entrega a direcciones externas. No publicar ese buzón en Internet.

En producción configurar en el servidor:

```env
SMTP_HOST=SERVIDOR_SMTP
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=USUARIO
SMTP_PASSWORD=SECRETO
MAIL_FROM=Conecta <cuentas@TU_DOMINIO>
```

Para SMTP con TLS desde el inicio, usar el puerto indicado por el proveedor, habitualmente 465, y `SMTP_SECURE=true`. Configurar dominio remitente y SPF/DKIM/DMARC según el servicio. Las credenciales no se incluyen en código ni se envían al navegador.

## Acceso social

Google, Facebook, Apple y Microsoft están preparados en Better Auth. El modal solo habilita proveedores con `CLIENT_ID` y `CLIENT_SECRET` configurados en las variables privadas de `.env.example`. Cada aplicación OAuth se registra con su proveedor y los callbacks documentados en [POSTGRESQL.md](POSTGRESQL.md). La clave de Google Maps NO sustituye las credenciales de Google OAuth. La autorización real de esos proveedores debe verificarse una vez configuradas las aplicaciones externas.

## Chat

- Nuevos mensajes, lecturas y escritura se notifican por WebSockets con control de participantes y sesión.
- El servidor persiste `read_at`; el cliente marca como leído al abrir la conversación con la ventana visible, enfocada y situada cerca del final.
- Las señales de escritura se limitan en el cliente y caducan en el servidor a los cinco segundos. No se transmiten borradores ni texto escrito.
- Historial por páginas de 50 con cursor `(created_at,id)`. Desplazarse arriba o «Ver mensajes anteriores» carga otra página y conserva la posición.
- Campana con conversaciones pendientes y contadores sin leer. Los avisos del navegador requieren permiso solicitado con un botón; funcionan mientras la aplicación está abierta. No se implementó Web Push para el navegador cerrado.
- Los avisos del sistema no muestran contenido de mensajes. No existe un indicador de presencia en línea ficticio.

## Mapas y radar

La clave entregada está solo en `.env.local` bajo `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Es una clave de navegador: Google la recibe al cargar su SDK; no es un secreto de servidor. El repositorio no contiene el valor.

En Google Cloud habilitar facturación y **Maps JavaScript API** y **Places API (New)**. Restringir la clave a esas APIs y a los sitios autorizados (incluido localhost para desarrollo). Crear un Map ID para producción y configurarlo en `NEXT_PUBLIC_GOOGLE_MAP_ID`; durante desarrollo se usa el identificador de ejemplo oficial. Los costes/cuotas se administran en Google Cloud. Esta sesión no verificó el acceso a la consola, facturación ni restricciones de esa cuenta.

Mapa/radar se carga solo al abrirlo. Incluye buscador de ciudades de Google Places, geolocalización voluntaria, radios de 2 a 200 km y perfiles cercanos. La búsqueda geográfica se ejecuta en PostgreSQL, no solo sobre el catálogo descargado. Respeta perfiles publicados, disponibilidad de Aventura y bloqueos. Los resultados geográficos se integran en las tarjetas de la vista actual.

«Mi zona» solicita permiso del navegador y redondea coordenadas a dos decimales antes de enviarlas. «Guardar mi zona y visibilidad» guarda el área aproximada y el consentimiento. Abrir el mapa o buscar no hace visible al usuario. El servidor vuelve a redondear la zona; no se publican coordenadas exactas. Solo perfiles con `radar_visible=true` aparecen. Desmarcar la opción y guardar oculta el perfil del radar.

No es seguimiento GPS ni ubicación en tiempo real. La precisión aproximada es del orden de un kilómetro y varía según la latitud. El radar es una vista visual de la búsqueda por distancia. Para grandes volúmenes valorar PostGIS e índices geoespaciales según mediciones; la consulta inicial limita resultados a 100.

## Verificación

```sh
npm run db:up
npm run db:migrate
npm run dev:qa
```

Con los servicios activos:

```sh
npm run test:features
npm run test:realtime
npm run test:postgres
npm test
npm run build
```

Las pruebas de integración usan cuentas temporales y el buzón local; usar `dev:qa` para aislar SMTP de cualquier servicio externo configurado. Comprueban confirmación, recuperación, revocación, mensajes leídos, escritura, paginación con fechas iguales y filtros/consentimiento/redondeo de ubicación. También se verificaron mapa, selección de Places y radar en navegador de escritorio y móvil con `npm run test:browser`. La geolocalización del dispositivo depende del permiso del usuario. No se han hecho pruebas de carga de producción. Ver [PRODUCTION.md](PRODUCTION.md).
