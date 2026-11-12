# OrderVoice AI v0.9 · Interpretación de pedidos con IA y control de errores

**Rama experimental:** `dev/order-intelligence-v0.9` (desde `dev/browser-stt-v0.8`).  
**Alcance:** pruebas por micrófono y chat desde el navegador. Las llamadas de Twilio conservan el flujo anterior y **no se usan en esta prueba**.

## ¿Qué cambié y por qué?

En v0.8 la API ya transcribía correctamente frases como «quitar una gaseosa; solamente quedaría una gaseosa y una margarita», pero el motor de **modo demo** solo sabía interpretar acciones simples; podía pedir una aclaración inútil, cambiar productos equivocadamente o no realizar una corrección.

En v0.9 separamos cuatro responsabilidades:

1. **Micrófono → texto:** `gpt-transcribe` convierte audio en texto. Se muestra la transcripción para comprobarla o corregirla.
2. **Texto + carrito + historial → plan:** un modelo de OpenAI devuelve un esquema estructurado de cambios. Puede incluir varias operaciones diferentes en un solo turno; no se restringe a la frase de la captura.
3. **Plan → validación transaccional:** el código del servidor verifica nombres, cantidades, existencias y coherencia; aplica **todos los cambios o ninguno**. El modelo no decide precios ni modifica datos directamente.
4. **Respuesta → voz:** Edge lee la respuesta en español. Más adelante podemos elegir síntesis de OpenAI en la web como mejora separada, con costo adicional.

Se admiten operaciones **agregar, quitar, sustituir, fijar cantidades, conservar solo los productos indicados, consultar, confirmar y vaciar**; se aclaran los pedidos ambiguos. No se garantiza 100 % de precisión: se verifica con pruebas reales y casos adversos.

## 1. Actualizar la rama (sin modificar main)

Abre la carpeta **ordervoice-ai-starter** que contiene `package.json` en VS Code, y en PowerShell escribe:

```powershell
git fetch origin
git switch -c dev/order-intelligence-v0.9 --track origin/dev/order-intelligence-v0.9
npm.cmd ci
```

Si ya tienes esta rama localmente:

```powershell
git switch dev/order-intelligence-v0.9
git pull origin dev/order-intelligence-v0.9
```

No se instalará ninguna librería adicional: seguimos usando las dependencias del proyecto.

## 2. Activar el motor inteligente y la transcripción

Edita **`.env.local`** (no `.env.local.example`) y verifica que cada variable esté definida **una sola vez**:

```dotenv
# Activa interpretación de varias operaciones mediante OpenAI
ORDERVOICE_PROVIDER=openai
ORDERVOICE_INTENT_MODEL=gpt-6.1-sol

# Transcripción de audio del navegador mediante OpenAI
ORDERVOICE_BROWSER_STT_PROVIDER=openai

# Conserva tu propia clave API existente (no la compartas)
OPENAI_API_KEY=TU_CLAVE_PRIVADA
```

**No borres** tus valores privados de Twilio ni tu antigua línea `ORDERVOICE_TTS_PROVIDER=openai` si la tienes. Esta última afecta la voz de la integración telefónica, **no** la voz hablada en Edge.

Para esta prueba del navegador el gasto de API proviene de dos pasos: transcripción de audio y comprensión del pedido. **No hay llamadas telefónicas, por lo que no consume saldo de Twilio.**

**Permisos de la clave:** en OpenAI Platform, comprueba que el proyecto y la clave puedan usar *Responses* y *Audio transcriptions*. Una clave restringida solo a *Text-to-speech* puede transcribir o sintetizar según sus permisos, pero no interpretar pedidos mediante Responses.

**Modelo recomendado para la exposición:** `gpt-6.1-sol` prioriza comprensión de instrucciones complejas. Si en las pruebas tarda demasiado, cambia a `ORDERVOICE_INTENT_MODEL=gpt-6.1-terra` para priorizar velocidad y costo.

La voz sigue siendo la de Microsoft Edge. El costo de TTS por OpenAI en el navegador **no está activado** en esta rama.

## 3. Validar la instalación sin gastar créditos

Con el servidor detenido, ejecuta en PowerShell:

```powershell
npm.cmd run typecheck
npm.cmd run test:orders
npm.cmd run test:dialogue
npm.cmd run test:fast
npm.cmd run test:browser:voice
npm.cmd run test:plan
```

`test:plan` prueba la seguridad del carrito ante operaciones múltiples, cantidades inválidas, productos inexistentes, cambios, preguntas y negaciones **sin llamar a OpenAI**.

## 4. Primera prueba real por voz (usa API)

Inicia Next.js:

```powershell
npm.cmd run dev
```

Abre **http://localhost:3000** en Microsoft Edge. Debe aparecer el encabezado **«v0.9 conversación inteligente»**.

1. Pulsa **Reiniciar** para vaciar el carrito de pruebas y la conversación anterior.
2. Marca **Revisar y corregir el texto antes de enviarlo al motor**.
3. Pulsa **🎙 Grabar con transcripción OpenAI**. Habla durante 2–10 segundos.
4. Pulsa **■ Detener y transcribir**. Comprueba el texto bajo **«Texto reconocido por la API»**.
5. Si detectas errores, corrige en el cuadro de mensaje y pulsa **Enviar**.
6. Observa **«Interpretación IA»** y comprueba que concuerde con **«Pedido actual»** y el total.
7. Escucha la respuesta desde Edge. La grabación se realiza una frase por turno.

**Para reconocer un problema:** si *Texto reconocido* es incorrecto, falla la transcripción; si el texto es correcto pero *Interpretación IA* es incorrecta, falla la comprensión; si la interpretación es correcta pero el carrito no cambia, hay una validación que revisar.

## 5. Casos de prueba variados

Prueba cada frase en un turno distinto y compara los productos y cantidades:

| Caso | Frase de ejemplo | Esperado |
|---|---|---|
| Pedido compuesto | «Quiero una pepperoni familiar, dos gaseosas y una margarita mediana» | Los tres productos, sin duplicados |
| Adición posterior | «Ponme otra margarita mediana» | Suma 1 margarita, conserva lo demás |
| Cambio de pizza | «No, mejor cambia la pepperoni por una hawaiana familiar» | Reemplaza la pizza indicada |
| Ajuste de cantidad | «Tengo dos gaseosas, deja solamente una gaseosa, las pizzas igual» | Una gaseosa, pizzas intactas |
| Eliminar productos | «Quita una gaseosa y una pepperoni familiar» | Resta 1 unidad de cada una |
| Estado final | «Solamente quiero que queden una gaseosa y una margarita mediana» | El carrito se reconstruye con esos dos productos |
| Consulta de precio | «¿Cuánto cuesta la hawaiana familiar?» | Responde USD 15,00 sin agregarla |
| Consulta del total | «¿Cuánto llevo hasta ahora?» | Da el total sin cambiar nada |
| Negación | «No quiero que elimines ninguna pizza» | No elimina pizzas |
| Pregunta ambigua | «Quiero quitar esa pizza», teniendo varios sabores | Solicita aclaración |
| Incompleto | «Quiero dos pizzas» | Pregunta qué sabores y tamaños |
| Producto no disponible | «Quiero una pizza de pollo» | No inventa ni añade producto |
| Confirmación | «Confirmo mi pedido» | Confirma explícitamente el carrito |
| Hipotético | «¿Qué pasaría si confirmara el pedido?» | No lo confirma |

## 6. Evaluación con la API real (opcional, de pago)

El proyecto incluye una batería de **15 casos de voz transcrita y conversación** para probar la interpretación real de OpenAI. **Solo corre si tú la activas**. Antes de ejecutar, comprueba que el servidor siga activo:

```powershell
$env:ORDERVOICE_RUN_PAID_EVAL="YES"
npm.cmd run test:intelligence:live
```

Lee los resultados `OK` / `FALLO`, con el tiempo por caso. Esta prueba hace varias llamadas a la API y consume créditos; **no genera audio ni llamadas Twilio**. Para volver a bloquear el test de pago:

```powershell
Remove-Item Env:ORDERVOICE_RUN_PAID_EVAL
```

Cuando falla un caso, envía el texto de la prueba y la respuesta (nunca la clave). Ajustaremos el prompt, la validación o el diálogo con evidencia real. Los resultados todavía deben comprobarse en tu computadora.

## 7. Seguridad y límites conocidos

- La IA solo devuelve un plan. El servidor mantiene un menú cerrado y precios verificados. **No puede inventar ítems ni saltarse el máximo de 20 unidades por producto**.
- Los cambios se validan **completos** antes de actualizar el carrito; si alguna operación falla, se conserva el carrito anterior.
- Negaciones y preguntas se tratan de forma conservadora; para una frase contradictoria se pide aclaración en vez de adivinar.
- No se emite una venta real ni se envía un pedido a una cocina.
- La transcripción del micrófono se envía a OpenAI si `ORDERVOICE_BROWSER_STT_PROVIDER=openai`; el texto se envía a OpenAI si `ORDERVOICE_PROVIDER=openai`. **Ambas partes pueden generar costos**.
- Las claves API se quedan en el servidor y nunca deben publicarse. No se necesita ngrok.
- El flujo telefónico anterior continúa en la rama base; **los cambios v0.9 solo se usan en solicitudes no telefónicas**.
- Si la IA falla o alcanza su límite, el servidor devuelve un error sin modificar el carrito.
- Los tests automatizados locales verifican invariantes del código, pero las métricas reales de precisión deben evaluarse con el micrófono y los escenarios de la exposición.

Documentación oficial de modelos y salida estructurada: https://developers.openai.com/api/docs/guides/structured-outputs

## 8. Si la transcripción funciona pero sale "La IA no pudo interpretar el pedido"

La grabación y el reconocimiento de voz son correctos; el error pertenece al endpoint **Responses** que interpreta el texto, por ejemplo por permisos de la clave, falta de acceso al modelo, límite de créditos, validación del esquema o tiempo de espera.

La rama v0.9 incluye mensajes específicos según el HTTP devuelto, y un diagnóstico seguro de una sola consulta. Desde la carpeta con `package.json`, ejecuta:

```powershell
npm.cmd run diagnose:intelligence
```

Esto **sí consume una única consulta pequeña de texto** a OpenAI (no llama a Twilio ni transcribe audio). El comando lee tu archivo privado `.env.local` y muestra **solo** el estado del acceso a Responses y el esquema, sin imprimir la clave ni el audio.

- **HTTP 403:** revisa OpenAI Platform → API keys → tu clave restringida → *Model capabilities* → **Responses (/v1/responses): Request**. Comprueba también acceso al modelo del proyecto.
- **HTTP 401:** comprueba que `OPENAI_API_KEY` sea válida y pertenezca al proyecto correcto.
- **HTTP 404:** comprueba el nombre del modelo en `ORDERVOICE_INTENT_MODEL` y su disponibilidad.
- **HTTP 429:** revisa el saldo, límites o cuota de tu proyecto OpenAI API.
- **HTTP 400:** captura el detalle del parámetro inválido que aparece en la terminal; se deberá corregir el esquema o la petición.
- **Timeout/error de certificado:** revisa conexión, antivirus/proxy o el certificado del sistema de Windows.

No cambies la configuración de Twilio por un error de interpretación en el navegador. Tras corregir la causa, reinicia Next.js y prueba con un pedido simple escrito antes de repetir la grabación.

