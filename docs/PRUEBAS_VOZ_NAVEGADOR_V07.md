# OrderVoice AI · v0.7 · Prueba de voz desde Microsoft Edge

**Rama experimental:** `dev/browser-voice-v0.7` (basada en `dev/v0.6`).  
**Objetivo:** entender un vocabulario más amplio, evitar cambios accidentales del carrito y conversar por micrófono sin Twilio.

## 1. Actualizar la computadora

Abre PowerShell en la carpeta local `OrderVoice-AI`:

```powershell
git fetch origin
git switch -c dev/browser-voice-v0.7 --track origin/dev/browser-voice-v0.7
npm.cmd ci
```

Si ya estás en `dev/browser-voice-v0.7`:

```powershell
git pull origin dev/browser-voice-v0.7
```

**No cambies ni subas modificaciones a `main`.** Esta rama es de pruebas y puede volver a `dev/v0.6` sin afectar el avance anterior.

## 2. Configuración gratuita

Crea o ajusta `.env.local` en la misma carpeta que `package.json`:

```dotenv
ORDERVOICE_PROVIDER=demo
```

Con `demo` no se llama a OpenAI ni a Ollama para interpretar el pedido; se utilizan las reglas del prototipo. **No es necesario iniciar ngrok ni configurar Twilio**. Esta modalidad no consume saldo de llamadas ni créditos de OpenAI.

Si luego quieres evaluar el intérprete Ollama local (sin API de pago), cambia a `ORDERVOICE_PROVIDER=ollama` y asegúrate de que `ollama run llama3.2:3b` o el servidor Ollama esté disponible. Ollama puede añadir latencia.

## 3. Pruebas antes de abrir el micrófono

En la terminal:

```powershell
npm.cmd run typecheck
npm.cmd run test:orders
npm.cmd run test:dialogue
npm.cmd run test:fast
npm.cmd run test:browser:voice
```

El último comando verifica normalización de transcripciones, cambio de pizza, consulta de precios, cantidad, negaciones, confirmación explícita y protección del carrito. **No usa servicios externos**, ni requiere hablar por micrófono.

## 4. Iniciar la aplicación y probar en Edge

```powershell
npm.cmd run dev
```

Abre **Microsoft Edge** en la URL local que muestre Next.js, por ejemplo: **http://localhost:3000**.

1. Comprueba que la página muestra *Panel de pruebas · v0.7 voz navegador*.
2. Permite el acceso al **micrófono** cuando Edge lo solicite.
3. Si aparece el selector **Voz española de Edge**, elige la voz que prefieras. Si no aparece, instala una voz española en Windows y vuelve a abrir la página.
4. Pulsa **🎧 Iniciar conversación por voz**.
5. Espera a que el asistente termine su saludo. Habla cuando veas **Escuchando al cliente…**.
6. Haz una petición y comprueba tanto el **texto reconocido en el chat** como el **carrito** y la respuesta hablada.
7. Pulsa **■ Terminar conversación** al terminar.

Las respuestas se reproducen con el sintetizador de voz del navegador, con volumen solicitado al 100 % y una voz española cuando Edge la ofrece. El volumen real depende también de Windows, los altavoces y la voz instalada. **No es la voz generada por la API de OpenAI**, por lo que el timbre puede ser distinto.

## 5. Conversación recomendada para la primera prueba

| Turno | Qué dices | Resultado esperado |
|---|---|---|
| 1 | «Quiero una piza de peperoni grande» | Añade **1 pepperoni familiar**, USD 14,00 |
| 2 | «No, mejor cámbiala por una hawaiiana mediana» | Sustituye, sin duplicar; total **USD 10,00** |
| 3 | «¿En cuánto va la cuenta?» | Dice **USD 10,00**, sin modificar el carrito |
| 4 | «Me puedes dar dos sodas» | Añade **2 gaseosas**; total **USD 15,00** |
| 5 | «¿Cuánto cuesta la margarita familiar?» | Informa el precio, **no añade** la pizza |
| 6 | «No quiero que cambies mi pizza» | No cambia el carrito |
| 7 | «¿Confirmo el pedido?» | No lo confirma: es una pregunta |
| 8 | «Sí, confírmame mi pedido» | Confirma solo después de una orden explícita |

Para comprobar que no inventa productos, prueba «Quiero una pizza de pollo» y verifica que pida aclaración o indique que no está disponible, sin añadirla.

## 6. Si algo falla

- **No te escucha:** revisa el ícono de permisos del micrófono en la barra de direcciones de Edge y el micrófono de entrada en Windows. Puede depender de la conexión a Internet: el reconocimiento de voz del navegador no siempre es totalmente local.
- **La voz no está en español:** elige una voz española disponible o instala el paquete de voz en Windows.
- **No empieza a escuchar después de hablar:** termina la sesión y vuelve a iniciarla. Revisa errores mostrados en el panel y la consola del navegador.
- **Reconoce palabras equivocadas:** copia el **texto que aparece como mensaje de cliente**; no envíes claves privadas. Ese texto permite distinguir un error de reconocimiento de uno de interpretación.
- **Una orden falla:** copia la salida de `npm.cmd run test:browser:voice` y los mensajes de Next.js; no hace falta gastar saldo de Twilio.
- **Error de servidor:** confirma que `npm.cmd run dev` sigue activo y que `ORDERVOICE_PROVIDER=demo` esté configurado en `.env.local`.

## 7. Límites y seguridad

- El menú sigue siendo **ficticio y cerrado**: pepperoni, hawaiana, margarita y gaseosa; no se inventan ingredientes ni precios.
- Los productos y totales se validan en servidor antes de cambiar el carrito.
- La normalización de vocabulario se aplica cuando la UI marca una petición como **voz del navegador**. No se aplica directamente al webhook Twilio.
- Las pruebas automatizadas no demuestran que el **micrófono real** vaya a reconocer todas las frases; cada equipo y navegador puede comportarse de forma distinta.
- No publiques `.env.local` ni claves de OpenAI/Twilio. No hay que activar ngrok para probar la conversación web.
