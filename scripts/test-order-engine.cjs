/* Pruebas gratuitas del motor: usa el TypeScript que ya trae el proyecto. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(source, dependencies = {}) {
  const input = fs.readFileSync(path.join(__dirname, "..", "src", "lib", source), "utf8");
  const compiled = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  const localRequire = (name) => {
    if (name in dependencies) return dependencies[name];
    throw new Error("Dependencia inesperada: " + name);
  };
  new Function("require", "module", "exports", compiled)(localRequire, module, module.exports);
  return module.exports;
}

const menu = load("menu.ts");
const { demoUnderstand, applyCommand, guardDestructiveIntent } = load("order-engine.ts", { "./menu": menu });
let cart = [];
function say(message) {
  const result = applyCommand(cart, guardDestructiveIntent(message, demoUnderstand(message)));
  cart = result.cart;
  return result;
}
function count(id) { return cart.find((item) => item.productId === id)?.quantity ?? 0; }

say("Quiero dos pepperoni familiares y una hawaiana mediana");
assert.equal(menu.calculateTotal(cart), 3800);
assert.equal(count("pepperoni-familiar"), 2);
assert.equal(count("hawaiana-mediana"), 1);

assert.equal(demoUnderstand("Agrega una pepperoni familiar").items[0]?.productId, "pepperoni-familiar", "Debe reconocer familiar en singular");
assert.equal(demoUnderstand("Agrega dos pepperoni familiares").items[0]?.productId, "pepperoni-familiar", "Debe reconocer familiares en plural");
assert.equal(demoUnderstand("Cambia una pepperoni familiar por una hawaiana mediana").action, "replace", "Debe interpretar el reemplazo");

say("Cambia una pepperoni familiar por una hawaiana mediana");
assert.equal(menu.calculateTotal(cart), 3400);
assert.equal(count("pepperoni-familiar"), 1);
assert.equal(count("hawaiana-mediana"), 2);

const beforeQuestion = JSON.stringify(cart);
const question = say("¿Cuánto es el total?");
assert.match(question.reply, /34,00/);
assert.equal(JSON.stringify(cart), beforeQuestion);

say("Agrega una gaseosa");
assert.equal(menu.calculateTotal(cart), 3650);

const beforeFailure = JSON.stringify(cart);
say("Quita tres pepperoni familiares");
assert.equal(JSON.stringify(cart), beforeFailure, "Un retiro inválido no debe modificar el carrito");

say("Quiero tres pizzas");
assert.equal(JSON.stringify(cart), beforeFailure, "No se inventan sabores o tamaños");

const beforeNegation = JSON.stringify(cart);
const notConfirmed = say("No confirmo el pedido");
assert.equal(notConfirmed.confirmed, false);
assert.equal(JSON.stringify(cart), beforeNegation);
const notCleared = say("No quiero vaciar el carrito");
assert.equal(notCleared.confirmed, false);
assert.equal(JSON.stringify(cart), beforeNegation);
const hypothetical = say("¿Qué pasa si confirmo el pedido?");
assert.equal(hypothetical.confirmed, false);

const confirmed = say("Confirmo el pedido");
assert.equal(confirmed.confirmed, true);
assert.equal(menu.calculateTotal(cart), 3650);
say("Vaciar");
assert.equal(cart.length, 0);
console.log("OK: pruebas de pedidos v0.2, incluyendo singular/plural y reemplazos");
