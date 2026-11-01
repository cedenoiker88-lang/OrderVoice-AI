# OrderVoice AI v0.3 — Ollama local y gratuito

Esta versión conecta el chat con el modelo `llama3.2:3b` de Ollama ejecutado en tu propia computadora. **No necesitas una API de pago**. El módulo de telefonía todavía no está implementado.

## Requisitos
- Windows con Ollama instalado y el modelo descargado: `ollama run llama3.2:3b`.
- Ollama abierto (API local en `127.0.0.1:11434`).
- Node.js y dependencias del proyecto instaladas.

## Primera prueba

En VS Code abre una terminal **dentro de `ordervoice-ai-starter`**, y ejecuta:

```powershell
git fetch origin
git switch --track origin/dev/v0.3
npm run test:orders
npm run test:ollama
npm run build
npm run dev
```

Abre `http://localhost:3000` y escribe: «Quiero dos pepperoni familiares y una hawaiana mediana».

Si Ollama responde, el encabezado mostrará `OLLAMA LOCAL`. El servidor aplica la interpretación del modelo al motor determinista de pedidos, que verifica productos y cantidades y calcula todos los precios.

## Solución de problemas
- `ollama list`: confirma que esté instalado `llama3.2:3b`.
- `ollama ps`: observa si el modelo está cargado (puede demorarse al iniciar).
- Si Ollama no está disponible, el chat vuelve al modo DEMO y muestra un aviso.
- Si se demora, el primer mensaje puede tardar más mientras se carga el modelo.
- El chat conserva únicamente el historial reciente de la sesión en memoria del navegador; los pedidos de prueba se guardan en ese navegador.
- Para ejecutar exclusivamente reglas sin llamar al modelo, crea un archivo `.env.local` con `ORDERVOICE_PROVIDER=demo` y reinicia el servidor.
- Para seleccionar otro modelo local ya instalado, usa `OLLAMA_MODEL=nombre:modelo`.

**Importante:** ejecutar la aplicación Next.js en otra computadora o en la nube no permitirá contactar automáticamente a Ollama de tu PC; `127.0.0.1` apunta al equipo donde está ejecutándose el backend. No expongas el puerto de Ollama a internet.

## Limitaciones y seguridad
- La IA local puede equivocarse: valida todas las órdenes antes de utilizarlas para operar un restaurante real.
- Las solicitudes ambiguas deben aclararse; no se garantizan conversaciones sin errores.
- Solo existe una pizzería ficticia. No se reciben llamadas telefónicas reales ni se procesan pagos.
- El botón del micrófono usa el reconocimiento del navegador, que puede depender de un servicio externo según el navegador. No equivale a Whisper local ni a un sistema totalmente sin conexión.
- La opción de leer respuestas en voz alta depende de las voces instaladas en el sistema/navegador.
- `ORDERVOICE_PROVIDER=openai` solo se utiliza si lo configuras explícitamente y dispones de `OPENAI_API_KEY`; esa modalidad puede generar cargos de API.

## Pruebas sugeridas
1. «Quiero dos pepperoni familiares y una hawaiana mediana».
2. «¿Cuánto es el total?».
3. «Cambia una pepperoni familiar por una hawaiana mediana».
4. «Quiero una pizza» → debe pedir aclaración.
5. «Quita diez hawaianas» → no debe alterar el carrito.
6. Desactiva Ollama momentáneamente y comprueba que aparece el aviso de modo DEMO.

Antes de fusionar a `main`, revisa los resultados reales en tu equipo de `npm run test:orders`, `npm run test:ollama` y `npm run build`.
