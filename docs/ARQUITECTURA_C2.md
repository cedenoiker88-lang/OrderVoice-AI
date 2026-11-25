# Monolito en capas — OrderVoice AI (Criterio 2)

## Alineación con el Criterio 1

Casos de uso primarios acordados en RdA1: CU-01 añadir pepperoni familiar (USD 14,00); CU-02 cambiar por hawaiana mediana (USD 10,00); CU-03 consultar el total sin mutar; CU-04 confirmar explícitamente, sin pagos ni envío a restaurante real. Atributos QA-04 (integridad y totales), QA-05 (seguridad) y QA-08 (sustituibilidad) orientan los cambios.

## Arquitectura

```text
Cliente (interfaz / navegador / PowerShell)
   |
   v
PRESENTACIÓN
  src/app/api/**/route.ts        rutas Next.js (HTTP GET/POST/PATCH/DELETE)
  src/presentation/http.js       valida origen, JSON, errores y compone servicio
   |
   v
APLICACIÓN
  src/application/monolith-service.js  casos de uso y reglas
  src/application/domain.js            validaciones y errores de negocio
  src/lib/order-engine.ts              parser local de texto
  src/lib/pizza-dialogue.ts            diálogos / correcciones locales
   |
   v
PERSISTENCIA
  src/persistence/postgres.js       consultas SQL parametrizadas, BEGIN/COMMIT/ROLLBACK
   |
   v
Base PostgreSQL local
  clientes · productos · sesiones · sesion_items · pedidos · pedido_items
```

**Regla de dependencia:** los controladores invocan el servicio; el servicio recibe el repositorio mediante inyección; solo el repositorio conoce tablas y SQL. Ningún controlador escribe SQL ni consume una API de pedidos de terceros.

## Flujos observables, todos con persistencia

| Caso | Solicitud | Servicio/validación | SQL | Resultado |
|---|---|---|---|---|
| CU-01 | `POST /api/sesiones/{id}/items` | `addItem`, cantidad 1..20, producto activo | `sesion_items` | Carrito y total 1400 centavos |
| CU-02 | `PATCH /api/sesiones/{id}/items` | `replaceItem`, verificación de origen/destino | transacción de dos líneas | Carrito y total 1000 centavos |
| CU-03 | `GET /api/sesiones/{id}` | `getSession` | consulta `JOIN` | Total 1000, sin cambiar el carrito |
| CU-04 | `POST /api/sesiones/{id}/confirmar` con `{"confirmar":true}` | `confirmSession`, carrito no vacío, bloqueo `FOR UPDATE` | `pedidos` + `pedido_items` + estado de sesión | Pedido persistido; repetir da 409 |

## Decisiones importantes

- **Integridad:** `precioCentavos` se recibe solamente al crear/modificar un producto. En los carritos y pedidos el servidor lee precios desde PostgreSQL: jamás confía en precios enviados desde el navegador.
- **Atomicidad:** `withSession` inicia una transacción, bloquea la sesión, aplica las reglas y solo entonces guarda. Una excepción provoca `ROLLBACK`. La confirmación guarda precios históricos en `pedido_items` y una sesión no puede confirmarse dos veces.
- **Validación:** cantidades 1..20, identificadores y precios verificables. Endpoints académicos limitados a `localhost` para evitar acceso desde túneles públicos. En un sistema comercial haría falta autenticación, autorización por roles y más controles.
- **Voz permitida:** `/api/browser-transcribe` puede consumir OpenAI Speech-to-Text. **No** se utiliza OpenAI para interpretar pedidos ni para persistencia. Se reproduce la respuesta con la voz de Microsoft Edge.
- **Límite de alcance:** el intérprete local entiende el menú ficticio básico de siete productos. Nuevos productos registrados mediante API se gestionan vía CRUD/HTTP pero no se integran automáticamente al reconocimiento de frases libres. No afirmar que el prototipo conversa como un modelo generativo general.
- **Despliegue:** una sola aplicación Next.js y una base PostgreSQL local; no hay microservicios. La entrega se prueba en un equipo de desarrollo, no en un entorno de producción.

## Datos y rastreo

Diagrama lógico: `clientes` 1:N `sesiones`; `sesiones` 1:N `sesion_items`; `sesiones` 1:0..1 `pedidos`; `pedidos` 1:N `pedido_items`. `productos` se referencia desde las líneas. Las PK de sesiones, pedidos y clientes son UUID; el menú usa IDs de texto controlados.

Consulta la especificación exacta en `docs/openapi.yaml`, la guía reproducible en `docs/GUIA_C2_EXPOSICION.md`, las pruebas en `tests/monolith.test.mjs` y la bitácora en `docs/bitacora.md`.
