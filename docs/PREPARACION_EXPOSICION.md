# Preparación para la exposición del Criterio 2 — OrderVoice AI

**Modalidad:** individual. **Entrega:** jueves 26/11/2026 antes de las 13:30 (hora de Ecuador). **Evaluación:** 50 puntos.  
**No memorices una respuesta sin comprenderla.** Señala los archivos en VS Code al explicarlos.

## Explicación de 2 minutos

> «OrderVoice AI es una aplicación educativa para una pizzería ficticia. En esta entrega construí un monolito con Next.js y PostgreSQL. Es un monolito porque presenta una sola aplicación principal, pero el código está organizado en tres capas. La presentación recibe peticiones HTTP; la aplicación verifica los casos de uso y reglas; la persistencia realiza consultas SQL y transacciones. Implementé APIs REST propias para clientes, productos, sesiones y pedidos. El cliente puede pedir una pepperoni familiar por 14 dólares, cambiarla por una hawaiana mediana de 10 dólares, consultar el total y confirmar. Ese pedido queda persistido en PostgreSQL. Documenté todas las rutas en OpenAPI, tengo pruebas automatizadas de éxito y error y una bitácora vinculada a drivers. OpenAI solo se usa para transcribir voz; las decisiones de negocio no requieren una API externa.»  

## Diagrama para dibujar en la pizarra

```text
NAVEGADOR / VOZ (OpenAI solo transcribe audio)
                |
                v
CAPA PRESENTACIÓN: src/app/api/**/route.ts + src/presentation/http.js
                |
                v
CAPA APLICACIÓN: src/application/* + reglas locales src/lib/*
                |
                v
CAPA PERSISTENCIA: src/persistence/postgres.js
                |
                v
BASE DE DATOS PostgreSQL: clientes, productos, sesiones,
sesion_items, pedidos y pedido_items
```

## Cuatro flujos CU-01..CU-04

1. **CU-01 añadir:** `POST /api/sesiones/{id}/items` recibe `{"productId":"pepperoni-familiar","quantity":1}`. Servicio valida producto activo y cantidad, PostgreSQL registra. **14,00 USD**.
2. **CU-02 cambiar:** `PATCH /api/sesiones/{id}/items` reemplaza pepperoni-familiar por hawaiana-mediana. Valida que exista el original. SQL realiza el cambio dentro de **una transacción**. **10,00 USD**.
3. **CU-03 total:** `GET /api/sesiones/{id}` consulta líneas y devuelve el total desde precios de PostgreSQL. **10,00 USD**. No cambia el pedido.
4. **CU-04 confirmar:** `POST /api/sesiones/{id}/confirmar` exige `{"confirmar":true}`. Una transacción guarda `pedidos` y `pedido_items` y marca la sesión como confirmada. Una segunda confirmación devuelve **409 Conflict**.

## Preguntas probables y respuestas

**¿Qué es un monolito?**  
Una aplicación desplegada como una unidad que puede tener múltiples módulos y capas. No significa todo en un único archivo. Aquí Next.js implementa presentación y backend junto con PostgreSQL local.

**¿Por qué separaste tres capas?**  
Para que el HTTP no contenga SQL ni cálculos; la aplicación valida las reglas y la persistencia accede a tablas. Cada parte tiene una responsabilidad verificable.

**¿Qué es una API propia?**  
Un endpoint que programé en `src/app/api/**/route.ts`. No confundimos **desarrollar una API** con **consumir una API de terceros**.

**¿Qué significa REST?**  
Usamos operaciones HTTP estándar, como GET para consultar, POST para crear y PATCH para cambiar. Los endpoints devuelven JSON y códigos HTTP como 200, 201, 400, 404, 409 y 422.

**¿Qué es OpenAPI?**  
Es el contrato en `docs/openapi.yaml`: documenta rutas, métodos, parámetros, cuerpos, respuestas y errores, para que el profesor pueda verificar que coincide con la aplicación.

**¿Por qué PostgreSQL y no localStorage?**  
PostgreSQL conserva los pedidos después de recargar el navegador y los relaciona con clientes, sesiones y líneas de producto. El navegador ya no es la fuente de verdad del pedido.

**¿Qué es una transacción?**  
Es un conjunto de modificaciones que se confirma por completo con COMMIT o se revierte con ROLLBACK. Evita guardar un pedido incompleto. Un bloqueo `FOR UPDATE` impide confirmar la misma sesión simultáneamente.

**¿Qué significa idempotencia de confirmación?**  
Un segundo intento no crea otro pedido: devuelve **409**, por el estado confirmado y la restricción UNIQUE del pedido sobre `sesion_id`.

**¿Qué valida el sistema?**  
Producto existente y activo, cantidad entera entre 1 y 20, precio positivo/no negativo para catálogo, sesión abierta y confirmación explícita. No acepta que el cliente invente los precios de las líneas.

**¿Dónde se calcula el precio?**  
El servicio de aplicación suma cantidades por precios devueltos por PostgreSQL (en centavos). La voz o la IA no fija el precio.

**¿Usas OpenAI para entender los pedidos?**  
No. En esta rama académica solo puede transcribir audio. El motor local `order-engine.ts`, `fast-intents.ts` y `pizza-dialogue.ts` interpreta expresiones limitadas.

**¿Qué son pruebas unitarias y pruebas de integración?**  
`npm run test:monolith` verifica casos de uso y errores con un repositorio de prueba, sin base real. `npm run test:monolith:http` ejecuta solicitudes HTTP auténticas y comprueba los resultados de PostgreSQL.

**¿Qué son drivers de arquitectura?**  
Son necesidades y restricciones que guían decisiones. CU-01..CU-04 y drivers de integridad, seguridad y separación de proveedor de voz se reflejan en la bitácora y código.

**¿Por qué no microservicios?**  
Porque la consigna exige un **monolito en capas**, no descomposición en servicios independientes; microservicios quedan fuera de esta entrega.

**¿Qué le falta al prototipo para ser comercial?**  
Autenticación, autorización, gestión multi-restaurante, auditoría, control de tasa, inventario, pagos y cumplimiento de privacidad. Ninguno se afirma como implementado.

## Demostración segura en el laboratorio

1. Con el servidor corriendo, abrir `http://localhost:3000/api/salud`: estado **ok**.
2. Abrir `http://localhost:3000/api/productos`: menú desde PostgreSQL.
3. Ejecutar `npm.cmd run test:monolith:http` en terminal separada: muestra flujos CU-01..CU-04 y fallos 422/409 controlados.
4. En pgAdmin, seleccionar **ordervoice_db** y ejecutar `SELECT id, estado, total_centavos FROM pedidos ORDER BY creado_en DESC LIMIT 5;`
5. Mostrar `docs/openapi.yaml`, `tests/monolith.test.mjs`, `docs/bitacora.md` y señalar la ubicación de cada capa.
6. Opcional: si el micrófono y la red están disponibles, demostrar la voz continua; no es necesario para demostrar que funcionan las APIs de negocio.

## Cinco criterios de la rúbrica

- 15 puntos: flujos completos reales.
- 12 puntos: capas separadas sin SQL en controladores.
- 8 puntos: contrato OpenAPI alineado.
- 10 puntos: pruebas automatizadas de éxito y error reproducibles.
- 5 puntos: bitácora con fecha, drivers, archivos, pruebas y pendientes.

## Lo que debes entregar en Moodle

- Enlace HTTPS al repositorio.
- Rama `dev/criterio2-monolito`.
- SHA del **último commit de entrega**, después de pruebas aprobadas.
- Asegúrate de que el profesor pueda leer el repo.
- Indica comandos `npm install`, `npm run db:init`, `npm test`, `npm run dev`, `npm run test:monolith:http`.

**Importante:** este resumen no afirma que haya un restaurante real ni cobros reales. Los datos de demostración son ficticios.
