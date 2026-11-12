> 🎙 **Nuevo modo de voz continua (experimental v1.0):** pulsa una sola vez **Iniciar conversación continua** en Microsoft Edge. La aplicación detecta turnos hablados, transcribe con OpenAI, interpreta pedidos con la IA y responde por voz antes de escuchar el siguiente turno. No usa Twilio.  
> [**Ver guía paso a paso y limitaciones**](docs/CONVERSACION_CONTINUA_EDGE_V10.md) · Rama `dev/handsfree-browser-v1.0`.
>
# OrderVoice AI — Starter v0.1

> **¿Vas a instalar OrderVoice AI en Windows o en una computadora del laboratorio?** Sigue la **[Guía de instalación paso a paso para v0.6](docs/GUIA_INSTALACION_WINDOWS.md)**: programas que debes descargar, instalación con `npm.cmd`, modo demostración sin claves y opciones de Ollama y telefonía.
>
> **Aviso:** el texto siguiente documenta principalmente la versión inicial **v0.1**. Para la rama actual **dev/v0.6** y sus funciones telefónicas, consulta la guía anterior y los archivos de `docs/`.

Prototipo local para una pizzería ficticia. Permite conversar por chat, dictar frases con el micrófono del navegador, calcular un carrito con precios controlados por el servidor y confirmar pedidos que se guardan **solo en este navegador**.

> No recibe llamadas telefónicas. No se conecta a una cocina ni envía pedidos reales. No almacena datos personales de clientes. No sirve todavía para uso comercial.

## 1. Requisitos

- Windows 10/11, macOS o Linux
- Node.js 20.9 o superior (recomendado instalar la versión LTS actual de https://nodejs.org/)
- Visual Studio Code
- Conexión a Internet para instalar paquetes
- Chrome o Edge para intentar usar dictado (la compatibilidad de Web Speech API varía)

Abre una terminal de PowerShell en la carpeta `ordervoice-ai-starter` donde está `package.json`.

```powershell
node --version
npm --version
npm install
npm run dev
```

Abre http://localhost:3000 . Si el puerto 3000 está ocupado, Next.js puede elegir otro: revisa la terminal.

**Importante:** Ejecuta `npm install` en la misma carpeta donde se encuentra `package.json`.

## 2. Prueba sin pagar una API (modo demo)

Sin configurar nada, el sistema reconoce frases simples:

- `Quiero dos pepperoni familiares y una hawaiana mediana`
- `Agrega una gaseosa`
- `Quita una pepperoni familiar`
- `Confirmo el pedido`

El modo demo no es IA real: usa reglas limitadas. Los botones `+` del menú también sirven para probarlo.

## 3. Activar interpretación con IA real (opcional)

1. Crea una clave de API en tu cuenta de OpenAI Platform. La API tiene facturación propia, separada de una suscripción a ChatGPT.
2. Copia `.env.local.example` y renombra la copia `.env.local`.
3. Coloca la clave solamente ahí:

```env
OPENAI_API_KEY=tu_clave_privada
OPENAI_MODEL=gpt-5.6-terra
```

4. Reinicia el servidor: Ctrl+C y `npm run dev`.
5. Envía un mensaje. El indicador cambiará de MODO DEMO a IA ACTIVADA después de la primera respuesta.

Nunca subas `.env.local` a GitHub. Nunca pongas la clave dentro del código del navegador.

**Si aparece error 500:** revisa la clave, saldo y acceso de tu cuenta al modelo seleccionado; revisa la terminal del servidor.

## 4. ¿Por qué los precios no los inventa la IA?

El modelo devuelve una **intención estructurada** (añadir, quitar, confirmar, preguntar) y los IDs solicitados. `order-engine.ts` valida que cada ID exista en `menu.ts`, las cantidades sean válidas, y calcula el total de forma determinista en centavos.

- Menú: `src/lib/menu.ts`
- Motor de pedidos: `src/lib/order-engine.ts`
- Integración API de IA: `src/app/api/chat/route.ts`
- Interfaz del cliente + panel: `src/app/page.tsx`
- Estilos: `src/app/globals.css`

## 5. Limitaciones de seguridad antes de usarlo con clientes reales

- El carrito llega desde el navegador. Aunque se sanea y se recalcula, no hay **sesiones autenticadas de servidor** para evitar duplicados/repeticiones de confirmación desde clientes maliciosos.
- Los pedidos se guardan en `localStorage` y **no son visibles por otros dispositivos ni personal de cocina**.
- El motor de interpretación puede equivocarse con frases ambiguas. Se necesitan pruebas y mejor gestión de contexto multi-turno.
- No hay autenticación, multi-tenancy, rate limiting, control de costos de IA, inventario, impuestos, delivery, direcciones ni procesamiento de pagos.
- La transcripción por Web Speech API depende del navegador y en algunos casos envía audio a servicios externos. No es una solución telefónica profesional.
- En producción se requiere base de datos, validación integral, consentimiento/avisos de privacidad aplicables, auditoría, políticas de retención de datos y transferencia a operadores humanos.

## 6. Próximos pasos

1. Supabase Postgres: restaurantes, menús, sesiones, pedidos y líneas de pedido; permisos RLS por restaurante.
2. Backend: idempotencia en confirmaciones, precios/versionado, impuestos, zonas de entrega, stock, límites de uso.
3. Voz profesional con OpenAI Realtime API por WebRTC.
4. Llamadas con un proveedor SIP/telefónico y transferencia al humano.
5. Panel en vivo con roles y estados de preparación, y piloto supervisado.

## Arquitectura propuesta

```text
Cliente (chat / navegador con micrófono / futuro teléfono)
        ↓
Frontend Next.js  →  API Next.js (/api/chat)
                         ├─ OpenAI (interpretación estructurada)
                         ├─ Motor determinista de pedidos
                         └─ Futuro Supabase Postgres
                                    ↓
                         Panel / pantalla de cocina
```
