# OrderVoice AI v0.5 — velocidad y mediciones

Esta versión sigue siendo un **prototipo local**. No requiere API de pago y **no recibe llamadas telefónicas reales**.

## Qué cambia

- Se mantienen los pedidos pendientes y la memoria de la v0.4.
- Las preguntas frecuentes inequívocas (total, menú, confirmación explícita, vaciado explícito y gaseosa simple) se interpretan con reglas locales, sin esperar a Ollama.
- Los pedidos ambiguos siguen el camino habitual y el backend valida los productos y precios.
- Ollama permanece cargado durante 15 minutos entre solicitudes (`keep_alive: "15m"`) y recibe un historial más compacto. Esto puede consumir RAM/VRAM mientras está cargado.
- El panel indica **Motor**, **Respuesta**, **Servidor** e **Interpretación** en milisegundos. En conversación por voz, indica además **Voz desde transcripción** cuando el navegador comunica el inicio de la síntesis.
- La pausa después de hablar el asistente baja de 350 ms a 250 ms. Si el navegador vuelve a reconocer la propia voz del asistente, se debe aumentar este intervalo.
- `Server-Timing` permite inspeccionar las duraciones del servidor en DevTools.

## Instalación en Windows (desde `ordervoice-ai-starter`)

```powershell
git switch dev/v0.5
git pull origin dev/v0.5
npm ci
npm run test:orders
npm run test:ollama
npm run test:dialogue
npm run test:fast
npm run build
npm run dev
```

Si `npm ci` ya se ejecutó y las dependencias no cambiaron, se puede omitir.

Abre http://localhost:3000, pulsa **Reiniciar** y realiza estas pruebas:

| Mensaje | Resultado esperado | Motor |
| --- | --- | --- |
| «Quiero una pizza de pepperoni» | Pregunta tamaño, sin añadir todavía | Reglas locales |
| «Mediana» | Añade pepperoni mediana por $9,00 | Reglas locales |
| «¿Cuánto es el total?» | Responde $9,00 sin modificar el carrito | Reglas locales |
| «Quiero dos gaseosas» | Añade 2 gaseosas; total $14,00 | Reglas locales |
| «Confirmo el pedido» | Confirma el pedido de demostración | Reglas locales |
| «No confirmo el pedido» | No debe confirmar el pedido | Ollama o demo, sujeto a validación |
| «Quiero una pizza hawaiana mediana y una margarita familiar» | Dos productos correctos | Ollama o demo |
| «Mejor cambia una pizza por otra» | Pide aclaración, no cambia a ciegas | Ollama o demo |

Prueba además tres turnos por voz y confirma que la IA no se escuche a sí misma.

## Cómo interpretar las métricas

- **Respuesta**: duración de la solicitud HTTP desde el navegador, incluida red local y lectura del JSON; **no** incluye el tiempo de reconocimiento de voz ni el tiempo que tarda la voz en terminar de hablar.
- **Servidor**: duración del procesamiento de `/api/chat` antes de construir la respuesta.
- **Interpretación**: tiempo de la ruta de reglas o de la llamada al modelo.
- **Voz desde transcripción**: tiempo desde el resultado final del reconocimiento del navegador hasta el evento de inicio de la voz sintetizada. Incluye la petición y el arranque de la voz.
- Los números son mediciones, no garantías de rendimiento. Compara varios turnos del mismo tipo; el primer uso de Ollama puede ser más lento.

## Seguridad y límites

- Las reglas locales solo se activan para frases simples y afirmativas. «No confirmo» y «No vacíes el carrito» **no** deben confirmar ni vaciar.
- El backend sigue calculando importes desde el menú validado, no desde una respuesta libre de la IA.
- El reconocimiento Web Speech API del navegador puede requerir conectividad y servicios externos, aunque Ollama funcione localmente. Una solución de voz 100% local requerirá otro componente.
- No se ha añadido telefonía ni integración con cocina real.

## Criterio para incorporar a main

Ejecutar todas las pruebas y `npm run build` sin errores; comprobar pedidos múltiples, correcciones, preguntas de total, confirmación, ausencia de duplicados y escucha por voz. **No fusionar automáticamente sin estas verificaciones.**
