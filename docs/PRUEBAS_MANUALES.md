# Checklist rápido de pruebas para v0.1

En `http://localhost:3000`, sin API key, prueba en este orden:

1. Escribe **Quiero dos pepperoni familiares y una hawaiana mediana**. Debe mostrar 3 pizzas y total **$38,00**.
2. Escribe **Agrega una gaseosa**. Debe mostrar total **$40,50**.
3. Escribe **Quita una pepperoni familiar**. Debe mostrar total **$26,50**.
4. Pulsa **Confirmar pedido**. Debe crear un pedido en la lista y dejar el carrito vacío.
5. Recarga la página. El pedido confirmado debería seguir en el listado de ese navegador.
6. Escribe **Quiero tres pizzas**. Debe pedir aclaración (no inventar tamaños ni sabores).
7. Intenta quitar más unidades de las existentes. El cambio no debe aplicarse.
8. En Chrome/Edge, pulsa micrófono, concede permisos y di "Una pepperoni mediana". Si el navegador soporta reconocimiento, debería convertir voz a texto.

Los precios corresponden únicamente al menú ficticio incluido.

**Nota:** si se configura una API real, la comprensión puede producir resultados distintos en casos ambiguos y habrá que añadir pruebas automatizadas y evaluaciones con conversaciones reales anonimizadas.
