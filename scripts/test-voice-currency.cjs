/* Pronunciación de USD para Edge: sin API, micrófono ni Twilio. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const file = fs.readFileSync(path.join(__dirname,"..","src","lib","spanish-currency-speech.ts"),"utf8");
const js = ts.transpileModule(file,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;
const moduleObject = { exports: {} };
new Function("module","exports",js)(moduleObject,moduleObject.exports);
const {prepareSpanishCurrencySpeech: speak}=moduleObject.exports;
const checks = [
 ["Total: $41,50.", "Total: 41 dólares con 50 centavos."],
 ["Precio: $14,00.", "Precio: 14 dólares."],
 ["Total: $1,00.", "Total: 1 dólar."],
 ["Precio: $1,01.", "Precio: 1 dólar con 1 centavo."],
 ["Precio: $0,50.", "Precio: 0 dólares con 50 centavos."],
 ["Total: $2,50, ¿algo más?", "Total: 2 dólares con 50 centavos, ¿algo más?"],
 ["Precio: USD 15,00.", "Precio: 15 dólares."],
 ["Total: US$ 1.241,55.", "Total: 1241 dólares con 55 centavos."],
 ["Son 10 pesos.", "Son 10 dólares."],
 ["Te cobro un peso.", "Te cobro un dólar."],
 ["Dos pizzas y una gaseosa.", "Dos pizzas y una gaseosa."],
 ["Ya confirmé el pedido de $41,50.", "Ya confirmé el pedido de 41 dólares con 50 centavos."]
];
for (const [before, after] of checks) assert.equal(speak(before), after, before);
console.log("OK: "+checks.length+" casos de pronunciación USD en español. Sin gastos de API.");
