# OrderVoice AI v0.8 · Micrófono → transcripción → pedido → respuesta hablada

**Rama experimental:** `dev/browser-stt-v0.8` (conserva `dev/v0.6` y `dev/browser-voice-v0.7`).  
**Sin llamadas a Twilio ni túnel ngrok:** todas las pruebas se hacen desde **http://localhost:3000** en Microsoft Edge.

## ¿Qué cambia?

Ahora existen **dos formas de hablar** desde la web:

1. **Conversación por voz de Edge (anterior):** el propio navegador convierte voz → texto. No usa la API de OpenAI para transcribir. La respuesta se lee mediante las voces españolas de Windows/Edge.
2. **Grabar con transcripción OpenAI (nueva, opcional):** el micrófono graba unos segundos con `MediaRecorder`; al pulsar **Detener y transcribir**, la grabación se envía al servidor local y se transcribe mediante **`gpt-transcribe`**; el texto aparece en la pantalla, se envía al mismo motor de pedidos y la respuesta se lee con la voz de Edge. Este paso **sí consume créditos OpenAI**.

En ambos casos, el motor de pedidos puede seguir en **`demo`** o usar **Ollama local**, según `ORDERVOICE_PROVIDER`. Si eliges `ORDERVOICE_PROVIDER=openai`, la interpretación del pedido también consume créditos de OpenAI. La voz hablada de esta prueba es **la voz del navegador**, no un audio generado por la API de voz de OpenAI.

## ¿Qué hay que instalar?

- **No hace falta ninguna dependencia npm adicional.** El proyecto ya tiene Next.js, Node.js y la integración con OpenAI.
- Microsoft Edge y un micrófono que funcione en Windows.
- Una **API key existente de OpenAI Platform**, solo si decides activar la transcripción mejorada (guardar exclusivamente en `.env.local`).

No instales Python, Whisper, ngrok ni Twilio para esta prueba de transcripción.

## 1. Descargar la nueva versión

En VS Code, en `ordervoice-ai-starter` (la carpeta que contiene `package.json`):

```powershell
git fetch origin
git switch -c dev/browser-stt-v0.8 --track origin/dev/browser-stt-v0.8
npm.cmd ci
```

Si esa rama ya está creada en tu computadora, en lugar de `git switch -c`:

```powershell
git switch dev/browser-stt-v0.8
git pull origin dev/browser-stt-v0.8
```

La rama `main` no se modifica.

## 2. Activar transcripción de OpenAI (requiere créditos)

Abre **`.env.local`** y añade estas líneas (sin repetir `OPENAI_API_KEY` si ya existe):

```dotenv
ORDERVOICE_PROVIDER=demo
ORDERVOICE_BROWSER_STT_PROVIDER=openai
OPENAI_API_KEY=TU_CLAVE_PRIVADA_GUARDADA
```

**Explicación de cada variable:**

- `ORDERVOICE_PROVIDER=demo`: el motor interpreta pedidos con reglas locales sin gastar créditos de texto. Alternativa gratuita más inteligente: `ORDERVOICE_PROVIDER=ollama`, si Ollama está instalado y funcionando.
- `ORDERVOICE_BROWSER_STT_PROVIDER=openai`: habilita **solo** la transcripción del micrófono web por API.
- `OPENAI_API_KEY`: clave privada para la API de transcripción. **No la escribas en la conversación, GitHub ni capturas**.

**Importante:** `.env.local` NO debe publicarse en GitHub. Deja la transcripción deshabilitada (`ORDERVOICE_BROWSER_STT_PROVIDER` ausente) cuando no la estés probando, para evitar gastos accidentales.

## 3. Verificar tipos y pruebas gratuitas

```powershell
npm.cmd run typecheck
npm.cmd run test:orders
npm.cmd run test:dialogue
npm.cmd run test:fast
npm.cmd run test:browser:voice
```

Estas pruebas no transcriben grabaciones reales y no gastan créditos de API.

## 4. Abrir la web en Edge

```powershell
npm.cmd run dev
```

Abre la dirección `http://localhost:3000` (o el puerto indicado por Next.js).

En la web aparecerán los botones:

- **🎧 Iniciar conversación por voz**: reconocimiento del navegador (anterior).
- **🎙 Grabar con transcripción OpenAI**: grabación con API (nuevo).

El segundo funciona **solo** cuando configuras la variable y una clave API válida. No pulsa botones de Twilio ni usa minutos de llamadas.

## 5. Probar un pedido nuevo

1. Comprueba que el servidor está activo y que ves «Panel de pruebas · v0.8 transcripción».
2. Pulsa **🎙 Grabar con transcripción OpenAI** y autoriza el micrófono.
3. Di: «Quiero una pizza de pepperoni familiar».
4. Pulsa **■ Detener y transcribir**. Hay un límite automático de **18 segundos** para evitar grabaciones largas.
5. Verás **Texto reconocido por la API** y el pedido que interpretó el motor; escucharás la respuesta usando la voz española de Edge.
6. Pregunta «¿En cuánto va la cuenta?» grabando otra frase y verifica que el total siga siendo USD 14,00.
7. Prueba «No, mejor cámbiala por una hawaiana mediana» y comprueba que el carrito cambie a USD 10,00.

**Para encontrar errores con mayor seguridad:** marca **«Revisar y corregir el texto antes de enviarlo al motor»**. Al acabar de transcribir, el texto aparecerá en el campo de mensaje para corregirlo antes de pulsar **Enviar**. De esa forma puedes comparar lo escuchado con lo transcrito antes de cambiar el carrito.

## Seguridad, privacidad, costos y limitaciones

- **La grabación se envía a OpenAI** para transcripción; no se guarda un archivo de audio permanente en el servidor.
- La clave API nunca se envía al navegador, permanece en `.env.local` del servidor.
- Esta función está **desactivada por defecto** y restringida a **localhost**, para no habilitar una API de transcripción abierta detrás de ngrok.
- El navegador puede depender de permisos, dispositivos de audio y conexión a Internet.
- Una transcripción más precisa **no elimina todos los errores**. Para frases dudosas usa la opción de revisión manual.
- La respuesta hablada se genera con **`speechSynthesis` de Edge**, sin costo de API de voz; las voces pueden variar según Windows.
- El saldo de Twilio **no se consume**; OpenAI cobra la transcripción y, si escoges `ORDERVOICE_PROVIDER=openai`, también el procesamiento del texto.
- Si aparece HTTP 503 «Transcripción desactivada», revisa `ORDERVOICE_BROWSER_STT_PROVIDER` y reinicia Next.js. Si aparece 401/429, revisa la clave, permisos y créditos.
- Si necesitas una voz de OpenAI en vez de la voz del navegador, es **otra integración TTS** con costos adicionales que todavía no forma parte de esta prueba.

Referencias técnicas: https://developers.openai.com/api/docs/guides/speech-to-text y https://platform.openai.com/pricing/
