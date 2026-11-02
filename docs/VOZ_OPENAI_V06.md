# OrderVoice AI v0.6 — Voz femenina de OpenAI para llamadas (piloto local)

Esta versión mantiene el motor de pedidos de la v0.5 (reglas + Ollama) y la
integración telefónica de Twilio. Añade opcionalmente una voz femenina en
español latinoamericano con **OpenAI (Coral)**.

La voz de OpenAI es **optativa y facturable por uso**. Si no se activa,
si no hay saldo, si falla la API o si el tiempo de respuesta excede el límite,
la llamada utiliza el método `<Say>` existente de Twilio.

## Antes de empezar

- No publiques `.env.local`, tu `OPENAI_API_KEY`, tu Auth Token ni la URL
  privada de modo trial (contiene `trial_key=`).
- Mantén Next.js en el puerto 3000 y ngrok conectado al mismo puerto.
- No modifiques `TWILIO_AUTH_TOKEN`, `TWILIO_PUBLIC_BASE_URL` ni
  `TWILIO_TRIAL_WEBHOOK_SECRET` si las llamadas ya funcionan.
- Ollama puede seguir siendo el motor de pedidos:
  `ORDERVOICE_PROVIDER=ollama`.
- La voz OpenAI **no elimina** los costes o minutos gratuitos limitados de Twilio.
- Se avisa al interlocutor de que la voz se genera con IA.

## 1. Activar únicamente la voz

Obtén una **API key de OpenAI Platform** y guárdala solamente en
`ordervoice-ai-starter/.env.local`. Agrega las siguientes líneas:

```dotenv
OPENAI_API_KEY=TU_CLAVE_PRIVADA_DE_OPENAI
ORDERVOICE_TTS_PROVIDER=openai
ORDERVOICE_TTS_TIMEOUT_MS=3200
```

No actives `ORDERVOICE_PROVIDER=openai` salvo que también quieras
cambiar el **cerebro** del proyecto: la v0.6 solo necesita OpenAI
para generar la voz.

Si solo deseas restaurar la voz antigua, cambia:

```dotenv
ORDERVOICE_TTS_PROVIDER=twilio
```

**Reinicia** Next.js después de modificar `.env.local`.

## 2. Escuchar una muestra corta en tu computadora

Ejecuta dentro de `ordervoice-ai-starter`:

```powershell
npm run test:voice
Invoke-Item .next\ordervoice-voz-openai-v06.wav
```

**Este test utiliza la API una sola vez y gasta una pequeña cantidad de créditos**,
pero **no realiza llamadas ni consume minutos de Twilio**. Si se agota el saldo,
revisa la respuesta HTTP y las credenciales; no compartas tu clave.

## 3. Comprobar las llamadas sin generar audio facturable

Con Next.js y ngrok activos, usa:

```powershell
npm run test:phone
npm run test:trial
```

Estas pruebas usan un encabezado de diagnóstico después de validar la autenticación
y omiten la generación de OpenAI, por lo que no consumen créditos de voz.

## 4. Probar una llamada real

1. Mantén ngrok y Next.js funcionando.
2. En **Twilio → Try out Voice → Start a call → Custom**, conserva la URL
   privada que ya funcionaba en la versión v0.5 (contiene `trial_key=`).
3. Pulsa **Start call** solo una vez.
4. Después del mensaje Trial en inglés deberías oír el saludo en español.
5. En el panel de ngrok, al reproducir OpenAI debería aparecer un
   `GET /api/telephony/audio?id=...` con HTTP 200, además del POST telefónico.
6. Si no aparece ningún GET de audio, revisa la terminal de Next.js:
   un aviso de fallback significa que la API falló, alcanzó su límite de
   espera o todavía no está habilitada.

La v0.6 genera **PCM16 mono 24 kHz** con OpenAI; lo convierte a **WAV mono
8 kHz**, filtra las frecuencias altas y ajusta el volumen para uso telefónico.
Twilio reproduce ese archivo con `<Play>`. Nunca se envía la clave API a Twilio,
al navegador ni a GitHub. El identificador del audio es aleatorio y caduca en
5 minutos. Esta caché en memoria está diseñada para **un solo proceso local**;
para desplegar en varios servidores se necesita almacenamiento compartido.

Se limita a **50 solicitudes y 12 000 caracteres por ejecución de Next.js**
como medida auxiliar de consumo. **No es un tope económico garantizado**:
reiniciar el servidor restablece estos límites. Utiliza también los límites
de gasto del panel de OpenAI.

## 5. Limitaciones y próximos pasos

- La voz puede mejorar claridad y nivel, pero el volumen final depende
  también del teléfono y de la red de Twilio.
- Generar audio puede añadir latencia. Tras 3,2 s (configurable hasta 4,5 s),
  se usa automáticamente el `<Say>` anterior.
- El texto hablado se envía a OpenAI cuando habilitas la voz. Usa el sistema
  solo con participantes informados y evita datos personales innecesarios.
- **Importante (1 nov 2026):** OpenAI anunció que
  `gpt-4o-mini-tts` dejará de funcionar el **6 enero 2027**.
  La arquitectura de largo plazo debe migrar a `gpt-realtime-2.1-mini`
  usando Realtime, no la ruta `/v1/audio/speech`.
- El modo trial con `trial_key` sirve exclusivamente para una demostración
  privada. Al terminar las pruebas, cambia
  `TWILIO_TRIAL_MODE=disabled` y reinicia Next.js.
