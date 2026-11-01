# Pruebas manuales — OrderVoice AI v0.2

## Preparación
- Ejecuta `npm install`, luego `npm run dev` y abre http://localhost:3000.
- Sin clave de OpenAI, el sistema funciona en modo demostración gratuito.
- Ejecuta `npm run test:orders` para las comprobaciones automatizadas locales.

## Conversación de prueba
1. `Quiero dos pepperoni familiares y una hawaiana mediana` → $38,00.
2. `Cambia una pepperoni familiar por una hawaiana mediana` → $34,00; queda 1 pepperoni familiar y 2 hawaianas medianas.
3. `¿Cuánto es el total?` → $34,00 sin modificar el carrito.
4. `Agrega una gaseosa` → $36,50.
5. `Quita tres pepperoni familiares` → operación rechazada sin cambios.
6. `Quiero tres pizzas` → debe pedir sabor/tamaño; no debe añadir productos.
7. `Confirmo el pedido` → pedido ficticio guardado en este navegador, carrito vacío.
8. Recarga la página y comprueba que sigue apareciendo el pedido confirmado.

## Limitaciones
- Las reglas de voz/texto son deliberadamente acotadas: no interpretan todos los giros del español.
- No hay llamadas telefónicas, cobros ni envíos reales a cocina.
- Los precios pertenecen a un menú ficticio y se calculan en centavos.
- Los reemplazos se procesan de uno en uno. Las solicitudes mixtas o ambiguas deben aclararse.
- No fusionar con main hasta comprobar que `npm run test:orders` y `npm run build` funcionan en el equipo de desarrollo.
