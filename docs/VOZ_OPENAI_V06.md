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
ORDERVOICE_TTS_TIMEOUT_MS=6500
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

## 3. Preparar el saludo ya generado (recomendado)

Si la muestra local de `npm run test:voice` te gustó, reutilízala
para que la **primera frase de la llamada no dependa de esperar la API**:

```powershell
New-Item -ItemType Directory -Force .ordervoice-cache
Copy-Item .next\ordervoice-voz-openai-v06.wav .ordervoice-cache\greeting.wav
```

El archivo es local y la carpeta está excluida de GitHub.
Se carga en la llamada como WAV 8 kHz normalizado. Si el archivo no existe
o es incompatible, se intenta OpenAI y después la voz de respaldo.
No borres `.ordervoice-cache` entre llamadas de prueba.

## 4. Comprobar las llamadas sin generar audio facturable

Con Next.js y ngrok activos, usa:

```powershell
npm run test:phone
npm run test:trial
```

Estas pruebas usan un encabezado de diagnóstico después de validar la autenticación
y omiten la generación de OpenAI, por lo que no consumen créditos de voz.

## 5. Probar una llamada real

1. En la terminal **que ejecuta Next.js**, activa primero los certificados
   de Windows y reinicia el servidor:

   ```powershell
   $env:NODE_USE_SYSTEM_CA="1"
   npm run dev
   ```

   Mantén ngrok conectado al puerto 3000.
2. En **Twilio → Try out Voice → Start a call → Custom**, conserva la URL
   privada que ya funcionaba en la versión v0.5 (contiene `trial_key=`).
3. Pulsa **Start call** solo una vez.
4. Después del mensaje Trial en inglés deberías oír el saludo en español.
5. En el panel de ngrok, al reproducir el archivo preparado o la voz de OpenAI debería aparecer un
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

## 6. Limitaciones y próximos pasos

- La voz puede mejorar claridad y nivel, pero el volumen final depende
  también del teléfono y de la red de Twilio.
- Generar audio puede añadir latencia. Tras 6,5 s por defecto (configurable hasta 7 s),
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


## Corrección de cortes al cambiar una pizza (v0.6)

Si el primer pedido funciona pero una sustitución provoca un mensaje de error
en inglés, no significa necesariamente que falle la voz de OpenAI.
Twilio solo espera hasta 15 segundos por una respuesta de webhook.

El controlador ahora interpreta cambios sencillos de una sola pizza en el
carrito **sin consultar a Ollama**, y limita las interpretaciones telefónicas
a un tiempo breve. En caso de error, conserva el carrito y pide repetir
el cambio en español, en vez de colgar de inmediato.

**Para comprobarlo sin llamada ni consumo de OpenAI:**

```powershell
git pull origin dev/v0.6
npm run test:dialogue
```

Con Next.js y ngrok conectados:

```powershell
npm run test:phone:change
npm run test:phone:audio
```

La prueba de cambios reproduce estos turnos: pepperoni familiar, cambiar a
hawaiana mediana, consultar total, cambiar a margarita familiar y después a
pepperoni mediana. La prueba de audio verifica además que Twilio pueda recuperar el WAV del saludo
con HTTP 200, incluso después de cambios del servidor. En ambos casos solo
deben verse respuestas **HTTP 200**, sin llamadas
ni cobros telefónicos.

Además, los clips se guardan durante unos 5 minutos en archivos locales
`.ordervoice-cache/clips` (carpeta ignorada por GitHub) para resistir
recargas de Next.js. Si ngrok muestra un
`GET /api/telephony/audio?id=...` con **404**, el problema está en la
reproducción y hay que revisar los registros de Next.js. No compartas la
URL privada de `trial_key` ni las URLs completas de clips.

Para desactivar el modo telefónico de demostración al terminar:
`TWILIO_TRIAL_MODE=disabled` y reiniciar Next.js.


## Volumen constante durante toda la llamada

El saludo inicial puede usar una muestra de OpenAI ya preparada, mientras que
las respuestas siguientes generan voz en tiempo real. Si OpenAI tarda más que
el límite configurado, el servidor vuelve a usar `<Say>` de Twilio, que puede
sonar más bajo y diferente.

La v0.6 amplía la espera de TTS a **6.500 ms**, hasta un máximo de 7.000 ms.
También deja un margen dentro del límite de 15 s del webhook telefónico y
registra, sin texto del pedido ni credenciales:

- `[OrderVoice voz] Fuente: saludo OpenAI pregrabado` para el saludo
- `[OrderVoice voz] OpenAI Play listo` y `durationMs` para la voz de OpenAI
- `[OrderVoice voz] Fuente: Twilio Say` si hubo respaldo de voz
- `[OrderVoice voz] Se activó respaldo Twilio Say` si hubo timeout o error

En `.env.local`, cambia **solo** la línea que ya tengas por
`ORDERVOICE_TTS_TIMEOUT_MS=6500`, guarda y reinicia Next.js desde
una terminal PowerShell con:

```powershell
$env:NODE_USE_SYSTEM_CA="1"
npm run dev
```

Primero comprueba gratis los pedidos y el audio pregrabado:

```powershell
npm run test:phone:change
npm run test:phone:audio
```

Si ambos pasan, prueba **una sola respuesta dinámica de voz sin llamadas**
con `npm run test:phone:voice`. Esta última sí envía **una solicitud
facturable de voz a OpenAI**, pero no consume minutos de Twilio. Si informa
`Twilio Say`, mira en la terminal de Next.js el motivo y la duración;
**no aumentes el timeout por encima de 7 s**, ya que Twilio corta
webhooks telefónicos que superan 15 s.

La voz de respaldo puede seguir sonando distinta. Para conseguir uniformidad
incluso si falla la API hay que implementar otro respaldo de audio pregrabado
o un motor de voz local; ampliar el tiempo no es una garantía absoluta.


## Actualización: generación de voz sin bloquear el webhook (noviembre 2026)

Si `npm run test:phone:voice` imprimía `VOZ DE RESPALDO: Twilio Say`
después de unos siete segundos, significa que el pedido se entendió, pero
**la API de voz no devolvió el audio dentro del tiempo de espera**.

El flujo local ahora funciona así:

1. Se procesa la intención del pedido y se conserva el carrito.
2. El webhook contesta rápidamente con un `<Redirect>` temporal.
3. OpenAI genera la voz en un trabajo **en memoria** con máximo 25 s.
4. Twilio consulta `GET /api/telephony/voice-status?id=...` y recibe
   `<Pause>` hasta que el audio esté listo.
5. Cuando lo está, Twilio recibe `<Gather><Play>...</Play></Gather>`,
   escucha la respuesta y puede continuar la conversación en español.
6. Si la API falla, se mantiene la voz de respaldo de Twilio, pero ya no
   se usa solo porque el audio exceda el límite de 6,5 s del webhook.

El saludo sigue reutilizando `.ordervoice-cache/greeting.wav` sin hacer
una solicitud de TTS nueva. Los trabajos en curso utilizan identificadores
aleatorios y caducan a los 90 segundos. **Este prototipo necesita mantener
un único proceso local Next.js activo; no es una cola persistente para
plataformas serverless.**

Ejecuta en este orden:

```powershell
git pull origin dev/v0.6
npm run typecheck
npm run test:phone:change
npm run test:phone:audio
```

Con Next.js reiniciado, y ngrok y Ollama activos:

```powershell
npm run test:phone:voice
```

La última prueba hace **una** solicitud de síntesis a OpenAI (facturable),
pero ninguna llamada. Puede durar 25-35 s porque ahora comprueba que
Twilio puede **esperar** mientras se genera audio. El resultado correcto es
`OK: respuesta de voz OpenAI con Play, HTTP 200, WAV 8 kHz.`

Si pasa, haz **una sola** llamada real. En ngrok verás las rutas:
`POST /api/telephony/twilio`,
`GET /api/telephony/voice-status`,
`GET /api/telephony/audio`.

**Limitación**: la conversación puede tener pausas de varios segundos.
Para producción habrá que utilizar streaming telefónico de audio y una
cola/servicio de trabajos compartido. No difundas los tokens de prueba o
IDs completos de clips al enviar capturas.


## Solución para voz muy baja después del saludo: paquete pregrabado

Si el registro del servidor muestra `TimeoutError`, `durationMs: 25000`
y después `source: Twilio Say`, significa que OpenAI no preparó el sonido
a tiempo (aunque el pedido sí se procesó). Aumentar el timeout no resuelve
la latencia en la conversación.

Ahora OrderVoice AI puede reproducir inmediatamente un paquete de frases
con la misma voz **Coral** de OpenAI. Cada frase se selecciona **solo si el
texto completo coincide** con la respuesta real del carrito, incluidos los
precios. Para solicitudes no incluidas se conserva la generación dinámica.

Por defecto se preparan estas CUATRO frases de la demostración:
1. Se añadió una pizza pepperoni familiar ($14).
2. Se sustituyó por hawaiana mediana ($10).
3. Total de la pizza pepperoni familiar ($14).
4. Total de la pizza hawaiana mediana ($10).

### 1. Inspeccionar sin consumir créditos

```powershell
git pull origin dev/v0.6
npm run typecheck
npm run prepare:phone:voice -- --list
```

### 2. Preparar los sonidos fuera de la llamada (USA CRÉDITOS API)

En la terminal de PowerShell de la carpeta `ordervoice-ai-starter`:

```powershell
$env:NODE_USE_SYSTEM_CA="1"
npm run prepare:phone:voice
```

**Atención**: cada frase que esté pendiente genera UNA petición
facturable a OpenAI. Inicialmente pueden ser cuatro. El programa no
hace llamadas a Twilio, no reintenta automáticamente y conserva los
archivos completados si una petición falla. Se permite hasta 90 segundos
por petición, porque se genera antes de llamar. No lo ejecutes
simultáneamente en varias terminales.

Los archivos se guardan localmente en
`.ordervoice-cache/voice-pack/` y **no se suben a GitHub**. Si aparece
`TimeoutError`, revisa `NODE_USE_SYSTEM_CA`, la red y el servicio
antes de repetir la preparación; no hay garantía de que una petición
abortada no haya consumido créditos.

### 3. Verificar sin hacer llamadas ni generar TTS nuevo

Con Next.js y ngrok activos y `.env.local` con
`ORDERVOICE_TTS_PROVIDER=openai`:

```powershell
npm run test:phone:pack
```

La prueba se niega a continuar si faltan frases, para evitar gastos
accidentales. Inicia la sesión mediante un saludo sin síntesis facturable
y comprueba que el pedido, el cambio y el total devuelven inmediatamente
un `<Gather><Play>`, y que Twilio podría descargar WAV de 8 kHz por
HTTP 200. Todas las solicitudes de prueba están autenticadas y usan un
modo estricto de `cache-only`: si una frase no coincide, la prueba falla
**sin llamar a OpenAI**.

La solución cubre las frases exactas pregrabadas, NO cualquier pedido
o cambio arbitrario. Si el programa recibe otras cantidades o productos,
aún puede solicitar OpenAI de forma dinámica y, si OpenAI vuelve a tardar
más de 25 segundos, usar la voz de Twilio. Para una experiencia de voz
en tiempo real consistente con cualquier texto se requiere una solución
de streaming y una conexión de red estable.

Mantén `TWILIO_TRIAL_MODE` reservado a las pruebas locales; al terminar
usa `TWILIO_TRIAL_MODE=disabled` y reinicia Next.js.
