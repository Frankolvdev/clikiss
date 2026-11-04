# Videollamadas 1 a 1 de ClicKiss

## Arquitectura y capacidad

WebRTC lleva audio/video entre navegadores con DTLS-SRTP. ICE intenta conexión directa y usa Coturn solo si es necesario. No hay SFU, transcodificación ni grabación. La cámara tiene techo de 1280×720 y 30 FPS; el envío comienza limitado a 1.5 Mbps de video y adapta a 480p/360p o solo audio. El navegador también aplica su propio control de congestión. Apagar cámara detiene la pista y libera el dispositivo.

Las invitaciones, SDP e ICE se autorizan mediante HTTP con la sesión existente. PostgreSQL notifica al **WebSocket existente** que hay novedades; los SDP/candidatos se recuperan por HTTP y nunca pasan por `NOTIFY` ni por frames WebSocket. Esto respeta el límite de 1 KB del canal existente y su protocolo de solo lectura. Un sondeo de respaldo permite recuperar eventos perdidos. No se registran SDP, IP de candidatos, audio ni video en logs. Los SDP/ICE son datos temporales de negociación: se eliminan al terminar y caducan después de tres minutos.

Cada usuario tiene una reserva única en PostgreSQL, independientemente de si llama o recibe. El bloqueo de admisión es transaccional y compartido entre procesos. Se comprueba conversación existente, correo confirmado, bloqueo y suspensión. Las pestañas tienen identificadores distintos; solo la que inició/aceptó envía señales o mantiene la llamada. Otra pestaña puede seguir usando el chat.

El valor inicial de `VIDEO_CALL_MAX_ACTIVE=20` es **un techo de seguridad configurable, no una capacidad certificada**. Se cuentan también invitaciones pendientes para no sobreasignar al aceptar. Las llamadas directas no consumen el presupuesto multimedia de TURN. No hay una cifra universal de llamadas para 2 vCPU/8 GB: intervienen tráfico disponible, proporción de TURN, otros proyectos y dispositivos. Para aumentar el máximo, medir y subir gradualmente el techo; no quitar todos los límites.

Antes de reservar se revisan CPU, memoria y, si se configura, tráfico real. El rechazo devuelve 503 con el texto:

> Las videollamadas no están disponibles en este momento. Puedes seguir escribiendo e intentarlo más tarde.

Se rechazan nuevas reservas; una reserva válida se puede aceptar aunque se llegue al techo posteriormente. No se interrumpen deliberadamente llamadas activas por carga. Una caída real de red/servidor puede afectarlas igualmente. Si TURN agota sus propios puertos/cuota o falla la conectividad, no se puede garantizar anticipadamente la conexión: se avisa del fallo y el chat sigue disponible.

## Variables de la aplicación

| Variable | Inicial | Uso |
| --- | --- | --- |
| `VIDEO_CALLS_ENABLED` | `true` | `false` impide nuevas llamadas. |
| `VIDEO_CALL_MAX_ACTIVE` | `20` | Cupos globales, incluidas invitaciones. Subir solo con mediciones. |
| `VIDEO_CALL_MAX_MINUTES` | `120` | Duración máxima, entre 1 y 120 minutos. |
| `VIDEO_CALL_CPU_LIMIT` | `0.90` | Umbral de CPU entre muestras; se considera host y cuota cgroup v1/v2. |
| `VIDEO_CALL_MIN_FREE_MB` | `384` | Memoria disponible mínima; host y límite cgroup v1/v2. |
| `VIDEO_CALL_NETWORK_MBPS` | `0` | Presupuesto de **entrada + salida** del host. 0 desactiva esta comprobación, no las demás. |
| `VIDEO_CALL_NETWORK_FRACTION` | `0.80` | Parte del presupuesto utilizable antes de pausar nuevas llamadas. |
| `VIDEO_CALL_NETWORK_INTERFACE` | vacío | Interfaz real del host, p. ej. `ens3`; obtener con `ip route`. |
| `STUN_URLS` | STUN de Google | Lista separada por comas; se puede usar el Coturn propio. |
| `TURN_URLS` | vacío | Ejemplo: `turn:turn.clikiss.com:3478?transport=udp,turn:turn.clikiss.com:3478?transport=tcp`. |
| `TURN_SHARED_SECRET` | vacío | Secreto aleatorio separado de Better Auth, compartido únicamente entre app y Coturn. |
| `VIDEO_CALLS_REQUIRE_TURN` | `true` en producción | Si falta TURN, mostrar no disponible. `false` solo para diagnosticar P2P. |
| `VIDEO_CALL_FORCE_RELAY` | `false` | `true` solo para probar TURN. Volver a `false` para maximizar conexión directa. |

Las credenciales entregadas al navegador están firmadas con HMAC y vinculadas a llamada y usuario; caducan al límite máximo de esa llamada más diez minutos. El secreto permanente no sale del servidor. Coturn no permite revocación inmediata de cada credencial REST al colgar: las cuotas y la caducidad acotan su uso.

## Despliegue en Clouding

No se dispone de acceso remoto al VPS en esta sesión. Estos comandos son para ejecutar en la carpeta de tu despliegue existente. **No ejecutar `down`, borrar volúmenes ni detener otros proyectos.** El archivo `compose.clouding.yaml` mencionado en la conversación no está en este repositorio: conservar el del servidor y sus puertos 5000/5001.

1. Subir código y migración `014_video_calls.sql`.
2. Añadir las variables al `.env.production` que ya carga `app`. `--env-file` por sí solo no inyecta todas las variables: comprobar `env_file`/`environment` en `compose.clouding.yaml`.
3. Compilar, migrar y recrear únicamente `app`:

```bash
docker compose -p clikiss --env-file .env.production -f compose.clouding.yaml build app
docker compose -p clikiss --env-file .env.production -f compose.clouding.yaml run --rm --no-deps app npm run db:migrate
docker compose -p clikiss --env-file .env.production -f compose.clouding.yaml up -d --no-deps --force-recreate app
```

El reinicio carga también el cambio del servidor WebSocket. No hay que abrir otro WebSocket, modificar la base de datos de otros proyectos ni cambiar `/realtime` en Nginx.

Si el proxy ya impone `Permissions-Policy: camera=(), microphone=()`, cambiar esas directivas a `camera=(self), microphone=(self)` conservando el resto. El ejemplo del repositorio no las bloquea. La web debe abrirse mediante HTTPS/WSS; `localhost` es la excepción usada por los navegadores para las pruebas.

### TURN: revisión antes de exponer puertos

El Compose independiente `deploy/compose.turn.yaml` **no se inicia automáticamente**. Antes de usarlo:

```bash
sudo ss -lntup
sudo ufw status numbered
ip -4 route
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

Confirmar que TCP/UDP 3478 y UDP 49160–49559 estén libres y permitidos en firewall del VPS y de Clouding; no reemplazar reglas existentes. Crear el registro DNS A `turn.clikiss.com` hacia la IPv4 pública, sin proxy HTTP/CDN. No anunciar AAAA si no se ha preparado IPv6. TURN es tráfico TCP/UDP y no se publica mediante un `location` HTTP de Nginx.

Añadir al `.env.production`:

```dotenv
VIDEO_CALLS_ENABLED=true
VIDEO_CALL_MAX_ACTIVE=20
TURN_REALM=turn.clikiss.com
TURN_PUBLIC_IP=REEMPLAZAR_IPV4_PUBLICA
TURN_SHARED_SECRET=REEMPLAZAR_POR_SECRETO_HEX_ALEATORIO
TURN_URLS=turn:turn.clikiss.com:3478?transport=udp,turn:turn.clikiss.com:3478?transport=tcp
STUN_URLS=stun:turn.clikiss.com:3478
VIDEO_CALL_FORCE_RELAY=false
TURN_TOTAL_QUOTA=120
TURN_BPS_CAPACITY=6250000
TURN_CPU_LIMIT=1.0
TURN_MEMORY_LIMIT=256m
```

Generar el secreto con `openssl rand -hex 32` y guardarlo solo en el entorno privado. No reutilizar ni cambiar las credenciales existentes. El ejemplo limita TURN a 6.25 MB/s por dirección y 400 KB/s por asignación; son límites independientes del techo de llamadas. Las asignaciones TURN no equivalen a llamadas: un navegador puede abrir varias. Ajustar presupuesto y cuotas con las métricas y pruebas reales, conservando margen para los otros proyectos.

**Solo después de confirmar puertos y firewall**, iniciar este servicio independiente:

```bash
docker compose -p clikiss-turn --env-file .env.production -f deploy/compose.turn.yaml up -d turn
```

El secreto no figura en la línea de comandos de `turnserver`; se escribe en un archivo temporal privado dentro del contenedor. La configuración bloquea destinos internos, multicast, CLI y retransmisión TCP entre pares. El cliente sí puede llegar a TURN sobre TCP o UDP. La imagen está fijada a Coturn 4.18.0-r0. No se guarda contenido multimedia.

Este perfil no habilita `turns:`. Para redes que solo admiten TLS/443 hace falta un perfil TURN TLS con certificado y un puerto/IP disponibles; **no ocupar el 443 de Nginx existente**. No afirmar conectividad universal con el perfil 3478.

### Medición de red del host

Dentro de un contenedor, `/proc/net/dev` mide su espacio de red y **no incluye automáticamente el contenedor TURN**. Para admitir según el tráfico completo del VPS, el override Linux `deploy/compose.call-metrics.yaml` monta solo tres contadores del host en modo lectura.

Una vez revisadas las rutas del host, recrear únicamente app añadiendo ese override a los comandos habituales:

```bash
docker compose -p clikiss --env-file .env.production -f compose.clouding.yaml -f deploy/compose.call-metrics.yaml up -d --no-deps --force-recreate app
```

Configurar `VIDEO_CALL_NETWORK_INTERFACE` con la interfaz pública real y `VIDEO_CALL_NETWORK_MBPS` con el presupuesto confirmado por Clouding para **tráfico agregado**. El primer muestreo no conoce la tasa todavía; requiere dos muestras separadas al menos cinco segundos. Si se dejan sin configurar, el panel muestra «Sin medir» y no se inventa una estimación. CPU/RAM y cupos siguen protegiendo la admisión.

## Operación

En `/admin`, Resumen muestra cupos, conexión directa/retransmitida, CPU, RAM y red. Las rutas directas/relay son telemetría de navegador, no una medición facturable ni un mecanismo de seguridad. El tráfico del host incluye otros proyectos y debe conservar margen para ellos.

Las invitaciones vencen a los 45 s; una negociación sin conexión vence a los 60 s; una llamada sin latido de cualquiera de los dos participantes caduca a los 75 s. Los dispositivos envían un latido cada 15 s. El cierre de pestaña intenta enviar un aviso inmediato; si no llega, se libera por vencimiento. Cambiar de red intenta reiniciar ICE dos veces antes de finalizar.

`npm run maintenance` limpia abandonos y conserva metadatos de llamadas terminadas durante siete días. Se almacenan participantes, conversación, fechas, estado y ruta declarada; no grabaciones. Los SDP/ICE se borran antes, como se indicó arriba.

Para pausar nuevas llamadas: `VIDEO_CALLS_ENABLED=false` y recrear solo `app`. No exige otro despliegue de código. Se mantienen los mensajes de texto.

## Pruebas

```bash
node --test scripts/video-calls.test.mjs
node scripts/test-video-calls.mjs
```

Para la prueba de retransmisión local, iniciar solo el fixture ligado a loopback y detenerlo al terminar:

```bash
docker compose -p clikiss-video-test -f deploy/compose.turn-test.yaml --profile video-test up -d turn-test
node scripts/test-video-calls.mjs --relay
docker compose -p clikiss-video-test -f deploy/compose.turn-test.yaml --profile video-test stop turn-test
```

`turn-test.conf` contiene credenciales ficticias y excepciones de loopback exclusivamente para esta prueba. No publicarlo en el VPS. La prueba sustituye únicamente la configuración ICE de sus propios navegadores para usar ese fixture; los endpoints de autorización y señalización siguen siendo reales.

La primera suite usa un esquema PostgreSQL temporal y comprueba sobreasignación concurrente, bloqueos, autorización, señales idempotentes, credenciales, límites y limpieza. La segunda usa cuatro contextos de navegador con cámara/micrófono sintéticos, uno con viewport móvil; establece dos llamadas simultáneas. Crea y elimina cuentas locales temporales sin enviar correos. No usarla contra producción.

### Resultados locales de esta implementación

- P2P: video remoto recibido y ruta `direct` confirmada en ambos extremos.
- TURN forzado: video remoto recibido y ruta `relay` confirmada en ambos extremos mediante el fixture Docker local.
- Dos llamadas simultáneas, aceptar/rechazar, ocupado, pestaña adicional, controles de cámara/micrófono, cambio de cámara, colgar y denegación de permisos: comprobados.
- Aviso de indisponibilidad y envío de un mensaje de texto con llamadas deshabilitadas: comprobados en navegador. El rechazo real por capacidad se comprueba en la suite PostgreSQL; no se provoca sobrecarga artificial del host.
- Reservas concurrentes, aislamiento, firma de credenciales y expiración/limpieza: comprobados con PostgreSQL local.
- Pruebas existentes de cuentas, recuperación, chat, WebSocket y ubicación: pasaron.
- Compilación de producción, TypeScript y ESLint: pasaron. Next.js emitió por separado un aviso de actualización de seguridad para la versión instalada; atenderlo antes del despliegue público.

Pendientes de infraestructura: dispositivos móviles físicos, dos redes externas, WSS del VPS, firewall/DNS TURN y carga real compartida con los otros proyectos. Dos llamadas locales no certifican veinte llamadas en Clouding.

Antes de abrir a usuarios: probar dos dispositivos físicos en redes diferentes, P2P, TURN forzado, móvil real, cambio de Wi-Fi/datos, cierre abrupto y llamadas simultáneas; observar recursos del VPS junto con los demás proyectos. Un viewport móvil y una prueba local no certifican esas condiciones. Subir `VIDEO_CALL_MAX_ACTIVE` por etapas tras medir, y mantener `VIDEO_CALL_FORCE_RELAY=false` en operación normal.

Referencias: [WebRTC ICE/TURN](https://webrtc.org/getting-started/turn-server), [configuración oficial de Coturn](https://github.com/coturn/coturn/blob/4.18.0/examples/etc/turnserver.conf), [control de bitrate y resolución](https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpSender/setParameters).
