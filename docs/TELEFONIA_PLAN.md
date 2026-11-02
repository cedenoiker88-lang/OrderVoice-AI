# OrderVoice AI — Diseño de telefonía (plan implementable, NO conectado todavía)

## Objetivo de producto
Un cliente marca el número de una pizzería, OrderVoice responde por audio, consulta el menú autorizado, captura los productos y confirma con el cliente. Cuando no entiende un dato, pregunta o transfiere a una persona. El pedido confirmado entra en un panel del negocio.

## Lo que funciona ahora (v0.5)
- Chat y pedidos en Next.js.
- Modelo local Ollama + motor de pedidos determinista.
- Conversación de voz en Edge/Chrome con Web Speech API y síntesis del navegador.
- No existe un número telefónico, enlace SIP, traspaso de audio ni integración con una cocina.

**Importante:** localhost:3000 solo atiende una página web. No puede recibir por sí solo llamadas a un número telefónico. Llamadas a números móviles/fijos comunes requieren acceso a la red telefónica (operador, SIP trunk o una infraestructura existente), normalmente con tarifas.

## Arquitectura modular propuesta

```text
    [Teléfono del cliente]                    [Teléfono SIP de prueba]
             |                                         |
      [Red telefónica]                                 |
             |                                         |
       [Proveedor SIP] (puede costar)                   |
             +-------------- [Asterisk / PBX] ----------+
                                      |
                            [Puente bidireccional]
                            RTP/AudioSocket/WebSocket
                                      |
                      [Detector de inicio/fin de voz]
                                      |
                       [Whisper local (voz -> texto)]
                                      |
                       [Motor de sesión y pedidos]
                          |                   |
                    [Ollama local]       [Menú validado]
                          |
                     [Respuesta corta]
                          |
                        [Piper]
                     (texto -> audio)
                          |
                     [Puente audio]
                          |
                      [Asterisk]
                          |
                  [Cliente escucha]
```

### Por qué Asterisk
Asterisk es una central telefónica abierta. Admite extensiones SIP y conexión con proveedores externos. La API ARI ExternalMedia permite llevar audio a un proceso propio y también introducir audio generado en un puente. El canal `chan_websocket` facilita comunicación con audio bidireccional en versiones compatibles (consultar versión instalada). Documentación:
- https://docs.asterisk.org/Configuration/Channel-Drivers/WebSocket/
- https://docs.asterisk.org/Development/Reference-Information/Asterisk-Framework-and-API-Examples/External-Media-and-ARI/
- https://docs.asterisk.org/Configuration/Channel-Drivers/SIP/Configuring-res_pjsip/

## Ruta de pruebas sin pagar telefonía
1. Configurar Asterisk en un entorno Linux o WSL2 compatible, sin publicar puertos en internet.
2. Crear extensiones SIP de prueba, con credenciales independientes, dentro de una red privada.
3. Instalar un cliente SIP gratuito en otro dispositivo; hacer una llamada entre extensiones (sin números de telefonía pública).
4. Implementar y probar el puente de audio de Asterisk a un servicio Node separado. Este paso aún no está realizado.
5. Reemplazar Web Speech API por captación de audio PCM y Whisper local; sintetizar respuesta con Piper y enviar el audio al puente.
6. Agregar control de turnos, VAD, silencios, interrupción, repetición, timeout y transferencia a un humano.
7. Validar llamadas completas en red privada y registro de pedidos, incluso con ruido.
8. **Solo después** evaluar un operador SIP compatible con el número real del restaurante.

Estas llamadas SIP de prueba son gratuitas en cuanto a minutos de telefonía, pero necesitan internet/red, equipo y energía. No son llamadas desde la red pública a un número celular o fijo.

## Orden de implementación sugerido
- Fase A (v0.5): medición real de latencia de voz, corrección de transcripciones y protección de pedidos.
- Fase B (v0.6): audio local (Whisper/Piper) desacoplado del navegador.
- Fase C (v0.7): motor de sesiones por llamada, puente Asterisk en entorno local y llamadas SIP de extremo a extremo.
- Fase D: panel restaurante, persistencia, reintentos y transferencia.
- Fase E: número real mediante proveedor SIP, cumplimiento normativo, seguridad, costes y pruebas piloto.

## Criterios mínimos para una prueba telefónica
- Dos clientes SIP conectados a extensiones autorizadas y una llamada al asistente de prueba.
- Audio bidireccional, sin eco, con latencia de respuesta medida desde fin del habla hasta inicio del audio.
- Pedido con tres productos, modificación, confirmación leída y carrito correcto.
- La IA no procesa el audio de su propia voz como pedido.
- Desconexión segura y limpieza de recursos al colgar.
- Captura de error y transferencia a humano cuando no entiende tras varios intentos.
- Registros sin secretos ni audio personal por defecto; consentimiento adecuado si se graba.
- Acceso remoto solo después de configurar autenticación, TLS cuando corresponda y cortafuegos.

## Límites del prototipo
No se ha probado interoperabilidad con un proveedor SIP ecuatoriano ni compatibilidad de números. No se garantizan llamadas públicas sin costo. No publicar Asterisk, Ollama ni puertos del servicio de media directamente a internet sin endurecimiento de seguridad.
