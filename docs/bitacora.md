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

## Estado honesto

El código se ha publicado en una rama de implementación. Las pruebas diseñadas no equivalen a pruebas **ejecutadas**. Registrar aquí posteriormente la salida real de `npm run typecheck`, `npm run test:monolith` y `npm run test:monolith:http`, fechas, commit SHA y cualquier defecto reproducido.

No registrar llamadas reales, cobros, restaurantes reales, ni entrevistas que no se realizaron. No subir `.env.local`, credenciales ni datos personales.
