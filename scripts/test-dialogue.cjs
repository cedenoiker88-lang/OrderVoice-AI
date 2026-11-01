/* Regresiones del diálogo: ejecuta con TypeScript ya instalado, sin APIs externas. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(filename, dependencies = {}) {
  const input = fs.readFileSync(path.join(__dirname, "..", "src", "lib", filename), "utf8");
  const output = ts.transpileModule(input, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", output)((name) => {
    if (name in dependencies) return dependencies[name];
    throw new Error("Dependencia inesperada: " + name);
  }, module, module.exports);
  return module.exports;
}

const menu = load("menu.ts");
const engine = load("order-engine.ts", { "./menu": menu });
const dialog = load("pizza-dialogue.ts");
let cart = [];
let pending = null;
function say(message) {
  const turn = dialog.advancePizzaConversation(message, pending, cart);
  assert.ok(turn, "El diálogo debe procesar: " + message);
  pending = turn.pending;
  const result = engine.applyCommand(cart, turn.command);
  cart = result.cart;
  return result;
}

let r = say("Pero una pizza hawaiana");
assert.equal(cart.length, 0);
assert.equal(pending.flavor, "hawaiana");
assert.equal(pending.size, undefined);
assert.match(r.reply, /tamaño/i);

r = say("Quiero una pizza familiar");
assert.equal(pending, null);
assert.equal(cart.length, 1);
assert.equal(cart[0].productId, "hawaiana-familiar");
assert.equal(menu.calculateTotal(cart), 1500);

r = say("Quiero que sea de pepperoni");
assert.equal(cart.length, 1, "La corrección no duplica pizzas");
assert.equal(cart[0].productId, "pepperoni-familiar");
assert.equal(menu.calculateTotal(cart), 1400);

pending = null; cart = [];
say("Quiero tres pizzas");
assert.equal(pending.quantity, 3);
say("Pepperoni");
assert.equal(pending.flavor, "pepperoni");
assert.equal(cart.length, 0);
say("Familiar");
assert.equal(pending, null);
assert.deepEqual(cart, [{ productId: "pepperoni-familiar", quantity: 3 }]);
assert.equal(menu.calculateTotal(cart), 4200);

pending = null; cart = [];
say("Quiero una pizza");
r = say("No sé");
assert.equal(cart.length, 0);
assert.equal(pending.quantity, 1);
assert.match(r.reply, /sabor/i);
assert.equal(dialog.sanitizePending({flavor:"gaseosa",size:"familiar",quantity:1}),null);

pending = null; cart = [];
say("Quiero una pizza hawaiana");
say("Mediana");
assert.equal(cart[0].productId, "hawaiana-mediana");
assert.equal(menu.calculateTotal(cart), 1000);
console.log("OK: aclaraciones con memoria, correcciones y carrito sin duplicados");
