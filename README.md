# OrderVoice AI · Criterio 2 — Monolito en capas

Proyecto **individual** de Arquitectura de Software (PUCE). Prototipo de una pizzería ficticia. Rama de entrega: **`dev/criterio2-monolito`**. Entrega por Moodle: enlace GitHub + rama y SHA del commit. **Fecha límite: jueves 26/11/2026, 13:30 (Ecuador).**

## Qué se entrega

Un **único monolito Next.js (Node.js + TypeScript)** con operaciones HTTP propias, PostgreSQL local y reglas de negocio locales. Los principales casos de uso son:

| Caso | Operación | Resultado |
|---|---|---|
| CU-01 | Agregar pepperoni familiar | Carrito con USD 14,00 |
| CU-02 | Cambiar por hawaiana mediana | Carrito con USD 10,00 |
| CU-03 | Consultar total sin modificar | USD 10,00 |
| CU-04 | Confirmar expresamente | Pedido guardado en PostgreSQL, sin duplicados |

**OpenAI es opcional y únicamente se usa para transcribir voz a texto.** La interpretación de pedidos, las APIs REST, el cálculo de precios y la base de datos son propios. La voz de salida utiliza la síntesis de Edge. **No** se usan Twilio, Ollama ni la API de OpenAI para interpretar pedidos.

## Preparación en Windows con VS Code y PostgreSQL 18

1. Instala Node.js (versión 20.9 o superior), PostgreSQL y pgAdmin.
2. En pgAdmin crea la base local `ordervoice_db`. No hace falta crear tablas a mano.
3. En PowerShell, dentro de la carpeta que contiene `package.json`:
   ```powershell
   npm.cmd install
   ```
4. Crea `.env.local` a partir de `.env.local.example`, con tu propia contraseña local:
   ```dotenv
   DATABASE_URL=postgresql://postgres:TU_PASSWORD@localhost:5432/ordervoice_db
   ORDERVOICE_BROWSER_STT_PROVIDER=disabled
   ```
   Para habilitar voz, cambia la variable a `openai` y configura `OPENAI_API_KEY` en privado. Si la contraseña de PostgreSQL tiene símbolos reservados de URL, deben codificarse.
5. Crea las tablas y carga siete productos de prueba:
   ```powershell
   npm.cmd run db:init
   ```
6. Ejecuta pruebas unitarias y revisión de TypeScript:
   ```powershell
   npm.cmd test
   ```
7. Inicia el sistema:
   ```powershell
   $env:NODE_USE_SYSTEM_CA="1"
   npm.cmd run dev
   ```
   Abre **http://localhost:3000**.
8. En **otra terminal** de VS Code, con Next.js abierto, ejecuta:
   ```powershell
   npm.cmd run test:monolith:http
   ```

La prueba HTTP crea **datos ficticios** en PostgreSQL. No toca pedidos reales ni consume OpenAI.

## Arquitectura obligatoria

```text
Usuario / navegador
   → PRESENTACIÓN  src/app/page.tsx + src/app/api/**/route.ts
   → APLICACIÓN    src/application/* + src/lib/{order-engine,pizza-dialogue,fast-intents,...}
   → PERSISTENCIA  src/persistence/postgres.js
   → PostgreSQL    seis tablas (sql/001_monolito.sql)
```

`src/presentation/http.js` reúne la validación HTTP y conecta la capa de aplicación con el repositorio PostgreSQL. Los controladores HTTP no incluyen consultas SQL. `src/application/monolith-service.js` valida productos y cantidades y ejecuta transacciones. `src/application/conversation.ts` organiza el flujo del diálogo sin llamar a OpenAI.

## Documentos exigidos por rúbrica

- [Contrato API OpenAPI 3.0](docs/openapi.yaml) — rutas, cuerpos, respuestas, errores.
- [Arquitectura y trazabilidad de casos de uso](docs/ARQUITECTURA_C2.md).
- [Guía reproducible para el jueves](docs/GUIA_C2_EXPOSICION.md).
- [Preguntas y guion para defender el monolito](docs/PREPARACION_EXPOSICION.md).
- [Bitácora de incrementos y cambios](docs/bitacora.md).
- [Pruebas de dominio](tests/monolith.test.mjs) y [prueba REST + PostgreSQL](scripts/smoke-monolith.mjs).
- [Validación automática GitHub Actions](.github/workflows/criterio2-monolito.yml).

Los módulos históricos de telefonía, IA externa para razonamiento y pruebas experimentales **no están en esta rama académica**, pero se conservaron en `dev/handsfree-browser-v1.0` y otras ramas anteriores. `main` no se modificó.

## Límites de la demostración

- Sistema educativo para **una pizzería ficticia**: sin autenticación comercial, pagos, reparto ni clientes reales.
- La API local acepta operaciones únicamente en `localhost`. No debe desplegarse públicamente sin autenticación, controles de acceso y medidas de seguridad adicionales.
- La voz es opcional; la evaluación REST y PostgreSQL funciona sin conexión con APIs externas.
- El parser local reconoce productos del menú base (siete productos); la API de catálogo puede administrar más productos, pero no se han entrenado expresiones de voz para los nuevos.
- No incluir `.env.local`, claves API ni contraseñas en GitHub, capturas o entregas.
