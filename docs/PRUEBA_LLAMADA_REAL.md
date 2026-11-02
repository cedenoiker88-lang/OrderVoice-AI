# Prueba de llamada TELEFÓNICA real con OrderVoice (Twilio)

Esta ruta permite que **una llamada de celular real** use la lógica de pedidos de OrderVoice. Por ahora es una prueba de laboratorio, no una central comercial.

## Antes de empezar
- El saldo del celular paga una llamada al número al que marques; **no paga automáticamente** los costos de Twilio ni compra un número.
- Twilio ofrece una prueba con límites y destinatarios verificados. La disponibilidad de números entrantes y las tarifas dependen del país de cuenta y del inventario.
- En Ecuador Twilio publica aproximadamente **USD 34/mes** para un número local y **USD 0,0107/min** de llamada entrante, antes de otros servicios/impuestos. Comprueba el precio exacto en la consola **antes de comprar**.
- Una cuenta de prueba puede ofrecer un número temporal o una llamada de salida hacia tu móvil verificado. Si no puedes recibir una llamada entrante desde tu operador, prueba el flujo saliente o consulta la consola.
- No introduzcas tokens, contraseñas ni números personales en GitHub ni en capturas.

## Esta primera integración

Se añadió `POST /api/telephony/twilio` que devuelve TwiML. El teléfono es atendido así:

1. `<Say>` pronuncia el saludo en español.
2. `<Gather input="speech">` reconoce la respuesta hablada mediante el **servicio de Twilio**, no desde el navegador ni Whisper local. Puede suponer consumo adicional en una cuenta de pago.
3. El backend procesa el pedido usando las reglas existentes y Ollama (en tu computadora).
4. Se escucha la respuesta y se pregunta por el siguiente turno.
5. Al confirmar, lee la confirmación y termina la llamada de prueba.

El audio de esta versión viaja al proveedor de telefonía y a su reconocimiento de voz. **No es aún una llamada con STT y TTS 100% locales.** Usa el idioma `es-ES` por compatibilidad y necesita probar el reconocimiento de acento ecuatoriano.

Cada llamada mantiene un carrito temporal, con un máximo de 15 turnos. **No se envía ningún pedido a una cocina real ni se cobran pagos.** Si se reinicia Next.js se puede perder el carrito de la llamada.

## Preparación (el usuario configura Twilio en su propia cuenta)

1. Crea una cuenta desde https://www.twilio.com/try-twilio o inicia sesión en https://console.twilio.com/.
2. Verifica tu propio teléfono y revisa el producto **Try out Voice**, las limitaciones y las capacidades de llamadas del número de prueba. **No compres un número sin comprobar primero que realmente lo necesitas.**
3. Mantén Ollama abierto y ejecuta `npm run dev` dentro de `ordervoice-ai-starter`.
4. Para que Twilio alcance tu servidor de desarrollo local debes abrir un túnel **HTTPS público** (por ejemplo con ngrok o Cloudflare Tunnel). No expongas directamente el puerto 3000 a internet. La URL del túnel debe permanecer estable durante la prueba.
5. En tu archivo `.env.local` (nunca subirlo a GitHub) añade:

```dotenv
TWILIO_AUTH_TOKEN=el_auth_token_de_tu_cuenta
TWILIO_PUBLIC_BASE_URL=https://tu-subdominio-publico-de-tunel
ORDERVOICE_PROVIDER=ollama
OLLAMA_MODEL=llama3.2:3b
```

6. Reinicia el servidor Node después de cambiar `.env.local`.
7. Configura el **Voice webhook URL** de tu número de prueba (o TwiML/llamada de prueba compatible) con método **HTTP POST** a:

```text
https://tu-subdominio-publico-de-tunel/api/telephony/twilio
```

8. Desde **tu propio celular verificado**, llama a ese número solo si el proveedor permite recibir la llamada y entiendes el costo de marcarlo. Alternativamente utiliza una llamada saliente de la cuenta de prueba hacia tu número verificado con la misma URL de Voice.
9. Prueba: «Quiero una pizza de pepperoni» → «Mediana» → «¿Cuánto es el total?» → «Confirmo el pedido».

### Cómo saber si el enlace funciona

- Una solicitud externa sin firma debe devolver **403**. Ese resultado es correcto: no aceptamos comandos de llamadas no verificadas.
- Si el webhook devuelve **503**, faltan variables de entorno.
- Si la cuenta marca un error de webhook, revisa la URL del túnel, método POST, el `TWILIO_AUTH_TOKEN` y el registro de Twilio.
- Si la voz escucha pero no interpreta, comprueba que Ollama esté encendido. Para una prueba puramente determinista usa `ORDERVOICE_PROVIDER=demo`.
- No ignores una respuesta 500 ni desactives la validación de firma para «hacerlo funcionar».

## Limitaciones actuales
- Comunicación por turnos, con pausas entre reconocimiento y síntesis; no es un audio bidireccional de baja latencia ni permite interrumpir la voz del asistente.
- La voz se genera en Twilio; Piper local aún no está conectado.
- El `SpeechResult` viene de `Gather`, no de Whisper.
- No maneja transferencia a empleado, concurrencia comercial, base de datos persistente ni autenticación de clientes finales.
- La sesión se almacena en memoria durante un máximo de 15 minutos; solo es adecuada para desarrollo en un único servidor Node.
- La seguridad del túnel, los permisos de red y la privacidad deben revisarse antes de operar con clientes.

Fuentes:
- https://www.twilio.com/docs/voice/twiml/gather
- https://www.twilio.com/docs/voice/twiml/say
- https://www.twilio.com/docs/usage/security
- https://www.twilio.com/docs/usage/trials
- https://www.twilio.com/en-us/voice/pricing/ec
