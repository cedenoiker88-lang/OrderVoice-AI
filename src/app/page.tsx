"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserHandsFreeSession, type HandsFreePhase } from "@/lib/browser-handsfree";

type Product = { id: string; nombre: string; precioCentavos: number; activo: boolean };
type CartItem = { productId: string; quantity: number };
type Order = { id: string; totalCents: number; status: string; createdAt: string };
type Message = { role: "assistant" | "user"; text: string };
type PendingPizza = { flavor?: "pepperoni" | "hawaiana" | "margarita"; size?: "mediana" | "familiar"; quantity: number };
type ChatReply = {
  reply: string;
  cart: CartItem[];
  order?: Order;
  pending?: PendingPizza | null;
  mode: string;
};
type SessionReply = { sesion?: { id: string; items: { productId: string; quantity: number }[] }; error?: { message: string } };
const greeting: Message = {
  role: "assistant",
  text: "¡Hola! Soy OrderVoice, tu asistente de pedidos. ¿Qué pizza deseas pedir?"
};
const usd = (cents: number) => new Intl.NumberFormat("es-EC", {
  style: "currency", currency: "USD"
}).format(cents / 100);

async function readJSON(response: Response): Promise<Record<string, unknown>> {
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const error = data.error;
    const message = typeof error === "string" ? error
      : error && typeof error === "object" && "message" in error
        ? String(error.message) : "Error en la API local.";
    throw new Error(message);
  }
  return data;
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastTranscript, setLastTranscript] = useState("");
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [voicePhase, setVoicePhase] = useState<HandsFreePhase>("idle");
  const [voiceActive, setVoiceActive] = useState(false);
  const [connected, setConnected] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const pendingRef = useRef<PendingPizza | null>(null);
  const busyRef = useRef(false);
  const voiceRef = useRef<BrowserHandsFreeSession | null>(null);
  const conversationRef = useRef<HTMLDivElement | null>(null);

  async function loadProducts() {
    const data = await readJSON(await fetch("/api/productos", { cache: "no-store" }));
    setProducts((data.productos as Product[]).filter((p) => p.activo));
    setConnected(true);
  }

  async function loadOrders() {
    const data = await readJSON(await fetch("/api/pedidos", { cache: "no-store" }));
    setOrders((data.pedidos as Order[]).slice(0, 12));
  }

  useEffect(() => {
    void loadProducts().catch((e: Error) => setError(e.message));
    void loadOrders().catch(() => {});
    const synth = window.speechSynthesis;
    if (synth) {
      const update = () => setVoices(synth.getVoices().filter((v) => /^es(?:-|$)/i.test(v.lang)));
      update();
      synth.addEventListener("voiceschanged", update);
      return () => {
        synth.removeEventListener("voiceschanged", update);
        voiceRef.current?.stop();
      };
    }
    return () => voiceRef.current?.stop();
  }, []);

  useEffect(() => {
    const node = conversationRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function getSession(signal?: AbortSignal): Promise<string> {
    if (sessionIdRef.current) return sessionIdRef.current;
    const data = await readJSON(await fetch("/api/sesiones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal
    }));
    const session = (data as SessionReply).sesion;
    if (!session?.id) throw new Error("La API no pudo crear una sesión.");
    sessionIdRef.current = session.id;
    return session.id;
  }

  function append(role: Message["role"], text: string) {
    setMessages((previous) => [...previous, { role, text }]);
  }

  async function messageToAPI(text: string, browserVoice = false, signal?: AbortSignal):
    Promise<{ reply: string; completed: boolean } | undefined> {
    const message = text.trim();
    if (!message || busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setDraft("");
    append("user", message);
    const started = performance.now();
    try {
      const sessionId = await getSession(signal);
      const data = await readJSON(await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message, sessionId, browserVoice, pending: pendingRef.current
        }),
        signal
      })) as unknown as ChatReply;
      if (signal?.aborted) return undefined;
      pendingRef.current = data.pending ?? null;
      setCart(data.cart);
      setLastMs(Math.round(performance.now() - started));
      append("assistant", data.reply);
      if (data.order) {
        sessionIdRef.current = null;
        void loadOrders().catch(() => {});
      }
      return { reply: data.reply, completed: Boolean(data.order) };
    } catch (cause) {
      if (signal?.aborted) return undefined;
      const message = cause instanceof Error ? cause.message : "No se pudo procesar el pedido.";
      setError(message);
      if (browserVoice) throw cause;
      return undefined;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function addProduct(product: Product) {
    if (busyRef.current || voiceRef.current?.isActive) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const sessionId = await getSession();
      const data = await readJSON(await fetch(`/api/sesiones/${sessionId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, quantity: 1 })
      })) as unknown as SessionReply;
      const updated = data.sesion;
      if (!updated) throw new Error("La API no devolvió el carrito.");
      setCart(updated.items.map(({ productId, quantity }) => ({ productId, quantity })));
      append("user", `Agrega una ${product.nombre}`);
      append("assistant", "Producto añadido mediante mi API de pedidos.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo añadir el producto.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function toggleVoice() {
    const old = voiceRef.current;
    if (old?.isActive) { old.stop(); return; }
    if (busyRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.speechSynthesis) {
      setError("Necesitas Edge o Chrome con micrófono y salida de audio habilitados.");
      return;
    }
    const session = new BrowserHandsFreeSession({
      onPhase: setVoicePhase,
      onTranscript: setLastTranscript,
      onTurn: async (text, signal) => {
        const result = await messageToAPI(text, true, signal);
        if (!result) throw new Error("No se recibió una respuesta del monolito.");
        return result;
      },
      onError: setError,
      onStop: () => {
        voiceRef.current = null;
        setVoiceActive(false);
        setVoicePhase("idle");
      },
      preferredVoice: () => {
        const available = window.speechSynthesis.getVoices().filter((v) => /^es(?:-|$)/i.test(v.lang));
        return available.find((v) => v.voiceURI === voiceId)
          ?? available.find((v) => v.lang === "es-EC")
          ?? available[0];
      }
    });
    voiceRef.current = session;
    setVoiceActive(true);
    setError("");
    void session.start();
  }

  function reset() {
    voiceRef.current?.stop();
    sessionIdRef.current = null;
    pendingRef.current = null;
    setCart([]);
    setMessages([greeting]);
    setDraft("");
    setLastTranscript("");
    setLastMs(null);
    setError("");
  }

  const totals = cart.reduce((sum, line) => {
    const product = products.find((p) => p.id === line.productId);
    return sum + (product?.precioCentavos ?? 0) * line.quantity;
  }, 0);

  const labels: Record<HandsFreePhase, string> = {
    idle: "Un clic para empezar a conversar.",
    starting: "Activando micrófono y saludo…",
    listening: "🎙 Escuchando: habla cuando quieras.",
    hearing: "🎙 Te escucho; espera un momento al terminar.",
    transcribing: "Transcribiendo la voz con OpenAI…",
    processing: "Procesando mediante nuestras APIs locales…",
    speaking: "🔊 OrderVoice responde; después volverá a escucharte."
  };

  return (
    <div className="shell">
      <header className="header">
        <div className="brand">
          <div className="brandmark">◉</div>
          <div><strong>OrderVoice <span>AI</span></strong>
            <small>Criterio 2 · Monolito en capas · Next.js + PostgreSQL</small></div>
        </div>
        <div className="header-right">
          <span className="status-dot" />
          <span>{connected ? "PostgreSQL conectado" : "Comprobando base de datos…"}</span>
          <span className="mode mode-local">MOTOR LOCAL</span>
        </div>
      </header>

      <div className="intro">
        <div>
          <span className="eyebrow">PROYECTO INTEGRADOR · DEMOSTRACIÓN</span>
          <h1>Tu recepcionista, <em>siempre disponible.</em></h1>
          <p>Pedido de una pizzería ficticia. Las APIs, las reglas y la base de datos son propias; OpenAI solo transcribe la voz.</p>
        </div>
        <div className="intro-chip">🍕 <strong>Pizza Demo</strong><small>Datos de prueba</small></div>
      </div>

      <main className="dashboard">
        <section className="panel chat-panel" aria-label="Asistente de pedidos">
          <div className="panel-heading">
            <div><h2>Asistente de pedidos</h2><p>API de chat local y pedidos persistentes</p></div>
            <button className="secondary reset" onClick={reset} disabled={busy}>↻ Reiniciar</button>
          </div>
          <div className="conversation" ref={conversationRef} role="log" aria-live="polite">
            {messages.map((message, i) => (
              <div key={i} className={`message ${message.role}`}>
                <span className="message-avatar">{message.role === "assistant" ? "✦" : "TÚ"}</span>
                <div className="message-body">
                  <span className="speaker">{message.role === "assistant" ? "OrderVoice" : "Cliente"}</span>
                  <p>{message.text}</p>
                </div>
              </div>
            ))}
            {busy && <div className="thinking">Procesando en el monolito…</div>}
          </div>

          <div className="voice-control handsfree-control">
            <button type="button" className={voiceActive ? "voice-session active" : "voice-session"}
              onClick={toggleVoice} disabled={!voiceActive && busy}>
              {voiceActive ? "■ Finalizar conversación" : "🎙 Iniciar conversación continua"}
            </button>
            <span role="status" aria-live="polite">{labels[voicePhase]}</span>
          </div>
          <div className="handsfree-notice">
            Solo la transcripción utiliza una API externa de OpenAI. El reconocimiento del pedido,
            los precios y el guardado se realizan en el monolito y PostgreSQL.
          </div>
          <div className="voice-settings">
            <label htmlFor="voice-select">Voz española de Edge:</label>
            <select id="voice-select" disabled={voiceActive} value={voiceId}
              onChange={(event) => setVoiceId(event.target.value)}>
              <option value="">Automática (español)</option>
              {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
            </select>
          </div>
          {lastTranscript && (
            <div className="stt-result" role="status">
              <strong>Transcripción OpenAI:</strong> {lastTranscript}
            </div>
          )}
          {lastMs !== null && <div className="performance">⏱ Respuesta del monolito: <strong>{lastMs} ms</strong></div>}
          {error && <p className="error" role="alert">⚠ {error}</p>}
          <form className="composer" onSubmit={(e) => {
            e.preventDefault();
            void messageToAPI(draft);
          }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)}
              disabled={busy || voiceActive} maxLength={500}
              placeholder="Ej.: quiero una pizza pepperoni familiar"
              aria-label="Escribe el pedido" />
            <button type="submit" className="send" disabled={busy || voiceActive || !draft.trim()}>
              Enviar <span>➜</span>
            </button>
          </form>
          <div className="chat-footer">
            <span>Motor propio · OpenAI solo voz · Sin llamadas reales</span>
          </div>
        </section>

        <aside className="right-column">
          <section className="panel">
            <div className="panel-heading compact">
              <div><h2>Menú de PostgreSQL</h2><p>Precios ficticios en USD</p></div>
              <span className="counter">{products.length} productos</span>
            </div>
            <div className="menu-list">
              {products.map((p) => (
                <div className="menu-item" key={p.id}>
                  <div className="food-icon">{p.id === "gaseosa" ? "🥤" : "🍕"}</div>
                  <div className="food-name"><strong>{p.nombre}</strong><small>{usd(p.precioCentavos)}</small></div>
                  <button className="add-btn" type="button" title={`Añadir ${p.nombre}`}
                    disabled={busy || voiceActive} onClick={() => void addProduct(p)}>+</button>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading compact">
              <div><h2>Pedido actual</h2><p>Productos almacenados en PostgreSQL</p></div>
              <span className="counter">{cart.reduce((n, item) => n + item.quantity, 0)} uds.</span>
            </div>
            {cart.length ? <div className="cart-list">
              {cart.map((line) => {
                const p = products.find((x) => x.id === line.productId);
                return <div className="cart-line" key={line.productId}>
                  <span><b>{line.quantity}×</b> {p?.nombre || line.productId}</span>
                  <strong>{usd((p?.precioCentavos ?? 0) * line.quantity)}</strong>
                </div>;
              })}
            </div> : <div className="empty">🛒<p>Tu carrito está vacío.</p></div>}
            <div className="cart-bottom">
              <div className="total"><span>Total mostrado</span><strong>{usd(totals)}</strong></div>
              <button className="confirm" type="button" disabled={busy || voiceActive || !cart.length}
                onClick={() => void messageToAPI("Confirmo mi pedido")}>✓ Confirmar pedido</button>
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading compact"><div>
              <h2>Pedidos guardados</h2><p>Consulta real a PostgreSQL</p>
            </div></div>
            {orders.length ? <div className="orders">{orders.slice(0, 5).map((order) => (
              <div className="order-row" key={order.id}>
                <div><strong>#{order.id.slice(0, 8)}</strong>
                  <small>{new Date(order.createdAt).toLocaleString("es-EC")}</small>
                </div><strong>{usd(order.totalCents)}</strong>
              </div>
            ))}</div> : <p className="no-orders">Aún no hay pedidos confirmados.</p>}
          </section>
        </aside>
      </main>
      <footer>OrderVoice AI · Monolito académico individual · Sin pagos ni restaurantes reales</footer>
    </div>
  );
}
