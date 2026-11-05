# Guía de instalación de OrderVoice AI v0.6 en Windows

**Proyecto:** OrderVoice AI · Prototipo de asistente para pedidos de una pizzería ficticia  
**Rama para esta guía:** `dev/v0.6`  
**Dirigida a:** estudiantes y personas que quieran ejecutar el proyecto en otra computadora (por ejemplo, un laboratorio universitario).

> **Lee esto primero:** para mostrar la página, el menú y los pedidos **no necesitas instalar Ollama, ngrok ni Twilio**, y **no necesitas una API key**. Comienza con el **Modo A: demostración local**. El **Modo B: IA local con Ollama** y el **Modo C: llamadas telefónicas** son ampliaciones opcionales.

## 1. ¿Qué debo descargar e instalar?

| Programa o servicio | ¿Es necesario para el Modo A? | Para qué sirve | Descarga o acceso oficial |
|---|---|---|---|
| **Node.js** con **npm** | **Sí** | Ejecutar Next.js e instalar las dependencias del proyecto. No se descarga npm por separado. | [nodejs.org](https://nodejs.org/en/download) |
| **Git** | **Sí, para clonar** (opcional si descargas ZIP) | Descargar y actualizar el repositorio. | [git-scm.com/install/windows](https://git-scm.com/install/windows) |
| **Visual Studio Code** | Recomendado | Abrir el código y ejecutar terminales. | [code.visualstudio.com](https://code.visualstudio.com/download) |
| **Navegador** (Edge o Chrome) | **Sí** | Abrir `http://localhost:3000`. | [Microsoft Edge](https://www.microsoft.com/edge) / [Google Chrome](https://www.google.com/chrome/) |
| **Ollama** | **No** · Modo B | Interpretar solicitudes mediante un modelo de IA ejecutado localmente. | [ollama.com/download/windows](https://ollama.com/download/windows) |
| **Modelo `llama3.2:3b`** | **No** · Modo B | Modelo que se descarga desde Ollama; aproximadamente 2 GB. | [ollama.com/library/llama3.2](https://ollama.com/library/llama3.2) |
| **ngrok** | **No** · Modo C | Dar una dirección HTTPS pública temporal a Next.js para que Twilio alcance el webhook. | [ngrok.com/download](https://ngrok.com/download) |
| **Cuenta Twilio Voice** | **No** · Modo C | Iniciar/probar llamadas telefónicas; tiene condiciones de cuenta y posibles costos. | [twilio.com](https://www.twilio.com/) |
| **OpenAI Platform (API)** | **No** · solo voz opcional del Modo C | Generar voz con OpenAI; se factura aparte de ChatGPT. | [platform.openai.com](https://platform.openai.com/) |

### Bibliotecas que npm instala automáticamente

En la raíz del repositorio está `package.json`. Al ejecutar `npm.cmd ci`, npm descarga las versiones fijadas en `package-lock.json`, incluyendo:

- **Next.js 16**, **React 19** y **React DOM 19**.
- **OpenAI SDK 6** y **Zod 4**.
- **TypeScript** y los tipos de Node/React.

**No descargues cada librería manualmente.** El comando `npm.cmd ci` las instala juntas. Se requiere internet y espacio libre en disco.

### Requisitos generales

- Windows 10/11 y permiso para ejecutar las aplicaciones necesarias.
- Node.js compatible con la versión declarada por el repositorio (**Node.js 20.9 o superior**). Recomendada una versión LTS compatible.
- Espacio suficiente para `node_modules`; Ollama necesita **espacio adicional** para el modelo.
- Para el dictado por micrófono en el navegador, permite su uso y comprueba compatibilidad y permisos del equipo.

---

## 2. Comprobar lo que ya está instalado

En **VS Code → Terminal → New Terminal**, abre PowerShell y ejecuta:

```powershell
git --version
node --version
npm.cmd --version
```

Si `git` no se reconoce, instala Git y **reinicia VS Code** para actualizar el PATH.
Si `node` no se reconoce, instala Node.js y abre una terminal nueva.

> **Importante en las computadoras del laboratorio:** PowerShell puede bloquear `npm.ps1` y mostrar «la ejecución de scripts está deshabilitada». **Usa `npm.cmd` en vez de `npm`**. Esto evita cambiar la política de seguridad de la computadora.
>
> En la computadora de laboratorio utilizada para la prueba ya se verificaron Git, Node.js y `npm.cmd`, así que **no hace falta volver a instalarlos** allí.

---

## Modo A. Ejecutar el menú y los pedidos sin API ni llamadas (recomendado en laboratorio)

### Paso 1. Clonar el repositorio

En una carpeta de trabajo donde tengas permisos de escritura:

```powershell
git clone -b dev/v0.6 https://github.com/cedenoiker88-lang/OrderVoice-AI.git
cd OrderVoice-AI
```

**Si ya lo clonaste**, no vuelvas a ejecutar `git clone`. Entra en su carpeta:

```powershell
cd "C:\Users\Manta_lab1_027\Downloads\Prueba\OrderVoice-AI"
```

La ruta anterior corresponde a **un ejemplo de la computadora del laboratorio**. Si la carpeta está en otro lugar, usa su ubicación real.

Para actualizar el proyecto cuando ya existe:

```powershell
git switch dev/v0.6
git pull origin dev/v0.6
```

Comprueba que en esta carpeta existan `package.json`, `package-lock.json` y `src`:

```powershell
Get-ChildItem package.json, package-lock.json, src
```

### Paso 2. Abrir la carpeta correcta en VS Code

Selecciona **File → Open Folder** y abre la carpeta **`OrderVoice-AI`**, la que contiene el archivo **`package.json`**.

### Paso 3. Instalar las dependencias del proyecto

En una terminal nueva **dentro de `OrderVoice-AI`**:

```powershell
npm.cmd ci
```

Es normal que descargue paquetes. Si termina correctamente, se creará la carpeta `node_modules`. **No se debe subir esa carpeta a GitHub.**

### Paso 4. Activar el modo demostración sin IA externa

En la raíz del proyecto crea un archivo llamado exactamente **`.env.local`** (al mismo nivel que `package.json`) con este contenido:

```dotenv
ORDERVOICE_PROVIDER=demo
```

Este modo **no requiere Ollama, OpenAI, Twilio ni ngrok** y no consume créditos. Usa reglas limitadas para simular pedidos. `.env.local` es **privado**; no lo subas al repositorio.

### Paso 5. Ejecutar la aplicación

```powershell
npm.cmd run dev
```

Cuando veas `Ready` y la dirección local, abre en el navegador:

**http://localhost:3000**

Si Next.js usa otro puerto (por ejemplo 3001), abre exactamente la dirección que muestre la terminal. Mantén esa terminal abierta mientras usas la aplicación.

### Paso 6. Probar un pedido

En la interfaz, prueba frases como:

1. `Quiero una pizza pepperoni familiar`
2. `¿Cuánto es el total?`
3. `Agrega una gaseosa`
4. `Confirmo el pedido`

Los precios salen del menú definido en el servidor. Los pedidos de esta versión son de demostración; **no se envían a una cocina ni se cobran**.

### Paso 7. Ejecutar pruebas técnicas sin gastar créditos

Abre **otra terminal**, en la misma carpeta `OrderVoice-AI`:

```powershell
npm.cmd run typecheck
npm.cmd run test:orders
npm.cmd run test:dialogue
npm.cmd run test:fast
```

Las pruebas anteriores no necesitan llamadas telefónicas ni una clave API.

### Paso 8. Detener Next.js

En la terminal donde corre `npm.cmd run dev`, presiona **Ctrl + C**. Al finalizar puedes cerrar VS Code.

---

## Modo B. Activar IA local con Ollama (opcional)

**Solo si deseas que el chat utilice IA local** en lugar del modo de reglas.

### Paso 1. Instalar Ollama

Descarga e instala Ollama para Windows desde [ollama.com/download/windows](https://ollama.com/download/windows). Comprueba:

```powershell
ollama --version
```

Si no se reconoce, cierra y vuelve a abrir la terminal. La instalación del programa y del modelo requiere espacio libre en disco; el tiempo de respuesta depende del procesador y la memoria de la computadora.

### Paso 2. Descargar el modelo que usa el proyecto

```powershell
ollama pull llama3.2:3b
ollama list
```

La segunda orden debe listar `llama3.2:3b`.

### Paso 3. Comprobar el servidor local de Ollama

Con Ollama funcionando:

```powershell
Invoke-RestMethod http://localhost:11434/api/tags
```

Si responde mostrando modelos, el servidor local es accesible. **No publiques el puerto 11434 en internet.**

### Paso 4. Configurar el proyecto

Cambia **`.env.local`** por estas líneas:

```dotenv
ORDERVOICE_PROVIDER=ollama
OLLAMA_MODEL=llama3.2:3b
```

Guarda el archivo y reinicia Next.js con `Ctrl + C` y:

```powershell
npm.cmd run dev
```

Comprueba Ollama desde otra terminal:

```powershell
npm.cmd run test:ollama
```

**Si no puedes instalar Ollama en el laboratorio, usa el Modo A.** No es necesario para presentar el menú ni el motor de pedidos.

---

## Modo C. Probar llamadas telefónicas reales (opcional; NO recomendado en PC compartida)

Este modo necesita **más configuración que clonar el repositorio**:

1. Tener **Next.js** ejecutándose en la computadora que servirá el webhook.
2. Instalar/configurar **ngrok** (o un servidor HTTPS público seguro) apuntando al puerto local de Next.js. Ejemplo: `ngrok http 3000`.
3. Tener una **cuenta Twilio** con acceso a las funciones Voice necesarias y configurar el webhook de voz correcto.
4. Configurar las credenciales privadas **en el servidor**, dentro de `.env.local`, siguiendo [VOZ_OPENAI_V06.md](VOZ_OPENAI_V06.md) y [LLAMADAS_RAPIDAS_V06.md](LLAMADAS_RAPIDAS_V06.md).
5. Para respuestas con voz OpenAI, tener **una API key de OpenAI Platform** con permisos y saldo aplicable. Esta API puede generar cargos. **ChatGPT Plus no sustituye la facturación de la API**.
6. Los **audios locales pregrabados** y las claves privadas **no se descargan al clonar**: se guardan fuera del repositorio por seguridad.
7. Ejecutar **primero las pruebas locales sin llamadas** y después, si todo está listo, una llamada controlada. El prototipo todavía tiene limitaciones de latencia y volumen en ciertas respuestas.

**Seguridad:** nunca introduzcas claves privadas o tokens personales en un equipo universitario compartido si no puedes garantizar su protección. No publiques `.env.local`, URLs con `trial_key`, capturas de tokens, `node_modules` ni audios privados en GitHub.

---

## 3. Solución de problemas frecuentes

| Error o síntoma | Solución recomendada |
|---|---|
| `git` no se reconoce | Instala Git, reinicia VS Code y prueba `where.exe git`. |
| `npm.ps1` está bloqueado por PowerShell | Usa **`npm.cmd`**. No necesitas cambiar `ExecutionPolicy`. |
| `ENOENT ... package.json` | La terminal está en la carpeta equivocada. Entra en **`OrderVoice-AI`** antes de ejecutar npm. |
| `npm.cmd ci` falla | Revisa internet, permisos, espacio, proxy/certificados del laboratorio y que exista `package-lock.json`. No borres el lockfile sin investigar. |
| Página de Next.js no abre | Comprueba que `npm.cmd run dev` siga activo y utiliza el puerto mostrado por la terminal. |
| El puerto 3000 está ocupado | Usa el nuevo puerto mostrado por Next.js; no asumas que siempre será 3000. |
| «Ollama no está disponible» | Ejecuta en modo demo o instala Ollama, descarga `llama3.2:3b` y comprueba `http://localhost:11434/api/tags`. |
| `SELF_SIGNED_CERT_IN_CHAIN` al usar OpenAI desde Node.js en Windows | En **tu terminal del servidor** intenta `$env:NODE_USE_SYSTEM_CA="1"` antes de `npm.cmd run dev`. No desactives la verificación TLS. Consulta al administrador de red si persiste. |
| La prueba telefónica funciona por HTTP pero una llamada se corta | No es un fallo de instalación local: revisa los registros de Twilio/ngrok/Next.js y las limitaciones de la demo. |

## 4. Lista de verificación final

- [ ] `git --version` responde (o ya descargué el ZIP).
- [ ] `node --version` y `npm.cmd --version` responden.
- [ ] Abrí la **raíz** `OrderVoice-AI` que contiene `package.json`.
- [ ] `npm.cmd ci` terminó sin errores.
- [ ] Guardé `.env.local` con `ORDERVOICE_PROVIDER=demo` (si uso el Modo A).
- [ ] `npm.cmd run dev` muestra `Ready`.
- [ ] Puedo abrir la página y hacer pedidos ficticios.
- [ ] Ejecuté las pruebas locales correspondientes.
- [ ] No expuse ninguna clave privada.

## 5. Enlaces del proyecto

- Repositorio: [OrderVoice-AI](https://github.com/cedenoiker88-lang/OrderVoice-AI)
- Rama de trabajo: [dev/v0.6](https://github.com/cedenoiker88-lang/OrderVoice-AI/tree/dev/v0.6)
- Documentación complementaria: [Ollama local](OLLAMA_LOCAL.md), [telefonía](TELEFONIA_PLAN.md), [voz OpenAI v0.6](VOZ_OPENAI_V06.md), [llamadas rápidas v0.6](LLAMADAS_RAPIDAS_V06.md).

**Nota de alcance:** la aplicación puede ejecutarse localmente en modo demostración sin usar servicios de pago. Eso **no implica** que estén listas las llamadas reales ni que el proyecto sea un producto comercial terminado.
