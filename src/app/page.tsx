"use client";

import { useEffect, useRef, useState } from "react";
import { MENU, calculateTotal, formatUSD, productById, type CartItem, type ConfirmedOrder } from "@/lib/menu";

type ChatMessage = { role: "assistant" | "user"; text: string };
type ChatResponse = {
  cart: CartItem[];
  reply: string;
  order?: ConfirmedOrder;
  mode: "demo" | "ia" | "ollama";
  notice?: string;
  error?: string;
};

type SpeechResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type SpeechLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechLike;
  webkitSpeechRecognition?: new () => SpeechLike;
};

const initialMessage: ChatMessage = {
  role: "assistant",
  text: "¡Hola! Bienvenido a Pizza Demo. Soy OrderVoice, tu asistente virtual de prueba. ¿Qué pizzas deseas pedir?"
};

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [input, setInput] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<ConfirmedOrder[]>([]);
  const [mode, setMode] = useState<"demo" | "ia" | "ollama" | "detectando">("detectando");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [voiceSession, setVoiceSession] = useState(false);
  const [error, setError] = useState("");
  const conversationRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const voiceRef = useRef(false);
  const recognitionRef = useRef<SpeechLike | null>(null);
  const generationRef = useRef(0);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ordervoice:demo-orders");
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) setOrders(parsed.slice(0, 12) as ConfirmedOrder[]);
      }
    } catch { /* datos locales inválidos: no bloquea la demo */ }
  }, []);
  useEffect(() => {
    // Desplazar solo el historial del chat, nunca toda la página del navegador.
    const conversation = conversationRef.current;
    if (!conversation) return;
    conversation.scrollTo({ top: conversation.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);


  function stopVoiceSession() {
    generationRef.current += 1;
    voiceRef.current = false;
    setVoiceSession(false);
    setListening(false);
    if (retryRef.current) clearTimeout(retryRef.current);
    retryRef.current = null;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    window.speechSynthesis?.cancel();
  }

  function listen(generation: number) {
    if (!voiceRef.current || generation !== generationRef.current || busyRef.current) return;
    const browser = window as SpeechWindow;
    const SpeechAPI = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!SpeechAPI) {
      setError("Reconocimiento de voz no disponible en este navegador.");
      stopVoiceSession();
      return;
    }
    try {
      let heard = false;
      const recognition = new SpeechAPI();
      recognitionRef.current = recognition;
      recognition.lang = "es-EC";
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.onresult = (event) => {
        if (heard || !voiceRef.current || generation !== generationRef.current) return;
        const phrase = event.results[0]?.[0]?.transcript?.trim();
        if (!phrase) return;
        heard = true;
        setListening(false);
        recognition.stop();
        void send(phrase);
      };
      recognition.onerror = (event) => {
        if (generation !== generationRef.current || !voiceRef.current) return;
        if (event.error !== "no-speech" && event.error !== "aborted") {
          stopVoiceSession();
          setError("Micrófono: " + event.error + ". Revisa los permisos y la conexión.");
        }
      };
      recognition.onend = () => {
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        setListening(false);
        if (!heard && voiceRef.current && generation === generationRef.current) {
          retryRef.current = setTimeout(() => listen(generation), 500);
        }
      };
      setListening(true);
      recognition.start();
    } catch {
      stopVoiceSession();
      setError("No se pudo activar el micrófono.");
    }
  }

  function say(text: string, resume = false) {
    if ((!speakReplies && !resume) || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const generation = generationRef.current;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-EC";
    utterance.rate = 1;
    if (resume) {
      utterance.onend = () => {
        if (voiceRef.current && generation === generationRef.current) {
          retryRef.current = setTimeout(() => listen(generation), 350);
        }
      };
      utterance.onerror = () => {
        if (voiceRef.current && generation === generationRef.current) {
          stopVoiceSession();
          setError("No se pudo reproducir la voz del asistente.");
        }
      };
    }
    window.speechSynthesis.speak(utterance);
  }

  function toggleVoiceSession() {
    if (voiceRef.current) { stopVoiceSession(); return; }
    const browser = window as SpeechWindow;
    if (!(browser.SpeechRecognition ?? browser.webkitSpeechRecognition) || !window.speechSynthesis) {
      setError("Para conversar por voz, utiliza un navegador compatible como Chrome o Edge.");
      return;
    }
    if (busyRef.current) return;
    generationRef.current += 1;
    voiceRef.current = true;
    setVoiceSession(true);
    setError("");
    say("¡Hola! Soy OrderVoice. ¿Qué deseas pedir?", true);
  }

  useEffect(() => () => {
    voiceRef.current = false;
    generationRef.current += 1;
    if (retryRef.current) clearTimeout(retryRef.current);
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
  }, []);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setInput("");
    setMessages((previous) => [...previous, { role: "user", text: message }]);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, cart, history: messages.slice(-8) })
      });
      const data = (await response.json()) as ChatResponse;
      if (!response.ok) throw new Error(data.error ?? "Error al conectar con el servidor");
      setMode(data.mode);
      setError(data.notice ?? "");
      setCart(data.order ? [] : data.cart);
      setMessages((previous) => [...previous, { role: "assistant", text: data.reply }]);
      say(data.reply, voiceRef.current);
      if (data.order) {
        setOrders((previous) => {
          const updated = [data.order!, ...previous].slice(0, 12);
          try { localStorage.setItem("ordervoice:demo-orders", JSON.stringify(updated)); } catch { /* almacenamiento deshabilitado */ }
          return updated;
        });
      }
    } catch (cause) {
      if (voiceRef.current) stopVoiceSession();
      setError(cause instanceof Error ? cause.message : "Ocurrió un error inesperado");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function startMicrophone() {
    if (listening || busy || voiceRef.current) return;
    const browser = window as SpeechWindow;
    const SpeechAPI = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!SpeechAPI) {
      setError("Tu navegador no tiene reconocimiento de voz compatible. Usa Chrome o Edge, o escribe el pedido.");
      return;
    }
    try {
      window.speechSynthesis?.cancel();
      const recognition = new SpeechAPI();
      recognition.lang = "es-EC";
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.onresult = (event) => { const phrase = event.results[0]?.[0]?.transcript; if (phrase) void send(phrase); };
      recognition.onerror = (event) => { setError(`Micrófono: ${event.error}. Verifica permisos y conexión.`); setListening(false); };
      recognition.onend = () => setListening(false);
      setError("");
      setListening(true);
      recognition.start();
    } catch {
      setListening(false);
      setError("No se pudo activar el micrófono. Comprueba los permisos del navegador.");
    }
  }

  function reset() {
    if (voiceRef.current) stopVoiceSession();
    setCart([]);
    setMessages([initialMessage]);
    setError("");
  }

  const total = calculateTotal(cart);
  return (
    <div className="shell">
      <header className="header">
        <div className="brand"><div className="brandmark">◉</div><div><strong>OrderVoice <span>AI</span></strong><small>Panel de pruebas · v0.4</small></div></div>
        <div className="header-right"><span className="status-dot" /><span>Servidor de desarrollo</span><span className={`mode mode-${mode}`}>{mode === "ollama" ? "OLLAMA LOCAL" : mode === "ia" ? "IA ACTIVADA" : mode === "demo" ? "MODO DEMO" : "MODO POR DETECTAR"}</span></div>
      </header>

      <div className="intro"><div><span className="eyebrow">PRIMER PROTOTIPO</span><h1>Tu recepcionista, <em>siempre disponible.</em></h1><p>Simula pedidos de una pizzería, conversa y comprueba cómo funciona el sistema antes de añadir llamadas telefónicas.</p></div><div className="intro-chip">🍕 <strong>Pizza Demo</strong><small>Restaurante ficticio</small></div></div>

      <main className="dashboard">
        <section className="panel chat-panel" aria-label="Asistente de pedidos">
          <div className="panel-heading"><div><h2>Asistente de pedidos</h2><p>Chat de simulación · Sin llamadas reales</p></div><button className="secondary reset" onClick={reset} disabled={busy}>↻ Reiniciar</button></div>
          <div className="conversation" ref={conversationRef} role="log" aria-live="polite">
            {messages.map((message, index) => <div className={`message ${message.role}`} key={index}><span className="message-avatar">{message.role === "assistant" ? "✦" : "TÚ"}</span><div className="message-body"><span className="speaker">{message.role === "assistant" ? "OrderVoice" : "Cliente"}</span><p>{message.text}</p></div></div>)}
            {busy && <div className="thinking">OrderVoice está procesando tu pedido…</div>}
          </div>
          <div className="voice-control">
            <button type="button" className={voiceSession ? "voice-session active" : "voice-session"} onClick={toggleVoiceSession} disabled={busy && !voiceSession}>
              {voiceSession ? "■ Terminar conversación" : "🎧 Iniciar conversación por voz"}
            </button>
            <span role="status">{voiceSession ? (listening ? "Escuchando al cliente…" : busy ? "Procesando el pedido…" : "OrderVoice está hablando o preparando la escucha…") : "Inicio manual de conversación"}</span>
          </div>
          {error && <p className="error" role="alert">⚠ {error}</p>}
          <form className="composer" onSubmit={(event) => {event.preventDefault(); void send(input);}}>
            <button className={`mic ${listening ? "active" : ""}`} type="button" aria-label="Dictar pedido" title="Hablar con el micrófono" disabled={busy || voiceSession} onClick={startMicrophone}>{listening ? "◉" : "🎙"}</button>
            <input aria-label="Escribe el pedido" placeholder="Ej.: dos pepperoni familiares y una hawaiana mediana" maxLength={500} value={input} onChange={(event) => setInput(event.target.value)} disabled={busy}/>
            <button className="send" type="submit" disabled={busy || !input.trim()}>Enviar <span>➜</span></button>
          </form>
          <div className="chat-footer"><label><input type="checkbox" checked={speakReplies} onChange={(event) => setSpeakReplies(event.target.checked)}/> Leer las respuestas en voz alta</label><span>{listening ? "🎙 Escuchando…" : "Micrófono opcional"}</span></div>
        </section>

        <aside className="right-column">
          <section className="panel"><div className="panel-heading compact"><div><h2>Menú de prueba</h2><p>Precios inventados, en USD</p></div><span className="counter">{MENU.length} productos</span></div><div className="menu-list">{MENU.map((product) => <div className="menu-item" key={product.id}><div className="food-icon">{product.emoji}</div><div className="food-name"><strong>{product.name}</strong><small>{formatUSD(product.priceCents)}</small></div><button type="button" title={`Añadir ${product.name}`} disabled={busy} className="add-btn" onClick={() => {void send(`Agrega una ${product.name}`);}}>+</button></div>)}</div></section>
          <section className="panel"><div className="panel-heading compact"><div><h2>Pedido actual</h2><p>Importe validado en servidor</p></div><span className="counter">{cart.reduce((n, item) => n + item.quantity, 0)} uds.</span></div>{cart.length ? <div className="cart-list">{cart.map((line) => {const p = productById(line.productId); return p && <div className="cart-line" key={line.productId}><span><b>{line.quantity}×</b> {p.name}</span><strong>{formatUSD(p.priceCents * line.quantity)}</strong></div>;})}</div> : <div className="empty">🛒<p>Tu carrito está vacío.</p><small>Pide algo por chat o usa los botones +</small></div>}<div className="cart-bottom"><div className="total"><span>Total</span><strong>{formatUSD(total)}</strong></div><button className="confirm" type="button" disabled={busy || !cart.length} onClick={() => {void send("Confirmo el pedido");}}>✓ Confirmar pedido</button></div></section>
          <section className="panel"><div className="panel-heading compact"><div><h2>Pedidos confirmados</h2><p>Guardados solo en este navegador</p></div></div>{orders.length ? <div className="orders">{orders.slice(0, 3).map((order) => <div className="order-row" key={order.id}><div><strong>#{order.id}</strong><small>{new Date(order.createdAt).toLocaleString("es-EC")}</small></div><strong>{formatUSD(order.totalCents)}</strong></div>)}</div> : <p className="no-orders">Todavía no hay pedidos confirmados.</p>}</section>
        </aside>
      </main>
      <footer>OrderVoice AI · MVP educativo · No recibe llamadas reales, no cobra pagos y no entrega pedidos a restaurantes.</footer>
    </div>
  );
}
