# Preparación para crecimiento

## Estado actual

La fuente de datos es PostgreSQL, con autenticación Better Auth y API en Next.js. Ver [POSTGRESQL.md](POSTGRESQL.md) para arranque, pruebas, permisos y limitaciones. El adaptador IndexedDB anterior queda aislado para compatibilidad y pruebas.

- Feed por cursor `(createdAt, id)` e índices cronológicos; los archivos se solicitan por URL.
- Likes, comentarios y guardados en tablas separadas; autor y fecha determinados por el servidor.
- Sesiones, perfiles, preferencias, matches, conversaciones y mensajes persistentes.
- Historias con caducidad controlada por consultas del servidor.
- Medios fuera de las tablas, actualmente en disco persistente del servidor; validación y lectura por permisos.
- Reproducción de videos cerca del viewport con coordinación de una sola reproducción activa.

## Antes de escalar

No se garantiza capacidad para miles o millones de usuarios sin medir. Usuarios registrados, activos y concurrencia son dimensiones diferentes.

1. Medir WebSockets y su fanout con carga real; ajustar la arquitectura según resultados. Lectura y escritura ya están implementadas. Ya no hay consultas periódicas de novedades del chat.
2. Completar paginación de catálogo, perfiles, comentarios e historias y virtualización del DOM del feed.
3. Sustituir disco local por almacenamiento de objetos y CDN cuando se requieran varios nodos.
4. La cola de validación/transcodificación, miniaturas, cuotas y limpieza ya está implementada. Medir workers y añadir formatos adaptativos cuando se necesiten.
5. Añadir caché, réplicas o feed materializado solo cuando las mediciones lo justifiquen.
6. Los bloqueos, reportes, backoffice y límites de API ya existen. Validar políticas operativas y entregabilidad con tráfico real.
7. Healthcheck y respaldo/restauración local están preparados. Configurar alertas externas, retención y respaldos automatizados en el servidor final; ver PRODUCTION.md.

## Validación antes de anunciar capacidad

Preparar conjuntos de publicaciones, usuarios y medios con distribución realista. Medir latencias p50/p95/p99, rendimiento, errores, memoria, conexiones y procesamiento de medios con cargas graduales. Probar sesiones prolongadas, pérdidas de conexión, cambios de cursor y despliegues durante tráfico. Establecer capacidad solo después de medir la infraestructura desplegada; no extrapolar la compilación local.
