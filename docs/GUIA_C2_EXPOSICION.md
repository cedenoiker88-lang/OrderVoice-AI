# Guía de instalación y exposición · Criterio 2 (50 puntos)

Proyecto individual OrderVoice AI. **Fecha límite en Moodle: jueves 26/11/2026, 13:30 (hora de Ecuador).** Entregar URL HTTPS del repositorio + rama y commit, no solo capturas.

## 1. Instalar y preparar PostgreSQL local

- Reutiliza tu PostgreSQL + pgAdmin de las prácticas de bases de datos. Inicia el servicio PostgreSQL.
- En pgAdmin, conéctate al servidor local, abre Query Tool sobre la base `postgres` y ejecuta:

```sql
CREATE DATABASE ordervoice_db;
```

Si ya existe, no repitas CREATE DATABASE. No uses credenciales del profesor ni de compañeros.

## 2. Obtener rama académica en VS Code

Dentro de la carpeta donde está `package.json`, detén cualquier servidor anterior con `Ctrl+C`, luego:

```powershell
git fetch origin
git switch -c dev/criterio2-monolito --track origin/dev/criterio2-monolito
npm.cmd install
```

**Importante:** usa `npm.cmd install` (no `npm ci`) la primera vez, porque se añadió el driver propio de conexión PostgreSQL `pg` y deberá actualizarse el lock local.

## 3. Configurar la conexión

En `.env.local`, agrega (sustituye `TU_CLAVE_POSTGRES_LOCAL` por tu contraseña de PostgreSQL; evita espacios no escapados en URL):

```dotenv
DATABASE_URL=postgresql://postgres:TU_CLAVE_POSTGRES_LOCAL@localhost:5432/ordervoice_db
ORDERVOICE_BROWSER_STT_PROVIDER=openai
```

- Conserva tu `OPENAI_API_KEY` actual **solo** para reconocimiento de voz.
- No necesitas habilitar `ORDERVOICE_PROVIDER=openai` para interpretación; la rama académica usa un intérprete local sin consultar servicios externos.
- Nunca compartas la contraseña ni `.env.local` en imágenes, GitHub o Moodle.
- PostgreSQL debe ser local: no hay necesidad de contratar servicios en la nube.

Inicializa las seis tablas y el menú de demostración:

```powershell
npm.cmd run db:init
```

Resultado esperado: mensaje `OK: PostgreSQL preparado...`. Si falla con `ECONNREFUSED`, inicia PostgreSQL. Si falla con `28P01`, revisa usuario/contraseña.

## 4. Pruebas automatizadas

```powershell
npm.cmd run typecheck
npm.cmd run test:monolith
npm.cmd run test:plan
```

`test:monolith` usa repositorio doble en memoria y no consume APIs. Comprueba CU-01..CU-04, error por carrito vacío, producto inválido, cantidades fuera de rango, reemplazo imposible, límites y doble confirmación. **Deja la terminal con resultados visibles y toma una captura real.**

## 5. Levantar el monolito

En la primera terminal PowerShell:

```powershell
$env:NODE_USE_SYSTEM_CA="1"
npm.cmd run dev
```

Abre `http://localhost:3000`. En una segunda terminal de VS Code:

```powershell
npm.cmd run test:monolith:http
```

Esta prueba crea datos ficticios, recorre solicitudes HTTP reales y verifica que el pedido se haya guardado en PostgreSQL. No utiliza OpenAI ni Twilio.

También puedes abrir `http://localhost:3000/api/salud` y `http://localhost:3000/api/productos` para demostrar endpoints GET.

## 6. Demostración de la exposición, con tus propias APIs

**Opción rápida:** ejecuta `npm.cmd run test:monolith:http`, abre `/api/pedidos` en el navegador y en pgAdmin corre:

```sql
SELECT s.id AS sesion, s.estado, p.total_centavos, p.creado_en
FROM sesiones s JOIN pedidos p ON p.sesion_id=s.id
ORDER BY p.creado_en DESC LIMIT 5;

SELECT pi.producto_id,pi.cantidad,pi.precio_unitario_centavos
FROM pedido_items pi
ORDER BY pi.pedido_id DESC LIMIT 10;
```

**Explicación del flujo:** una petición POST crea la sesión; POST añade pepperoni familiar (1400); PATCH cambia por hawaiana mediana (1000); GET consulta total sin mutarlo; POST con confirmación explícita guarda `pedidos` y `pedido_items` en transacción. Un segundo POST para confirmar responde 409 en vez de duplicar.

**Demostración de la voz:** entra a la interfaz; pulsa `Iniciar conversación continua` y dicta una pizza; la API de OpenAI hace la transcripción, el intérprete **local** decide qué significa, y el servicio del monolito guarda el carrito en PostgreSQL. La voz de Edge lee la respuesta. Si la transcripción falla en el laboratorio por conexión/certificados, la API REST por HTTP es el camino central de la evaluación y funciona sin OpenAI.

## 7. Qué mostrar al docente

- `src/app/api/**/route.ts`: controladores HTTP propios.
- `src/presentation/http.js`: transformación HTTP/errores y composición.
- `src/application/monolith-service.js`: reglas y casos de uso.
- `src/persistence/postgres.js`: SQL y transacciones.
- `sql/001_monolito.sql`: esquema de datos y siete productos.
- `docs/openapi.yaml`: contrato y códigos de error.
- `tests/monolith.test.mjs` y `scripts/smoke-monolith.mjs`: pruebas automatizadas.
- `docs/bitacora.md`: drivers y evolución versionada.

## 8. Entrega en Moodle

Sube **el enlace al repositorio** `https://github.com/cedenoiker88-lang/OrderVoice-AI`, especifica la rama `dev/criterio2-monolito` y el hash del commit de entrega. Asegura acceso de lectura al docente. Anota comandos `npm install`, `npm run db:init`, `npm run dev`, `npm run test:monolith` y `npm run test:monolith:http`.

Si el repositorio es privado, agrega al docente como colaborador con permisos de lectura, sin compartir claves.

## 9. Guion de exposición en ~2 minutos

> «OrderVoice AI es un prototipo para una pizzería ficticia. En el Criterio 2 implementé un monolito Next.js organizado en tres capas: presentación recibe HTTP, aplicación valida reglas y persistencia consulta PostgreSQL. Construí APIs propias para productos, clientes, sesiones y pedidos. Los cuatro casos de uso del Criterio 1 permiten agregar una pepperoni familiar, cambiarla por hawaiana mediana, consultar el total de diez dólares y confirmar explícitamente. Los precios vienen de la base de datos y las operaciones se hacen con transacciones. Documenté los endpoints en OpenAPI, añadí pruebas con Node Test Runner y registré los cambios en la bitácora. OpenAI se usa exclusivamente para transcribir voz, no para decidir ni guardar pedidos.» 

Este guion debe decirse **solo cuando las pruebas y la base realmente funcionen**.
