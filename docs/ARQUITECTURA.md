# Arquitectura y roadmap técnico — OrderVoice AI

## Alcance del MVP v0.1

Una sola pizzería de ejemplo, sin autenticación, con menú fijo. El navegador representa al cliente y al panel del restaurante a la vez. Se puede escribir o dictar una frase; la API la interpreta por reglas (modo demo) o por OpenAI (cuando exista `OPENAI_API_KEY`). El backend valida cambios al carrito y **calcula el dinero sin intervención del modelo**. El pedido confirmado se guarda en `localStorage` para la demostración.

## Flujo de datos

```text
[Usuario] → [Página Next.js: /]
      ├─ texto o SpeechRecognition (solo navegador)
      ├─ POST /api/chat {message, cart, history}
      │    ├─ interpretar con reglas u OpenAI Structured Outputs
      │    ├─ validar IDs y cantidades: order-engine.ts
      │    ├─ total exacto en centavos: menu.ts
      │    └─ devolver {reply, cart, order?, mode}
      └─ presentar respuesta, carrito y pedidos confirmados (localStorage)
```

## Capas de la aplicación

- Presentación: `src/app/page.tsx`, `src/app/globals.css`.
- API backend: `src/app/api/chat/route.ts`.
- Dominio: `src/lib/menu.ts`, `src/lib/order-engine.ts`.
- Integración futura: OpenAI Realtime, telefonía SIP, Supabase, facturación.

El objetivo es **una única lógica de pedidos** reutilizable por chat, web, WhatsApp y teléfono, sin acoplarla al proveedor de voz.

## Modelo de base de datos planeado (no implementado todavía)

- `restaurants`: id, nombre, dirección, zona horaria, estado.
- `restaurant_members`: user_id, restaurant_id, role.
- `products`: id, restaurant_id, nombre, descripción, activo.
- `product_variants`: id, product_id, nombre/tamaño, precio_centavos, activo.
- `calls`: id, restaurant_id, provider_call_id, inicio, fin, estado.
- `order_sessions`: id, restaurant_id, channel, version, status, expiration.
- `orders`: id, restaurant_id, session_id, customer_phone (si procede), status, total_centavos, idempotency_key.
- `order_items`: id, order_id, product_variant_id, quantity, unit_price_centavos, subtotal_centavos.
- `events/audit_logs`: entidad, acción, id, fecha, actor.

Los precios se capturarán al crear el pedido para conservar el precio histórico aunque cambie el menú. Las operaciones de confirmación deberán ser transaccionales, idempotentes y verificadas en servidor. En Supabase tendremos que habilitar y probar RLS por `restaurant_id` y roles apropiados.

## Límites de confianza

- El frontend no es fuente de verdad. Datos de carrito provenientes del navegador no se consideran confiables.
- El LLM **no** es fuente de precios, inventario, horarios, descuentos o disponibilidad.
- La API key de OpenAI siempre se guarda del lado servidor y jamás se publica en Git.
- Para producción: validar entradas en backend, autenticación, autorización, sesiones de servidor, límites de tasa, antifraude, protección de información personal, avisos de privacidad y escalamiento a personas.
- No confirmar pagos ni pedidos de clientes reales hasta tener integración transaccional y operación supervisada.

## Siguientes entregas sugeridas

### v0.2 — Supabase
- Esquema SQL, autenticación para restaurante, políticas de acceso y persistencia real.
- Confirmación con idempotencia, validaciones del lado servidor, precios confiables.

### v0.3 — Voz nativa
- Conversación de baja latencia mediante Realtime API, interrupciones y contexto.
- La IA solicita funciones al backend; nunca escribe pedidos por su cuenta.

### v0.4 — Telefonía y piloto
- Proveedor de números/SIP, número del local, rutas de respaldo, transferencias a humanos, pruebas de ruido/acento.
- Métricas: precisión por producto, pedidos confirmados, llamadas derivadas, latencia, costo/minuto.

### v1.0 — Multi-restaurante
- Onboarding de locales, menús independientes, roles, facturación y métricas por cliente.
