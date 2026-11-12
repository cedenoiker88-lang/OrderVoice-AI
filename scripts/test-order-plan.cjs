/* Motor transaccional v0.9: pruebas SIN IA ni llamadas ni créditos. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function load(name, dependencies = {}) {
  const input = fs.readFileSync(path.join(__dirname, "..", "src", "lib", name), "utf8");
  const js = ts.transpileModule(input, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
  }}).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", js)((name) => {
    if (name in dependencies) return dependencies[name];
    if (name === "zod") return require("zod");
    throw Error("Importación inesperada: " + name);
  }, mod, mod.exports);
  return mod.exports;
}
const menu = load("menu.ts");
const { OrderPlanSchema, applyOrderPlan } = load("order-plan.ts", { "./menu": menu });
const op = (kind, productId, quantity, toProductId="") =>
  ({ kind, productId, quantity, toProductId });
const plan = (intent, operations=[], needsClarification=false, answer="") =>
  OrderPlanSchema.parse({ intent, operations, needsClarification, answer });
const cart = [
  { productId:"pepperoni-familiar", quantity:2 },
  { productId:"gaseosa", quantity:2 },
  { productId:"margarita-mediana", quantity:1 }
];
let checks=0;
function expectCart(original, requested, utterance, expected, answer) {
  const actual=applyOrderPlan(original, requested, utterance);
  assert.deepEqual(actual.cart, expected, utterance);
  assert.equal(actual.confirmed, false, utterance);
  if (answer) assert.match(actual.reply, answer, utterance);
  checks+=1;
  return actual;
}
function unchanged(requested, utterance, answer=/No modifiqué|No confirmé|No pude|¿|carrito/) {
  return expectCart(cart, requested, utterance, cart, answer);
}

// 1. La misma frase de la captura: una lista FINAL domina las acciones intermedias.
const desired=[
  {productId:"gaseosa",quantity:1},
  {productId:"margarita-mediana",quantity:1}
];
expectCart(cart,plan("edit",[
  op("keep_only","gaseosa",1),
  op("keep_only","margarita-mediana",1)
]),"No, quiero eliminar la pepperoni familiar y una gaseosa. Solamente quedaría una gaseosa y una margarita mediana.",desired, /11,00|11\.00/);
assert.equal(menu.calculateTotal(desired),1100);

// 2. Enunciados compuestos en un mismo turno.
expectCart([],plan("edit",[
  op("add","pepperoni-familiar",1),
  op("add","gaseosa",1),
  op("add","margarita-mediana",1)
]),"Quiero pepperoni familiar, una gaseosa y agrega una margarita mediana",[
  { productId:"pepperoni-familiar",quantity:1 },
  { productId:"gaseosa",quantity:1 },
  { productId:"margarita-mediana",quantity:1 }
], /25,00|25\.00/);
expectCart(cart,plan("edit",[
  op("remove","pepperoni-familiar",1),
  op("remove","gaseosa",1)
]),"Quita una pepperoni familiar y una gaseosa",[
  {productId:"pepperoni-familiar",quantity:1},
  {productId:"gaseosa",quantity:1},
  {productId:"margarita-mediana",quantity:1}
]);
expectCart(cart,plan("edit",[op("set","gaseosa",1)]),
  "Deja solo una gaseosa",[
  {productId:"pepperoni-familiar",quantity:2},
  {productId:"gaseosa",quantity:1},
  {productId:"margarita-mediana",quantity:1}
]);
expectCart(cart,plan("edit",[op("replace","pepperoni-familiar",1,"hawaiana-mediana")]),
  "Cambia una pepperoni familiar por una hawaiana mediana",[
  {productId:"pepperoni-familiar",quantity:1},
  {productId:"gaseosa",quantity:2},
  {productId:"margarita-mediana",quantity:1},
  {productId:"hawaiana-mediana",quantity:1}
]);
expectCart(cart,plan("edit",[op("set","pepperoni-familiar",0)]),
  "Quita todas las pepperoni familiares",[
  {productId:"gaseosa",quantity:2},
  {productId:"margarita-mediana",quantity:1}
]);

// 3. Validaciones estrictas, sin cambios parciales.
unchanged(plan("edit",[op("remove","pepperoni-familiar",3)]),"Quita tres pepperoni familiares");
unchanged(plan("edit",[op("remove","gaseosa",1),op("add","pollo-familiar",1)]),
  "Quita una gaseosa y agrega una pizza de pollo");
unchanged(plan("edit",[op("remove","gaseosa",1),op("add","pepperoni-familiar",19)]),
  "Quita una gaseosa y añade diecinueve pepperoni familiares");
unchanged(plan("edit",[op("add","gaseosa",21)]),"Agrega 21 gaseosas");
unchanged(plan("edit",[op("replace","gaseosa",2,"gaseosa")]),"Cambia dos gaseosas por gaseosas");
unchanged(plan("edit",[op("keep_only","gaseosa",1)]),"Me gustaría una gaseosa más");
unchanged(plan("edit",[op("keep_only","gaseosa",1),op("add","margarita-mediana",1)]),
  "Solo quedaría una gaseosa y agrega otra margarita");
unchanged(plan("edit",[op("keep_only","gaseosa",1),op("keep_only","gaseosa",1)]),
  "Solo quedaría una gaseosa");
unchanged(plan("edit",[]),"Quiero una pizza de queso");
unchanged(plan("question",[op("add","gaseosa",1)]),
  "¿Cuánto cuesta la gaseosa?");
unchanged(plan("total",[op("add","gaseosa",1)]),
  "¿Cuánto debo pagar?");
unchanged(plan("edit",[op("add","gaseosa",1)],true,"¿Qué gaseosa deseas?"),
  "No sé qué bebida pedir",/¿Qué gaseosa deseas/);

// 4. Preguntas y negaciones nunca vacían ni confirman carrito.
expectCart(cart,plan("question",[],false,"No cambié tu pedido."),
  "No quiero quitar mi pepperoni",cart,/No cambié/);
expectCart(cart,plan("total"),"¿Cuál es el total?",cart,/41,50|41\.50/);
unchanged(plan("clear"),"¿Debo vaciar el carrito?");
unchanged(plan("clear"),"No quiero vaciar el carrito");
unchanged(plan("confirm"),"¿Confirmo el pedido?");
unchanged(plan("confirm"),"No quiero confirmar el pedido");
const cleared=applyOrderPlan(cart,plan("clear"),"Vacía el carrito");
assert.deepEqual(cleared.cart,[]);checks+=1;
const confirmed=applyOrderPlan(cart,plan("confirm"),"Sí, confirmo el pedido");
assert.equal(confirmed.confirmed,true);
assert.deepEqual(confirmed.cart,cart);checks+=1;

// 5. Las rectificaciones "No, ..." no son lo mismo que "No quiero ...".
expectCart([{productId:"pepperoni-familiar",quantity:1}],plan("edit",[
  op("replace","pepperoni-familiar",1,"hawaiana-mediana")
]),"No, mejor cámbiala por una hawaiana mediana",[
  {productId:"hawaiana-mediana",quantity:1}
]);
unchanged(plan("edit",[op("replace","pepperoni-familiar",1,"hawaiana-mediana")]),
  "No quiero que cambies la pizza por una hawaiana mediana");
unchanged(plan("edit",[op("remove","pepperoni-familiar",1)]),
  "No quiero eliminar la pepperoni familiar");
unchanged(plan("edit",[op("add","gaseosa",1)]),
  "No me agregues una gaseosa");
unchanged(plan("confirm"),"No confirmo el pedido");

// 5. No confiar en cantidades/IDs fabricados por la IA.
unchanged(plan("edit",[op("set","gaseosa",21)]),"Quiero veintiuna gaseosas");
unchanged(plan("edit",[op("set","gaseosa",-1)]),"Quiero menos uno");
unchanged(plan("edit",[op("replace","gaseosa",1,"desconocido")]),"Cambia gaseosa por un producto desconocido");

// 6. Todas las operaciones son coherentes después del cambio.
const kept=applyOrderPlan(cart,plan("edit",[op("keep_only","gaseosa",1)]),"Deja únicamente una gaseosa");
assert.deepEqual(kept.cart,[{productId:"gaseosa",quantity:1}]);checks+=1;
console.log(`OK: ${checks} pruebas de seguridad y operaciones múltiples del motor v0.9. Sin usar APIs.`);
