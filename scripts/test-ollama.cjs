/* Pruebas locales del contrato con Ollama: no requieren Ollama ni acceso a internet. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const zod = require("zod");

function load(source, dependencies = {}) {
  const filename = path.join(__dirname, "..", "src", "lib", source);
  const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", js)((name) => {
    if (name === "zod") return zod;
    if (name in dependencies) return dependencies[name];
    throw new Error("Importación inesperada: " + name);
  }, module, module.exports);
  return module.exports;
}

async function run() {
  const menu = load("menu.ts");
  const engine = load("order-engine.ts", { "./menu": menu });
  const { understandWithOllama } = load("ollama.ts", { "./menu": menu });
  const originalFetch = global.fetch;
  let request;
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, "http://127.0.0.1:11434/api/chat");
      request = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ message: { content: JSON.stringify({
          action: "add", items: [{ productId: "pepperoni-familiar", quantity: 2 }],
          replacements: [], answer: "", needsClarification: false
        }) } })
      };
    };
    const command = await understandWithOllama("dos pepperoni familiares", [], []);
    assert.equal(command.action, "add");
    assert.equal(command.items[0].quantity, 2);
    assert.equal(request.model, "llama3.2:3b");
    assert.equal(request.stream, false);
    assert.equal(engine.applyCommand([], command).cart[0].quantity, 2);

    // El motor nunca acepta productos que no existen aunque el modelo los devuelva.
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ message: { content: JSON.stringify({
        action: "add", items: [{ productId: "pizza-inventada", quantity: 1 }],
        replacements: [], answer: "", needsClarification: false
      }) } })
    });
    const invented = await understandWithOllama("dame una pizza inexistente", [], []);
    assert.equal(engine.applyCommand([], invented).cart.length, 0);

    // Una orden destructiva que el cliente no pidió explícitamente no se ejecuta.
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ message: { content: JSON.stringify({
        action: "clear", items: [], replacements: [], answer: "", needsClarification: false
      }) } })
    });
    const unsafe = await understandWithOllama("¿qué tenemos en el menú?", [], []);
    assert.equal(unsafe.action, "question");
    assert.equal(unsafe.needsClarification, true);

    console.log("OK: contrato Ollama, validación de menú y protección del carrito");
  } finally {
    global.fetch = originalFetch;
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
