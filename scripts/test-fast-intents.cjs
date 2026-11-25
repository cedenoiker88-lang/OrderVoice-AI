/* Regresión de respuestas rápidas: no requiere Ollama ni acceso a internet. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(filename, dependencies = {}) {
  const input = fs.readFileSync(path.join(__dirname, "..", "src", "lib", filename), "utf8");
  const js = ts.transpileModule(input, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", js)((name) => {
    if (name in dependencies) return dependencies[name];
    throw new Error("Dependencia inesperada: " + name);
  }, module, module.exports);
  return module.exports;
}

const menu = load("menu.ts");
const engine = load("order-engine.ts", { "./menu": menu });
const { fastUnderstand } = load("fast-intents.ts", { "./menu": menu });
const cart = [{ productId: "pepperoni-mediana", quantity: 1 }];

for (const message of ["¿Cuánto es el total?", "¿Cuánto voy a pagar?", "Dime el total"]) {
  const cmd = fastUnderstand(message);
  assert.equal(cmd.action, "total", message);
  const result = engine.applyCommand(cart, cmd);
  assert.deepEqual(result.cart, cart);
  assert.match(result.reply, /9,00|9\.00/);
}

assert.equal(fastUnderstand("Confirmo el pedido").action, "confirm");
assert.equal(fastUnderstand("No confirmo el pedido"), null);
assert.equal(fastUnderstand("Vacía el carrito").action, "clear");
assert.equal(fastUnderstand("No vacíes el carrito"), null);
for (const message of ["No, con eso estaría todo.", "Con eso sería todo", "Ya no quiero nada más", "No, gracias", "Nada más"]) {
  const cmd = fastUnderstand(message);
  assert.equal(cmd?.action, "question", message);
  assert.match(cmd.answer, /confirmo mi pedido/i, message);
}
assert.equal(fastUnderstand("¿Cuánto cuesta la hawaiana familiar?").action, "question");
assert.match(fastUnderstand("¿Cuánto cuesta la hawaiana familiar?").answer, /15,00|15\.00/);
assert.equal(fastUnderstand("Quiero una gaseosa y una pizza"), null);
assert.equal(fastUnderstand("Quiero una pizza de pepperoni"), null);

const drink = fastUnderstand("Quiero dos gaseosas");
assert.equal(drink.action, "add");
assert.deepEqual(drink.items, [{ productId: "gaseosa", quantity: 2 }]);
assert.equal(menu.calculateTotal(engine.applyCommand([], drink).cart), 500);
assert.equal(fastUnderstand("Quiero 21 gaseosas").needsClarification, true);

const menuQuestion = fastUnderstand("¿Qué pizzas tienen?");
assert.equal(menuQuestion.action, "question");
assert.match(menuQuestion.answer, /pepperoni/);
assert.match(menuQuestion.answer, /hawaiana/);
assert.match(menuQuestion.answer, /margarita/);

console.log("OK: respuestas locales rápidas, sin falsos positivos destructivos");
