"use client";

import { useEffect, useRef, useState } from "react";
import { MENU, calculateTotal, formatUSD, productById, type CartItem, type ConfirmedOrder } from "@/lib/menu";
import type { PendingPizza } from "@/lib/pizza-dialogue";
import { BrowserHandsFreeSession, type HandsFreePhase } from "@/lib/browser-handsfree";

type ChatMessage = { role: "assistant" | "user"; text: string };
type IntentOperation = { kind: "add" | "remove" | "replace" | "set" | "keep_only"; productId: string; toProductId: string; quantity: number };
type IntentDiagnostics = { intent: string; operations: IntentOperation[]; needsClarification: boolean };
type ChatResponse = {
  diagnostics?: IntentDiagnostics;
  cart: CartItem[];
  reply: string;
  order?: ConfirmedOrder;
  mode: "demo" | "ia" | "ollama" | "local";
  metrics?: { interpretMs: number; serverMs: number };
  notice?: string;
  pending?: PendingPizza | null;
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
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
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
  const [pending, setPending] = useState<PendingPizza | null>(null);
  const [orders, setOrders] = useState<ConfirmedOrder[]>([]);
  const [mode, setMode] = useState<"demo" | "ia" | "ollama" | "local" | "detectando">("detectando");
  const [lastTiming, setLastTiming] = useState<{ requestMs: number; serverMs: number | null; interpretMs: number | null; mode: ChatResponse["mode"] } | null>(null);
  const [lastVoiceDelayMs, setLastVoiceDelayMs] = useState<number | null>(null);
  const [lastRecognitionMs, setLastRecognitionMs] = useState<number | null>(null);
  const [lastSpeechToTextMs, setLastSpeechToTextMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [voiceSession, setVoiceSession] = useState(false);
  const [spanishVoices, setSpanishVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [lastIntent, setLastIntent] = useState<IntentDiagnostics | null>(null);
  const [reviewTranscript, setReviewTranscript] = useState(false);
  const [reviewReady, setReviewReady] = useState(false);
  const [handsFreePhase, setHandsFreePhase] = useState<HandsFreePhase>("idle");
  const [handsFreeActive, setHandsFreeActive] = useState(false);

  const [error, setError] = useState("");
  const conversationRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  // Las funciones asíncronas de SpeechRecognition pueden conservar un cierre
  // antiguo de React. Estas referencias mantienen la sesión al día entre turnos.
  const cartRef = useRef<CartItem[]>([]);
  const pendingRef = useRef<PendingPizza | null>(null);
  const messagesRef = useRef<ChatMessage[]>([initialMessage]);
  const voiceRef = useRef(false);
  const recognitionRef = useRef<SpeechLike | null>(null);
  const generationRef = useRef(0);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceTurnStartedRef = useRef<number | null>(null);
  const silenceCountRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sttAbortRef = useRef<AbortController | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const handsFreeRef = useRef<BrowserHandsFreeSession | null>(null);


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
    const synthesis = window.speechSynthesis;
    if (!synthesis) return;
    const refreshVoices = () => {
      setSpanishVoices(synthesis.getVoices().filter((voice) => /^es(?:-|$)/i.test(voice.lang)));
    };
    refreshVoices();
    synthesis.addEventListener("voiceschanged", refreshVoices);
    return () => synthesis.removeEventListener("voiceschanged", refreshVoices);
  }, []);

  useEffect(() => {
    // Desplazar solo el historial del chat, nunca toda la página del navegador.
    const conversation = conversationRef.current;
    if (!conversation) return;
    conversation.scrollTo({ top: conversation.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);


  function closeMicrophoneCapture() {
    if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
    recordingTimerRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    setRecording(false);
  }

  async function toggleApiRecording() {
    if (recording) {
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      setRecording(false);
      return;
    }
    if (busyRef.current || voiceRef.current || listening || transcribing) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("El navegador no permite grabar audio. Abre http://localhost:3000 en Edge y verifica el micrófono.");
      return;
    }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
      .find((item) => MediaRecorder.isTypeSupported(item));
    if (!mime) {
      setError("El formato de grabación del navegador no es compatible. Prueba Microsoft Edge actualizado.");
      return;
    }
    try {
      window.speechSynthesis?.cancel();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      mediaStreamRef.current = stream;
      recordedChunksRef.current = [];
      setLastTranscript("");
      setError("");
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        // No transcribir ni gastar créditos si MediaRecorder reporta un error.
        recorder.onstop = null;
        if (recorder.state === "recording") recorder.stop();
        closeMicrophoneCapture();
        setError("No pude grabar el audio. Comprueba el permiso de micrófono.");
      };
      recorder.onstop = async () => {
        closeMicrophoneCapture();
        const recorded = new Blob(recordedChunksRef.current, { type: mime });
        recordedChunksRef.current = [];
        if (recorded.size < 150) {
          setError("No recibí suficiente audio. Pulsa Grabar y habla antes de detener la grabación.");
          return;
        }
        if (recorded.size > 8 * 1024 * 1024) {
          setError("El audio excede 8 MB. Prueba una frase más corta.");
          return;
        }
        const controller = new AbortController();
        sttAbortRef.current = controller;
        setTranscribing(true);
        try {
          const form = new FormData();
          form.append("audio", recorded, mime.includes("mp4") ? "pedido.mp4" : "pedido.webm");
          const result = await fetch("/api/browser-transcribe", { method: "POST", body: form, signal: controller.signal });
          const data = await result.json() as { text?: string; error?: string };
          if (!result.ok || !data.text) throw new Error(data.error ?? "No se pudo reconocer tu voz.");
          const transcript = data.text.trim();
          setReviewReady(false);
          setLastTranscript(transcript);
          // Se conserva el texto leído por la API en el historial y se envía
          // al motor de pedidos. La respuesta se lee con la voz de Edge.
          setTranscribing(false);
          if (sttAbortRef.current === controller) sttAbortRef.current = null;
          if (reviewTranscript) {
            // Permite corregir una palabra mal reconocida antes de modificar el carrito.
            setInput(transcript);
            setReviewReady(true);
            setError("Revisa el texto transcrito. Si está bien, pulsa Enviar.");
          } else {
            await send(transcript, true, true);
          }
        } catch (cause) {
          if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Fallo de transcripción.");
        } finally {
          setTranscribing(false);
          if (sttAbortRef.current === controller) sttAbortRef.current = null;
        }
      };
      recorder.start();
      setRecording(true);
      // Evitar grabaciones largas y consumos imprevistos: máximo 18 segundos.
      recordingTimerRef.current = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 18_000);
    } catch {
      closeMicrophoneCapture();
      setError("No pude acceder al micrófono. Permite el acceso en Edge y revisa la entrada de audio de Windows.");
    }
  }

  function stopVoiceSession() {
    generationRef.current += 1;
    voiceTurnStartedRef.current = null;
    silenceCountRef.current = 0;
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
      let startedSpeakingAt: number | null = null;
      let finishedSpeakingAt: number | null = null;
      const recognition = new SpeechAPI();
      recognitionRef.current = recognition;
      recognition.lang = "es-EC";
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.onspeechstart = () => {
        startedSpeakingAt = performance.now();
        finishedSpeakingAt = null;
      };
      recognition.onspeechend = () => {
        finishedSpeakingAt = performance.now();
      };
      recognition.onresult = (event) => {
        if (heard || !voiceRef.current || generation !== generationRef.current) return;
        const phrase = event.results[0]?.[0]?.transcript?.trim();
        if (!phrase) return;
        heard = true;
        silenceCountRef.current = 0;
        const transcriptAt = performance.now();
        setLastRecognitionMs(startedSpeakingAt === null ? null : Math.round(transcriptAt - startedSpeakingAt));
        setLastSpeechToTextMs(finishedSpeakingAt === null ? null : Math.round(transcriptAt - finishedSpeakingAt));
        voiceTurnStartedRef.current = transcriptAt;
        setLastVoiceDelayMs(null);
        setListening(false);
        recognition.stop();
        void send(phrase, true);
      };
      recognition.onerror = (event) => {
        if (generation !== generationRef.current || !voiceRef.current) return;
        if (event.error !== "no-speech" && event.error !== "aborted") {
          stopVoiceSession();
          setError(event.error === "network"
            ? "El reconocimiento de voz del navegador falló por red. Si estás en Brave, prueba el mismo sitio en Chrome o Edge; es una limitación del reconocimiento del navegador, no de Ollama."
            : "Micrófono: " + event.error + ". Revisa los permisos y la conexión.");
        }
      };
      recognition.onend = () => {
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        setListening(false);
        if (!heard && voiceRef.current && generation === generationRef.current) {
          silenceCountRef.current += 1;
          if (silenceCountRef.current >= 5) {
            stopVoiceSession();
            setError("No detecté voz después de varios intentos. Comprueba el micrófono y reinicia la conversación.");
          } else if (silenceCountRef.current % 2 === 0) {
            // Pedir repetir sin añadir un pedido vacío ni reiniciar la sesión.
            retryRef.current = setTimeout(() => say("No te escuché bien. ¿Puedes repetir tu pedido?", true), 350);
          } else {
            retryRef.current = setTimeout(() => listen(generation), 500);
          }
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
    // Elegir una voz española explícita: lang por sí solo puede usar la voz inglesa predeterminada.
    // Se actualiza cuando Edge termina de cargar las voces instaladas.
    // Mantener una misma voz entre turnos evita cambios accidentales de timbre.
    const available = spanishVoices.length ? spanishVoices : window.speechSynthesis.getVoices()
      .filter((voice) => /^es(?:-|$)/i.test(voice.lang));
    const preferredVoice = available.find((voice) => voice.voiceURI === selectedVoice)
      ?? available.find((voice) => /^es-EC$/i.test(voice.lang))
      ?? available.find((voice) => /^es-(MX|CO|ES)$/i.test(voice.lang))
      ?? available[0];
    if (preferredVoice) {
      utterance.voice = preferredVoice;
      utterance.lang = preferredVoice.lang;
    } else {
      // No inventar que existe una voz española; el navegador puede usar otra voz.
      utterance.lang = "es-ES";
      setError("No encontré una voz española instalada. Windows podría leer el texto con acento inglés. Instala una voz de español en Configuración > Hora e idioma > Voz.");
    }
    utterance.rate = 0.97;
    utterance.pitch = 1;
    utterance.volume = 1;
    if (resume) {
      utterance.onstart = () => {
        if (voiceRef.current && generation === generationRef.current && voiceTurnStartedRef.current !== null) {
          setLastVoiceDelayMs(Math.round(performance.now() - voiceTurnStartedRef.current));
          voiceTurnStartedRef.current = null;
        }
      };
      utterance.onend = () => {
        if (voiceRef.current && generation === generationRef.current) {
          retryRef.current = setTimeout(() => listen(generation), 250);
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
    silenceCountRef.current = 0;
    voiceRef.current = true;
    setVoiceSession(true);
    setError("");
    say("¡Hola! Soy OrderVoice. ¿Qué deseas pedir?", true);
  }

  function toggleHandsFree() {
    const existing = handsFreeRef.current;
    if (existing?.isActive) {
      existing.stop();
      return;
    }
    if (busyRef.current || recording || transcribing) return;
    if (!window.speechSynthesis || !navigator.mediaDevices?.getUserMedia) {
      setError("Abre OrderVoice en http://localhost:3000 con Microsoft Edge y permite usar el micrófono.");
      return;
    }
    // Mantener la captura detenida durante la reproducción del asistente
    // evita el eco y los turnos falsos; solo VAD activa la transcripción.
    const session = new BrowserHandsFreeSession({
      onPhase: (phase) => {
        setHandsFreePhase(phase);
        setListening(phase === "listening" || phase === "hearing");
        setTranscribing(phase === "transcribing");
      },
      onTranscript: (text) => {
        setLastTranscript(text);
        setLastVoiceDelayMs(null);
        voiceTurnStartedRef.current = performance.now();
      },
      onTurn: async (text, signal) => {
        // El módulo controla el TTS y la reanudación; send() solo actualiza
        // el historial, la interpretación IA y el carrito una sola vez.
        const response = await send(text, true, false, true, signal);
        if (!response) throw new Error("La conversación se interrumpió antes de procesar el pedido.");
        return { reply: response.reply, completed: Boolean(response.order) };
      },
      onError: (message) => setError(message),
      onStop: () => {
        handsFreeRef.current = null;
        setHandsFreeActive(false);
        setHandsFreePhase("idle");
        setListening(false);
        setTranscribing(false);
      },
      preferredVoice: () => {
        const available = window.speechSynthesis.getVoices()
          .filter((voice) => /^es(?:-|$)/i.test(voice.lang));
        return available.find((voice) => voice.voiceURI === selectedVoice)
          ?? available.find((voice) => /^es-EC$/i.test(voice.lang))
          ?? available.find((voice) => /^es-(MX|CO|ES)$/i.test(voice.lang))
          ?? available[0];
      }
    });
    handsFreeRef.current = session;
    setHandsFreeActive(true);
    setLastTranscript("");
    setError("");
    void session.start();
  }

  useEffect(() => () => {
    handsFreeRef.current?.stop();
    voiceRef.current = false;
    generationRef.current += 1;
    if (retryRef.current) clearTimeout(retryRef.current);
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
    if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
    if (mediaRecorderRef.current) {
      // Durante navegación o recarga se cancela, no se manda audio a la API.
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state === "recording") mediaRecorderRef.current.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    sttAbortRef.current?.abort();
  }, []);

  async function send(text: string, browserVoice = false, forceSpeak = false, skipSpeech = false, signal?: AbortSignal): Promise<ChatResponse | undefined> {
    const message = text.trim();
    if (!message || busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setInput("");
    if (!voiceRef.current) setLastVoiceDelayMs(null);
    const previousMessages = messagesRef.current;
    messagesRef.current = [...previousMessages, { role: "user", text: message }];
    setMessages(messagesRef.current);
    try {
      const requestStartedAt = performance.now();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          browserVoice,
          cart: cartRef.current,
          pending: pendingRef.current,
          history: previousMessages.slice(-8)
        }),
        signal
      });
      const data = (await response.json()) as ChatResponse;
      if (signal?.aborted) return undefined;
      if (!response.ok) throw new Error(data.error ?? "Error al conectar con el servidor");
      setLastTiming({
        requestMs: Math.round(performance.now() - requestStartedAt),
        serverMs: typeof data.metrics?.serverMs === "number" ? data.metrics.serverMs : null,
        interpretMs: typeof data.metrics?.interpretMs === "number" ? data.metrics.interpretMs : null,
        mode: data.mode
      });
      setMode(data.mode);
      setLastIntent(data.diagnostics ?? null);
      pendingRef.current = data.pending ?? null;
      setPending(pendingRef.current);
      setError(data.notice ?? "");
      cartRef.current = data.order ? [] : data.cart;
      setCart(cartRef.current);
      messagesRef.current = [...messagesRef.current, { role: "assistant", text: data.reply }];
      setMessages(messagesRef.current);
      if (!skipSpeech) say(data.reply, voiceRef.current || forceSpeak);
      if (data.order) {
        setOrders((previous) => {
          const updated = [data.order!, ...previous].slice(0, 12);
          try { localStorage.setItem("ordervoice:demo-orders", JSON.stringify(updated)); } catch { /* almacenamiento deshabilitado */ }
          return updated;
        });
      }
      return data;
    } catch (cause) {
      if (signal?.aborted) return undefined;
      if (voiceRef.current) stopVoiceSession();
      setError(cause instanceof Error ? cause.message : "Ocurrió un error inesperado");
      if (skipSpeech) throw cause;
      return undefined;
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
      recognition.onresult = (event) => { const phrase = event.results[0]?.[0]?.transcript; if (phrase) void send(phrase, true); };
      recognition.onerror = (event) => { setError(event.error === "network" ? "Reconocimiento por voz no disponible por red en este navegador. Prueba Chrome o Edge." : `Micrófono: ${event.error}. Verifica permisos y conexión.`); setListening(false); };
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
    handsFreeRef.current?.stop();
    if (voiceRef.current) stopVoiceSession();
    pendingRef.current = null;
    cartRef.current = [];
    messagesRef.current = [initialMessage];
    setPending(null);
    setCart([]);
    setMessages([initialMessage]);
    setLastTiming(null);
    setLastVoiceDelayMs(null);
    setLastTranscript("");
    setLastIntent(null);
    setReviewReady(false);
    setLastRecognitionMs(null);
    setLastSpeechToTextMs(null);
    setError("");
  }

  const total = calculateTotal(cart);
  return (
    <div className="shell">
      <header className="header">
        <div className="brand"><div className="brandmark">◉</div><div><strong>OrderVoice <span>AI</span></strong><small>Panel de pruebas · v1.0 voz continua</small></div></div>
        <div className="header-right"><span className="status-dot" /><span>Servidor de desarrollo</span><span className={`mode mode-${mode}`}>{mode === "ollama" ? "OLLAMA LOCAL" : mode === "ia" ? "IA ACTIVADA" : mode === "local" ? "REGLAS LOCALES" : mode === "demo" ? "MODO DEMO" : "MODO POR DETECTAR"}</span></div>
      </header>

      <div className="intro"><div><span className="eyebrow">PRIMER PROTOTIPO</span><h1>Tu recepcionista, <em>siempre disponible.</em></h1><p>Simula pedidos de una pizzería, conversa y comprueba cómo funciona el sistema antes de añadir llamadas telefónicas.</p></div><div className="intro-chip">🍕 <strong>Pizza Demo</strong><small>Restaurante ficticio</small></div></div>

      <main className="dashboard">
        <section className="panel chat-panel" aria-label="Asistente de pedidos">
          <div className="panel-heading"><div><h2>Asistente de pedidos</h2><p>Chat de simulación · Sin llamadas reales</p></div><button className="secondary reset" onClick={reset} disabled={busy || recording || transcribing}>↻ Reiniciar</button></div>
          <div className="conversation" ref={conversationRef} role="log" aria-live="polite">
            {messages.map((message, index) => <div className={`message ${message.role}`} key={index}><span className="message-avatar">{message.role === "assistant" ? "✦" : "TÚ"}</span><div className="message-body"><span className="speaker">{message.role === "assistant" ? "OrderVoice" : "Cliente"}</span><p>{message.text}</p></div></div>)}
            {busy && <div className="thinking">OrderVoice está procesando tu pedido…</div>}
          </div>
          <div className="voice-control handsfree-control">
            <button type="button"
              className={handsFreeActive ? "voice-session active" : "voice-session"}
              onClick={toggleHandsFree}
              disabled={!handsFreeActive && (busy || recording || transcribing)}>
              {handsFreeActive ? "■ Finalizar conversación" : "🎙 Iniciar conversación continua"}
            </button>
            <span role="status" aria-live="polite">{!handsFreeActive
              ? "Un solo clic para comenzar; después habla con naturalidad."
              : handsFreePhase === "starting" ? "Preparando el micrófono y el saludo…"
              : handsFreePhase === "listening" ? "🎙 Escuchando: habla cuando quieras…"
              : handsFreePhase === "hearing" ? "🎙 Te escucho; terminaré al detectar una pausa…"
              : handsFreePhase === "transcribing" ? "Convirtiendo tu voz en texto con OpenAI…"
              : handsFreePhase === "processing" ? "Interpretando el pedido y verificando el carrito…"
              : handsFreePhase === "speaking" ? "🔊 OrderVoice está respondiendo; volveré a escucharte…"
              : "Preparando el siguiente turno…"}
            </span>
          </div>
          <div className="handsfree-notice">
            OpenAI transcribe cada frase detectada y procesa el pedido (puede generar cargos).
            No se utiliza Twilio. Puedes finalizar la conversación en cualquier momento.
          </div>
          {lastTranscript && <div className="stt-result" role="status">
            <strong>Texto reconocido por la API:</strong> {lastTranscript}
          </div>}
          {lastIntent && <div className="plan-result" aria-label="Interpretación de la inteligencia artificial">
            <strong>Interpretación IA: </strong>
            {lastIntent.needsClarification ? "Necesita aclaración" :
              lastIntent.intent === "total" ? "Consultar total sin modificar" :
              lastIntent.intent === "confirm" ? "Confirmar pedido" :
              lastIntent.intent === "clear" ? "Vaciar carrito" :
              lastIntent.intent === "question" ? "Responder consulta sin modificar" :
              lastIntent.operations.length ? lastIntent.operations.map((op) => {
                const current = productById(op.productId)?.name ?? op.productId;
                const next = op.toProductId ? (productById(op.toProductId)?.name ?? op.toProductId) : "";
                const verb = op.kind === "add" ? "Añadir" :
                  op.kind === "remove" ? "Quitar" :
                  op.kind === "set" ? "Cantidad final" :
                  op.kind === "replace" ? "Sustituir" : "Conservar únicamente";
                return `${verb}: ${op.quantity} × ${current}${next ? ` por ${next}` : ""}`;
              }).join(" · ") : "Sin cambios"}
          </div>}
          {spanishVoices.length > 0 && <div className="voice-settings">
            <label htmlFor="voice-choice">Voz española de Edge:</label>
            <select id="voice-choice" value={selectedVoice} onChange={(event) => setSelectedVoice(event.target.value)}
              disabled={voiceSession || handsFreeActive} aria-label="Seleccionar voz en español">
              <option value="">Automática (español)</option>
              {spanishVoices.map((voice) => <option value={voice.voiceURI} key={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}
            </select>
          </div>}
          {lastTiming && <div className="performance" aria-label="Medición de velocidad de la última respuesta">
            <span>⏱ Respuesta: <strong>{lastTiming.requestMs} ms</strong></span>
            <span>Motor: <strong>{lastTiming.mode === "local" ? "Reglas locales" : lastTiming.mode === "ollama" ? "Ollama" : lastTiming.mode === "ia" ? "IA externa" : "Demo"}</strong></span>
            {lastTiming.serverMs !== null && <span>Servidor: <strong>{lastTiming.serverMs} ms</strong></span>}
            {lastTiming.interpretMs !== null && <span>Interpretación: <strong>{lastTiming.interpretMs} ms</strong></span>}
            {lastRecognitionMs !== null && <span>Voz → texto: <strong>{lastRecognitionMs} ms</strong></span>}
            {lastSpeechToTextMs !== null && <span>Fin del habla → texto: <strong>{lastSpeechToTextMs} ms</strong></span>}
            {lastVoiceDelayMs !== null && <span>Texto → inicio de voz: <strong>{lastVoiceDelayMs} ms</strong></span>}
          </div>}
          {error && <p className="error" role="alert">⚠ {error}</p>}
          <form className="composer" onSubmit={(event) => {event.preventDefault(); const fromReview = reviewReady; setReviewReady(false); void send(input, fromReview, fromReview);}}>
            
            <input aria-label="Escribe el pedido" placeholder="Ej.: dos pepperoni familiares y una hawaiana mediana" maxLength={500} value={input} onChange={(event) => setInput(event.target.value)} disabled={busy || handsFreeActive}/>
            <button className="send" type="submit" disabled={busy || handsFreeActive || !input.trim()}>Enviar <span>➜</span></button>
          </form>
          <div className="chat-footer"><label><input type="checkbox" checked={speakReplies} onChange={(event) => setSpeakReplies(event.target.checked)}/> Leer las respuestas en voz alta</label><span>{handsFreeActive ? "🎙 Conversación continua activa" : "Micrófono de conversación disponible arriba"}</span></div>
        </section>

        <aside className="right-column">
          <section className="panel"><div className="panel-heading compact"><div><h2>Menú de prueba</h2><p>Precios inventados, en USD</p></div><span className="counter">{MENU.length} productos</span></div><div className="menu-list">{MENU.map((product) => <div className="menu-item" key={product.id}><div className="food-icon">{product.emoji}</div><div className="food-name"><strong>{product.name}</strong><small>{formatUSD(product.priceCents)}</small></div><button type="button" title={`Añadir ${product.name}`} disabled={busy || handsFreeActive} className="add-btn" onClick={() => {void send(`Agrega una ${product.name}`);}}>+</button></div>)}</div></section>
          <section className="panel"><div className="panel-heading compact"><div><h2>Pedido actual</h2><p>Importe validado en servidor</p></div><span className="counter">{cart.reduce((n, item) => n + item.quantity, 0)} uds.</span></div>{cart.length ? <div className="cart-list">{cart.map((line) => {const p = productById(line.productId); return p && <div className="cart-line" key={line.productId}><span><b>{line.quantity}×</b> {p.name}</span><strong>{formatUSD(p.priceCents * line.quantity)}</strong></div>;})}</div> : <div className="empty">🛒<p>Tu carrito está vacío.</p><small>Pide algo por chat o usa los botones +</small></div>}<div className="cart-bottom"><div className="total"><span>Total</span><strong>{formatUSD(total)}</strong></div><button className="confirm" type="button" disabled={busy || handsFreeActive || !cart.length} onClick={() => {void send("Confirmo el pedido");}}>✓ Confirmar pedido</button></div></section>
          <section className="panel"><div className="panel-heading compact"><div><h2>Pedidos confirmados</h2><p>Guardados solo en este navegador</p></div></div>{orders.length ? <div className="orders">{orders.slice(0, 3).map((order) => <div className="order-row" key={order.id}><div><strong>#{order.id}</strong><small>{new Date(order.createdAt).toLocaleString("es-EC")}</small></div><strong>{formatUSD(order.totalCents)}</strong></div>)}</div> : <p className="no-orders">Todavía no hay pedidos confirmados.</p>}</section>
        </aside>
      </main>
      <footer>OrderVoice AI · MVP educativo · No recibe llamadas reales, no cobra pagos y no entrega pedidos a restaurantes.</footer>
    </div>
  );
}
