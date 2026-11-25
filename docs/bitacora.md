# Bitácora del Criterio 2 · OrderVoice AI

Proyecto individual · Arquitectura de Software · RdA 1 · Semana 5.
**Rama:** `dev/criterio2-monolito`. Se conserva `main` y `dev/handsfree-browser-v1.0` sin sobrescribirlos.

Los drivers provienen de la entrega del Criterio 1:
- CU-01: agregar pepperoni familiar; R-01 y QA-04 (total exacto).
- CU-02: cambiar pepperoni familiar por hawaiana mediana; R-02 y QA-04.
- CU-03: consultar el total USD 10,00 sin cambiar el carrito; QA-04.
- CU-04: confirmar solo con intención explícita; R-06 y QA-04.
- QA-05: proteger secretos y entradas; QA-08: separar proveedor de voz del motor de pedidos.

| Fecha | Incremento / driver | Archivos modificados | Prueba/evidencia | Resultado y pendientes |
|---|---|---|---|---|
| 24/11/2026 | Diseño del monolito PostgreSQL; CU-01 a CU-04 y persistencia | `sql/001_monolito.sql`, `scripts/db-init.mjs` | Esquema revisado en código; migración repetible prevista | Pendiente ejecutar en PostgreSQL del estudiante |
| 24/11/2026 | Capas estrictas presentación → aplicación → persistencia; QA-04 | `src/presentation/http.js`, `src/application/domain.js`, `src/application/monolith-service.js`, `src/persistence/postgres.js` | Se construyeron transacciones, parámetros SQL y reglas 1–20 unidades | Pendiente pruebas de integración |
| 24/11/2026 | APIs HTTP propias: clientes, productos, sesiones, pedidos | `src/app/api/clientes`, `productos`, `sesiones`, `pedidos`, `salud` | Contrato y controladores implementados | Pendiente comprobar peticiones HTTP reales |
| 24/11/2026 | Voz sin interpretación externa; QA-08 | `src/app/api/chat/route.ts`, `src/app/page.tsx` | Solo se conserva OpenAI para voz a texto; pedidos se validan localmente y se persisten en PostgreSQL | Revisar calidad del parser ante frases complejas |
| 24/11/2026 | Contrato API; obligación Criterio 2 | `docs/openapi.yaml` | Métodos, esquemas, casos de error y ejemplos documentados | Contrastar mediante pruebas HTTP |
| 24/11/2026 | Automatización de éxitos/errores, Criterio 2 | `tests/monolith.test.mjs`, `scripts/smoke-monolith.mjs`, workflow GitHub Actions | Casos CU-01..CU-04, entradas inválidas, confirmaciones duplicadas | **No declarar aprobado** hasta obtener resultado de terminal o CI |
| 24/11/2026 | Reproducibilidad y exposición | `docs/GUIA_C2_EXPOSICION.md`, `README.md` | Pasos y demostración desde navegador/PowerShell | Grabar evidencias después de ejecutar correctamente |

| 25/11/2026 | Evidencia real en pgAdmin, CU-01..CU-04 | PostgreSQL local / capturas de pedido y línea | Ejecutadas en PC del estudiante: `npm run typecheck`, 10 pruebas de monolito, 35 antiguas pruebas de plan y HTTP/PostgreSQL; pedido confirmado de USD 10,00 visible en SQL | **Comprobado en entorno local antes de simplificación**; prueba HTTP muestra persistencia real |
| 25/11/2026 | Limpieza de rama y alineación estricta con Criterio 2 | Retiro de 44 archivos históricos: Twilio, Ollama, IA externa de interpretación, pruebas antiguas; simplificación de `src/app/page.tsx` y `README.md` | CI de GitHub Actions realiza typecheck, pruebas, build y PostgreSQL HTTP | Conservadas las ramas anteriores; pendiente validar cambios finales locales |
| 25/11/2026 | Capas y límites de proveedor más claros | `src/application/conversation.ts`, `src/app/api/chat/route.ts` | Chat sin servicio externo de razonamiento; reglas en aplicación y SQL solo en repositorio | Reprobar en interfaz y actualizar SHA final tras CI |
| 25/11/2026 | Ayuda para la exposición | `docs/PREPARACION_EXPOSICION.md` | Explicación de APIs, tres capas, transacciones y preguntas del profesor | Guion disponible para repasar |
| 25/11/2026 | Verificación final en el equipo del estudiante; CU-01..CU-04, QA-04 | Sin modificaciones al código de negocio: pruebas de la rama `dev/criterio2-monolito` | `npm.cmd test` finalizó sin errores; servidor Next.js iniciado; `npm.cmd run test:monolith:http` mostró ambos mensajes `OK` y un ID de pedido; en pgAdmin se consultaron tres pedidos confirmados y sus tres líneas de pizza hawaiana mediana por USD 10,00 | **Comprobado localmente:** rutas HTTP, PostgreSQL y errores controlados 422/409. Falta comprobar una prueba real del micrófono y la transcripción si se desea mostrar voz. |

## Estado de verificación para la entrega

- **Confirmado en el equipo del estudiante (25/11/2026):** los comandos de pruebas locales terminaron sin errores; el servidor inició; la prueba de integración `npm.cmd run test:monolith:http` aprobó los cuatro casos de uso, CRUD de productos/clientes, validaciones 422/409 y chat con intérprete local persistente. Las consultas ejecutadas en pgAdmin devolvieron pedidos y líneas guardadas en PostgreSQL.
- **No verificado en esta revisión:** el flujo completo de micrófono, red y transcripción OpenAI en tiempo real; también se debe revisar el estado de GitHub Actions en la pestaña Actions antes de afirmar que CI pasó.
- **Alcance:** pizzería ficticia y datos de prueba; sin cobros, llamadas telefónicas ni integración con una cocina real.
- **Reproducibilidad:** mantener privado el archivo `.env.local`; compartir con el docente la rama `dev/criterio2-monolito`, el commit de entrega y las instrucciones del README.

No subir `.env.local`, contraseñas, tokens ni datos personales.
