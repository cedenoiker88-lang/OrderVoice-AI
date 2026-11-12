# OrderVoice AI v1.0 · Conversación continua en Microsoft Edge

**Rama de prueba:** `dev/handsfree-browser-v1.0` (desde `dev/order-intelligence-v0.9`).  
**Objetivo:** pulsar **una vez** para iniciar y conversar por voz turno a turno, **sin volver a presionar un botón después de cada frase**.

## Cómo se comporta

1. Presionas **🎙 Iniciar conversación continua** y permites el micrófono.
2. OrderVoice **saluda en voz alta**.
3. Al terminar de hablar, escucha tu micrófono. El detector local detecta cuándo empiezas y cuándo haces una pausa de ~1,1 segundos.
4. Envía el fragmento detectado a **OpenAI Speech-to-Text**, muestra «Texto reconocido por la API» y pasa el texto al **motor inteligente v0.9**.
5. El servidor valida los cambios del pedido y devuelve una respuesta. **Edge la lee en voz alta** (no se activa el TTS telefónico).
6. Tras terminar la respuesta de Edge, **vuelve a escucharte automáticamente**. Nunca necesitas pulsar «Grabar» y «Detener» para cada frase.
7. Al decir **«Confirmo mi pedido»**, cuando el motor confirme el pedido, OrderVoice da la respuesta final y cierra la sesión.
8. Puedes pulsar **■ Finalizar conversación** en cualquier momento. Cierra el micrófono y cancela solicitudes pendientes.

**Importante:** esta versión es **por turnos**: se escucha después de que OrderVoice termina de hablar, para evitar que el micrófono vuelva a grabar el audio del propio asistente. Durante el envío a OpenAI y la generación de la respuesta **sí habrá un intervalo breve de procesamiento**. No implementa conversación de dúplex completo ni interrupción simultánea de la voz del asistente.

## Qué instalar

No hay programas ni dependencias npm nuevos. Ya necesitamos:

- Microsoft Edge actualizado, micrófono y salida de audio en Windows.
- Node.js y las dependencias existentes del repositorio.
- API key de OpenAI Platform válida con **Audio: Request** y **Responses: Write**, guardada en el servidor.
- No se requiere Twilio, ngrok ni saldo de llamadas.

## Paso 1. Descargar la versión v1.0

En VS Code abre la carpeta `ordervoice-ai-starter` (la que contiene `package.json`). Detén Next.js con `Ctrl+C` si estuviera activo.

```powershell
git fetch origin
git switch -c dev/handsfree-browser-v1.0 --track origin/dev/handsfree-browser-v1.0
npm.cmd ci
```

Si la rama ya existe en tu computadora, en lugar de `git switch -c`:

```powershell
git switch dev/handsfree-browser-v1.0
git pull origin dev/handsfree-browser-v1.0
```

**No modificamos `main` ni `dev/order-intelligence-v0.9`.** Si quieres volver a la versión anterior: `git switch dev/order-intelligence-v0.9`.

## Paso 2. Conservar la configuración que ya funciona

En `.env.local` deben existir estas variables **una sola vez cada una**:

```dotenv
ORDERVOICE_PROVIDER=openai
ORDERVOICE_BROWSER_STT_PROVIDER=openai
ORDERVOICE_INTENT_MODEL=gpt-6.1-sol
OPENAI_API_KEY=TU_CLAVE_PRIVADA_EXISTENTE
```

Conserva las otras configuraciones privadas de tu máquina. **No compartas la clave, no la subas a GitHub ni la muestres en capturas.** Los valores mostrados arriba son ejemplos, no claves reales.

## Paso 3. Ejecutar primero pruebas SIN costo

```powershell
npm.cmd run typecheck
npm.cmd run test:handsfree
npm.cmd run test:plan
```

- `test:handsfree`: prueba sintéticamente detección de voz, espera en silencio y finalización por pausa sin enviar audio ni llamar a APIs.
- `test:plan`: prueba que el motor valide cambios de carrito de forma transaccional.
- `typecheck`: comprueba que TypeScript compile.

Esas pruebas no sustituyen la prueba real de voz y dispositivos en Edge.

## Paso 4. Ejecutar la aplicación

Si sigues en la misma computadora Windows que tuvo errores de certificados de conexión, primero ejecuta:

```powershell
$env:NODE_USE_SYSTEM_CA="1"
npm.cmd run dev
```

`NODE_USE_SYSTEM_CA=1` habilita certificados de confianza de Windows para Node.js; **no** desactiva la seguridad TLS. Si abres una terminal nueva deberás volver a escribirlo allí.

Abre **http://localhost:3000** en **Microsoft Edge**.

## Paso 5. Prueba de conversación automática

1. Pulsa **Reiniciar** si había productos de otras pruebas.
2. Comprueba que aparece **Panel de pruebas · v1.0 voz continua**.
3. Pulsa **🎙 Iniciar conversación continua** y permite el micrófono.
4. Espera el saludo. Al ver **🎙 Escuchando: habla cuando quieras…**, di:
   «Quiero una pizza pepperoni familiar y dos gaseosas».
5. Después de procesar la frase, OrderVoice debe hablarte en español. **No presiones nada**.
6. Cuando vuelva a mostrar «Escuchando», di:
   «No, mejor cambia la pepperoni por una hawaiana mediana».
7. Espera su respuesta y luego pregunta: «¿En cuánto va mi cuenta?».
8. Finalmente di «Confirmo mi pedido». OrderVoice debe confirmar y terminar la sesión tras la despedida.

Total esperado después del cambio (antes de confirmar): **USD 15,00** — 1 hawaiana mediana y 2 gaseosas.

En pantalla se muestran la **transcripción** y la **interpretación IA** para poder distinguir errores de micro/transcripción, razonamiento y carrito.

## Cuándo se envía audio y cuánto cuesta

- El detector local examina únicamente el **nivel de señal del micrófono** en tu equipo; el detector no genera gastos.
- La aplicación **solo envía la grabación cuando detecta una frase hablada**. El silencio prolongado reinicia la escucha local, sin consumir una transcripción OpenAI.
- Una detección falsa por ruido fuerte **puede generar una solicitud**; usa un sitio tranquilo para la exposición.
- Cada frase detectada se envía a OpenAI **para transcribirla**; el texto resultante se manda a OpenAI **para interpretar** el pedido. Ambos servicios pueden consumir créditos de API.
- La respuesta se reproduce con la **síntesis de voz de Edge**, no con la API TTS; **Twilio no se utiliza**.
- El audio se maneja como una grabación temporal en el navegador y se transmite al servidor local, que lo envía a OpenAI; no se guarda un archivo de audio permanente en el servidor.

## Si aparece algún problema

- **No escucha:** revisa el permiso del micrófono en Edge y el dispositivo de entrada de Windows. Habla después de que la voz termine.
- **Se corta una frase larga:** el detector termina la grabación tras unos 1,1 s de silencio; evita pausas muy largas dentro del mismo pedido. Un turno hablado tiene límite aproximado de 18 s.
- **Escucha voces de fondo:** usa auriculares o baja el volumen de los parlantes y evita ruidos fuertes.
- **Solo ve transcripción, pero no responde:** envía la captura de la terminal `npm.cmd run dev` y de «Interpretación IA»; la respuesta podría estar fallando en el motor, no en el micrófono.
- **Responde pero no vuelve a escuchar:** observa el estado de conversación, verifica la salida de audio de Edge y envía una captura junto con la terminal.
- **HTTP 401 en Responses:** revisa `Responses: Write` para la API key del proyecto. **Error de conexión** en Windows: usa `$env:NODE_USE_SYSTEM_CA="1"` antes de iniciar Next.js.
- **No quieres consumir más créditos:** pulsa **■ Finalizar conversación**. Si el audio ya fue enviado antes de finalizar, esa solicitud podría tener costo.

## Alcance técnico

Esta rama prueba una detección de voz ligera basada en RMS y pausas. **No es un asistente infalible ni está optimizado con un detector profesional de habla**, por lo que requerirá pruebas reales del micrófono, umbrales y latencia antes de usarlo en una exposición. Se conserva la validación del carrito de v0.9 y no se ha modificado la implementación telefónica de Twilio.
