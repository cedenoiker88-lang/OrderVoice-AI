# Corrección de latencia y volumen de OrderVoice AI v0.6

## Qué ocurrió

En el diagnóstico real la API de síntesis de OpenAI agotó **25 000 ms**,
y Twilio reprodujo la voz básica de respaldo. Esa espera puede dar lugar
a pausas largas y diferencias de volumen.

Además, una transcripción como "pepperoni grande, familiar" incluía coma
y podía evitar el reconocimiento local rápido, causando una espera adicional
de Ollama.

## Modo rápido para la demostración

1. Actualiza la rama `dev/v0.6` con `git pull origin dev/v0.6`.
2. En `ordervoice-ai-starter/.env.local` agrega **solo una vez**:

   ```dotenv
   ORDERVOICE_PHONE_FAST_MODE=enabled
   ```

3. Mantén `ORDERVOICE_TTS_PROVIDER=openai` y las configuraciones de
   Twilio/ngrok que ya funcionan.
4. Reinicia Next.js en su terminal:

   ```powershell
   $env:NODE_USE_SYSTEM_CA="1"
   npm run dev
   ```

5. Mantén ngrok y Ollama encendidos.
6. Prueba sin llamadas ni nuevos créditos API:

   ```powershell
   npm run typecheck
   npm run test:phone:change
   npm run test:phone:fast
   ```

## Qué hace

- Las transcripciones de un único pedido que contienen coma,
  como "Quiero una pizza de pepperoni grande, familiar",
  se interpretan sin acudir al modelo lento.
- Las respuestas se eligen según la **transición del carrito
  realmente validada**, no según una cadena de texto idéntica.
- Para el pedido de **una pepperoni familiar ($14)**, el cambio a
  **una hawaiana mediana ($10)** y sus consultas de total,
  se reproducen los audios de OpenAI **ya guardados** con la misma voz.
- Cuando no hay audio pregrabado se desactiva el proceso asíncrono
  de 25 segundos. El servidor responde enseguida utilizando
  `<Say>` de Twilio; esa respuesta todavía puede sonar más bajita.
- El saludo sigue utilizando el archivo de voz pregrabada.
- Se mantiene el reconocimiento de voz de Twilio con
  `speechTimeout="auto"`, que se detiene al detectar una pausa.
  No se puede garantizar respuesta instantánea: la transcripción,
  la red y la reproducción de audio también añaden latencia.

La prueba `test:phone:fast` genera solicitudes HTTP firmadas
con un modo estricto **solo caché** y comprueba el audio, el
tiempo de respuesta y la activación real del modo rápido en Next.js.
No realiza llamadas ni solicita nuevas síntesis facturables.

Cuando las pruebas estén bien, realiza UNA llamada real. Después de
escuchar el saludo, di claramente:
1. "Quiero una pizza de pepperoni grande, familiar".
2. "Mejor cámbiala por una pizza hawaiana mediana".
3. "¿Cuánto es el total?"

En los registros de Next.js se esperan:
- `[OrderVoice voz] Respuesta rápida validada`
- `[OrderVoice voz] Fuente: respuesta OpenAI pregrabada`

En ngrok deben verse `POST /api/telephony/twilio 200` y
`GET /api/telephony/audio 200`, sin consulta a `voice-status`
para esos turnos.

### Limitación

Esta corrección **no convierte cualquier texto arbitrario en voz
de OpenAI instantáneamente**. Los casos fuera del paquete
pregrabado necesitan más grabaciones de frases, un TTS local
rápido o transmisión de audio en tiempo real.
Para restaurar el sistema anterior, cambia
`ORDERVOICE_PHONE_FAST_MODE=disabled` y reinicia Next.js.

No compartas `OPENAI_API_KEY`, el Auth Token de Twilio ni
las URLs que contengan `trial_key` en capturas.
