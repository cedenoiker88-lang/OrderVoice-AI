/* Regresiones de voz de navegador: no usa micrófono, Twilio, Ollama ni APIs de pago. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function load(name, dependencies = {}) {
  const file = fs.readFileSync(path.join(__dirname, "..", "src", "lib", name), "utf8");
  const js = ts.transpileModule(file, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", js)((name) => {
    if (name in dependencies) return dependencies[name];
    throw Error("Importación inesperada: " + name);
  }, module, module.exports);
  return module.exports;
}
const menu = load("menu.ts");
const engine = load("order-engine.ts", { "./menu": menu });
const fast = load("fast-intents.ts", { "./menu": menu });
const dialogue = load("pizza-dialogue.ts");
const { normalizeVoiceTranscript } = load("voice-vocabulary.ts");
let cart = [], pending = null;
function utter(raw) {
  const message = normalizeVoiceTranscript(raw);
  const turn = dialogue.advancePizzaConversation(message, pending, cart);
  const command = engine.guardDestructiveIntent(raw,
    turn?.command ?? fast.fastUnderstand(message) ?? engine.demoUnderstand(message));
  pending = turn ? turn.pending : pending;
  const result = engine.applyCommand(cart, command);
  cart = result.confirmed ? [] : result.cart;
  if (result.confirmed || command.action === "clear") pending = null;
  return { result, command, message };
}
function total() { return menu.calculateTotal(cart); }
function reset() { cart = []; pending = null; }

// Variantes frecuentes del reconocedor y cambios reales.
assert.equal(utter("Hola, quiero una piza de peperoni grande porfa").message,
  "hola, quiero una pizza de pepperoni familiar por favor");
assert.equal(total(), 1400);
utter("No, mejor cámbiala por una hawaiiana mediana");
assert.deepEqual(cart, [{ productId: "hawaiana-mediana", quantity: 1 }]);
assert.equal(total(), 1000);
const totalBefore = total();
assert.match(utter("¿En cuánto va la cuenta?").result.reply, /10,00|10\.00/);
assert.equal(total(), totalBefore);
utter("Me puedes dar dos sodas");
assert.equal(total(), 1500);
assert.deepEqual(cart.find((x) => x.productId === "gaseosa"), { productId: "gaseosa", quantity: 2 });

// Consultar un precio no equivale a agregar una pizza.
const snapshot = JSON.stringify(cart);
assert.match(utter("¿Cuánto cuesta la pizza margarita familiar?").result.reply, /13,50|13\.50/);
assert.equal(JSON.stringify(cart), snapshot);
assert.match(utter("¿Tienen una pizza de pepperoni mediana?").result.reply, /men[uú]/i);
assert.equal(JSON.stringify(cart), snapshot);

// No efectuar acciones contra la voluntad del cliente.
utter("No quiero que cambies mi pizza por una margarita familiar");
assert.equal(JSON.stringify(cart), snapshot);
utter("No me agregues una pizza de pepperoni familiar");
assert.equal(JSON.stringify(cart), snapshot);
assert.equal(utter("¿Confirmo el pedido?").result.confirmed, false);
assert.equal(JSON.stringify(cart), snapshot);
assert.equal(utter("No quiero vaciar el carrito").result.confirmed, false);
assert.equal(JSON.stringify(cart), snapshot);
assert.equal(utter("Sí, confírmame mi pedido").result.confirmed, true);

// Aclaraciones, precios y cantidades en plural.
reset();
utter("Quiero dos pizas margherita medianas");
assert.equal(total(), 1700);
reset();
utter("Quiero una pizza grande");
assert.equal(total(), 0);
assert.ok(pending);
utter("De peperoni");
assert.equal(total(), 1400);
reset();
utter("Quiero una pizza hawaiana sin piña");
assert.equal(total(), 0);
reset();
utter("Quiero una pizza pequeña de jamón");
assert.equal(total(), 0);
reset();
utter("Me pones una cola de un litro");
assert.equal(total(), 250);
reset();
utter("¿Cuánto vale la gaseosa?");
assert.equal(total(), 0);

// No inventar productos que no existen.
reset();
utter("Quiero una pizza de pollo familiar");
assert.equal(total(), 0);
console.log("OK: vocabulario de Edge, correcciones, precios, negaciones y carrito protegido");
