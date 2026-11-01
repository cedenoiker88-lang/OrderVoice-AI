# OrderVoice AI v0.4 — Sesión de voz en navegador

## Objetivo

Botón **Iniciar conversación por voz**: el asistente saluda, escucha al cliente, envía el texto reconocido a la API del proyecto y responde en voz alta. Al terminar de hablar vuelve a escuchar. Botón **Terminar conversación**: deja de escuchar y cancela la voz.

- El backend sigue utilizando Ollama local cuando está disponible.
- El chat escrito y el micrófono para dictar un único mensaje siguen disponibles.
- El reconocimiento de voz utiliza Web Speech API del navegador; **no es Whisper local** y puede usar servicios del proveedor del navegador o requerir internet.
- La síntesis utiliza voces del navegador/sistema.
- No conecta llamadas telefónicas tradicionales.

## Cómo probar

En la carpeta `ordervoice-ai-starter`:

```powershell
git fetch origin
git switch --track origin/dev/v0.4
npm run test:orders
npm run test:ollama
npm run build
npm run dev
```

Abre http://localhost:3000 en Chrome o Edge y permite usar el micrófono. Asegúrate de que Ollama está activo.

1. Pulsa **Iniciar conversación por voz**: debería escucharse un saludo y, después, activarse la escucha.
2. Di «Quiero dos pizzas familiares de pepperoni y una hawaiana mediana». El carrito esperado suma $38,00.
3. Espera a que OrderVoice termine de hablar; comprueba que vuelve a escuchar sin que tengas que pulsar el botón.
4. Di «¿Cuánto es el total?»; no debería duplicar el pedido.
5. Pulsa **Terminar conversación**: la escucha y la voz deben detenerse.
6. Comprueba que el resto de la página no se desplace cuando aparecen mensajes nuevos.
7. Comprueba que el chat escrito sigue funcionando.
8. Niega el permiso del micrófono: debe mostrarse un error y detenerse la sesión.

## Alcance / limitaciones

Esta versión usa turnos (escuchar → procesar → responder → volver a escuchar), no una llamada telefónica ni audio simultáneo con interrupciones. El reconocimiento depende de lo que soporte el navegador. Los micrófonos pueden recoger ruido y se necesita probar la estabilidad tras varias conversaciones. Las operaciones se validan en el backend, pero nunca debe usarse el prototipo para pedidos reales sin supervisión y pruebas adicionales.
