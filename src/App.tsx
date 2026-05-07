import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, 
  CheckCircle2, 
  MapPin, 
  Phone, 
  FileDown, 
  UserCheck, 
  Award, 
  ArrowRight, 
  Send, 
  X, 
  ChevronDown,
  Globe,
  Briefcase,
  PlayCircle,
  ExternalLink,
  Sun,
  Moon,
  Menu,
  Bell,
  BellOff,
  Info,
  Mic,
  Volume2,
  Loader2,
  ShieldCheck,
  Zap,
  Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ALICE_KNOWLEDGE } from './knowledge.ts';
import Markdown from 'react-markdown';

import { jsPDF } from 'jspdf';
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// --- Firebase Initialization ---
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

// --- WhatsApp & Automation Helpers ---
const openWhatsApp = (msg: string) => {
  const phone = "50259686584"; // Guatemala prefix
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
};

// --- Push Notifications Helper ---
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const PushNotificationManager = () => {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(reg => {
        setRegistration(reg);
        reg.pushManager.getSubscription().then(sub => {
          if (sub) {
            setSubscription(sub);
            setIsSubscribed(true);
          }
        });
      });
    }
  }, []);

  const subscribeToPush = async () => {
    if (!registration) return;
    setError(null);

    // Check if notifications are supported
    if (!("Notification" in window)) {
      setError("Este navegador no soporta notificaciones de escritorio.");
      return;
    }

    try {
      // 1. Check current permission first
      if (Notification.permission === 'denied') {
        setError("Las notificaciones están bloqueadas. Haz clic en el icono del candado en la barra de direcciones para permitirlas.");
        return;
      }

      // 2. Request Permission explicitly
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.error("Permission not granted for notifications");
        setError("Permiso denegado. Para recibir alertas, debes permitir las notificaciones en la configuración de tu navegador.");
        return;
      }

      const publicVapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!publicVapidKey) {
        console.error("VAPID public key not found");
        return;
      }

      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
      });

      // Send subscription to server
      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        body: JSON.stringify(sub),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      setSubscription(sub);
      setIsSubscribed(true);
      
      // Save subscription to Firestore for persistence
      try {
        await addDoc(collection(db, 'push_subscriptions'), {
          subscription: JSON.parse(JSON.stringify(sub)),
          createdAt: serverTimestamp(),
          ua: navigator.userAgent
        });
      } catch (e) {
        console.error("Error saving to Firestore:", e);
      }

    } catch (error) {
      console.error("Error subscribing to push:", error);
    }
  };

  const unsubscribeFromPush = async () => {
    if (subscription) {
      await subscription.unsubscribe();
      setSubscription(null);
      setIsSubscribed(false);
    }
  };

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-[2rem] border border-blue-100 dark:border-blue-800/30 flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-2xl ${isSubscribed ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'}`}>
            {isSubscribed ? <Bell size={24} /> : <BellOff size={24} />}
          </div>
          <div>
            <h4 className="font-black text-slate-900 dark:text-white uppercase tracking-tight">Notificaciones Web</h4>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">
              {isSubscribed ? 'Estás suscrito a las actualizaciones.' : 'Recibe alertas sobre el estado de tu trámite.'}
            </p>
          </div>
        </div>
        <button 
          onClick={isSubscribed ? unsubscribeFromPush : subscribeToPush}
          className={`px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
            isSubscribed 
            ? 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600' 
            : 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 hover:bg-blue-700'
          }`}
        >
          {isSubscribed ? 'Desactivar' : 'Activar'}
        </button>
      </div>
      {error && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-bold rounded-2xl border border-red-100 dark:border-red-900/30 flex items-center gap-3"
        >
          <Info size={16} />
          {error}
        </motion.div>
      )}
    </div>
  );
};

// --- Voice Assistant (Call Agent) Component ---
const VoiceAssistant = () => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const ai = new GoogleGenAI({ apiKey: (process as any).env.GEMINI_API_KEY as string });

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'es-GT';

      recognitionRef.current.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setTranscript(text);
        handleVoiceQuery(text);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };
    }
  }, []);

  const speak = async (text: string) => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: ["AUDIO" as any],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioData = atob(base64Audio);
        const arrayBuffer = new ArrayBuffer(audioData.length);
        const view = new Uint8Array(arrayBuffer);
        for (let i = 0; i < audioData.length; i++) {
          view[i] = audioData.charCodeAt(i);
        }

        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext();
        }
        const buffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        source.start();
      }
    } catch (e) {
      console.warn("Gemini TTS fallback:", e);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-GT';
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleVoiceQuery = async (text: string) => {
    setIsProcessing(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: text,
        config: {
          systemInstruction: "Eres un Agente de Llamada de VisaExpert Guatemala. Responde de forma muy breve (máximo 2 frases), profesional y amable. Tu respuesta será leída por un motor de voz.",
        }
      });

      const rt = response.text || "No pude entender eso.";
      setAiResponse(rt);
      await speak(rt);
    } catch (e) {
      console.error(e);
      setAiResponse("Error de conexión.");
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setTranscript('');
      setAiResponse('');
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (e) {
        console.error("Mic start error:", e);
      }
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-8 left-8 z-[60] w-16 h-16 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all group"
      >
        <div className="absolute inset-0 bg-indigo-500 rounded-full animate-ping opacity-25 group-hover:opacity-40" />
        <Volume2 className={isOpen ? 'rotate-12' : ''} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-28 left-8 z-[60] w-80 bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center text-indigo-600">
                    <UserCheck size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 dark:text-white uppercase text-[10px] tracking-widest">Agente Vocal</h3>
                    <p className="text-[10px] text-green-500 font-bold uppercase tracking-tighter">Disponible</p>
                  </div>
                </div>
                <button onClick={() => setIsOpen(false)} className="text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="min-h-[140px] flex flex-col justify-center items-center text-center gap-4">
                {isProcessing ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                    <Loader2 className="text-indigo-600" size={40} />
                  </motion.div>
                ) : (
                  <div className="relative">
                    <button
                      onClick={toggleListening}
                      className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                        isListening ? 'bg-red-500 shadow-lg shadow-red-500/40 scale-110' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Mic size={32} />
                    </button>
                    {isListening && (
                      <motion.div
                        className="absolute -inset-4 border-2 border-red-500 rounded-full"
                        animate={{ scale: [1, 1.5], opacity: [1, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                    )}
                  </div>
                )}
                
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  {isListening ? 'Escuchando tu voz...' : isProcessing ? 'Generando respuesta...' : 'Pulsa y pregunta algo'}
                </p>
              </div>

              {transcript && (
                <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <p className="text-[9px] uppercase font-black text-slate-400 mb-1">Tú:</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 italic leading-relaxed">"{transcript}"</p>
                </div>
              )}

              {aiResponse && (
                <div className="mt-4 p-4 bg-indigo-50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-800/30">
                  <p className="text-[9px] uppercase font-black text-indigo-400 mb-1">Agente:</p>
                  <p className="text-[11px] text-slate-900 dark:text-white font-medium leading-relaxed">{aiResponse}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// --- Sub-Components ---

const Logo = () => (
  <div className="flex items-center gap-4 group cursor-pointer">
    <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-500/30">
      <Globe size={24} />
    </div>
    <div className="flex flex-col">
      <span className="text-xl font-black text-slate-900 dark:text-white leading-none">CENTRO DE</span>
      <span className="text-blue-600 font-bold text-sm tracking-widest uppercase">OPORTUNIDADES</span>
    </div>
  </div>

);

const ThemeToggle = ({ theme, toggleTheme }: { theme: 'light' | 'dark', toggleTheme: () => void }) => (
  <button
    onClick={toggleTheme}
    className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95 flex items-center justify-center shadow-sm"
    aria-label="Toggle Theme"
  >
    {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
  </button>
);

const Navbar = ({ theme, toggleTheme }: { theme: 'light' | 'dark', toggleTheme: () => void }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 w-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl z-[100] border-b border-slate-100/50 dark:border-slate-800/50 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 h-24 flex items-center justify-between">
        <Logo />
        
        {/* Desktop Nav */}
        <div className="hidden lg:flex gap-10 text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">
          <a href="#servicios" className="hover:text-blue-600 transition-all py-2 relative group flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 scale-0 group-hover:scale-100 transition-transform" />
            Servicios
          </a>
          <a href="#proceso" className="hover:text-blue-600 transition-all py-2 relative group flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 scale-0 group-hover:scale-100 transition-transform" />
            Proceso
          </a>
          <a href="#consulta" className="hover:text-blue-600 transition-all py-2 relative group flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 scale-0 group-hover:scale-100 transition-transform" />
            Consulta
          </a>
          <a href="#testimonios" className="hover:text-blue-600 transition-all py-2 relative group flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 scale-0 group-hover:scale-100 transition-transform" />
            Testimonios
          </a>
          <a href="#contacto" className="hover:text-blue-600 transition-all py-2 relative group flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 scale-0 group-hover:scale-100 transition-transform" />
            Contacto
          </a>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:block">
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          </div>
          <button 
            onClick={() => openWhatsApp("Hola, me gustaría iniciar mi trámite de visa.")}
            className="bg-green-600 hover:bg-green-700 text-white px-6 lg:px-8 py-3 lg:py-4 rounded-2xl flex items-center gap-3 text-sm font-black transition-all shadow-2xl shadow-green-600/30 active:scale-95 group shrink-0"
          >
            <MessageCircle size={20} className="group-hover:rotate-12 transition-transform" />
            <span className="hidden sm:inline">WhatsApp:</span> 5968-6584
          </button>
          
          {/* Mobile Menu Toggle */}
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="lg:hidden p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all active:scale-95 flex items-center justify-center shrink-0"
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 overflow-hidden transition-colors duration-300"
          >
            <div className="px-6 py-10 flex flex-col gap-6 text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.25em]">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] text-slate-400">Modo Oscuro</span>
                <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
              </div>
              <a href="#servicios" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-600 flex items-center gap-4 transition-colors">
                <div className="w-2 h-2 rounded-full bg-blue-600" /> Servicios
              </a>
              <a href="#proceso" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-600 flex items-center gap-4 transition-colors">
                <div className="w-2 h-2 rounded-full bg-blue-600" /> Proceso
              </a>
              <a href="#consulta" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-600 flex items-center gap-4 transition-colors">
                <div className="w-2 h-2 rounded-full bg-blue-600" /> Consulta
              </a>
              <a href="#testimonios" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-600 flex items-center gap-4 transition-colors">
                <div className="w-2 h-2 rounded-full bg-blue-600" /> Testimonios
              </a>
              <a href="#contacto" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-600 flex items-center gap-4 transition-colors">
                <div className="w-2 h-2 rounded-full bg-blue-600" /> Contacto
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

const Hero = () => (
  <section className="pt-48 pb-32 px-4 relative overflow-hidden">
    {/* High Impact Background Design */}
    <div className="absolute inset-0 bg-slate-50 dark:bg-slate-950" />
    <div className="absolute top-0 right-0 w-[1000px] h-[1000px] bg-gradient-to-br from-blue-600/10 to-indigo-600/5 rounded-full blur-[120px] -mr-[300px] -mt-[300px] dark:opacity-20" />
    <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-[100px] -ml-[200px] -mb-[200px] dark:opacity-20" />
    
    <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-24 relative z-10">
      <div className="flex-1 space-y-10 text-center lg:text-left">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex flex-wrap gap-3"
        >
          <div className="inline-flex items-center gap-3 px-5 py-2.5 bg-white dark:bg-slate-900 shadow-xl shadow-blue-900/5 rounded-2xl border border-blue-50 dark:border-slate-800">
            <div className="p-1 px-2 bg-blue-600 text-white text-[10px] font-black rounded-lg">PRO</div>
            <span className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">Intermediación Laboral Internacional</span>
          </div>
          <div className="inline-flex items-center gap-3 px-5 py-2.5 bg-blue-50 dark:bg-blue-900/20 shadow-xl shadow-blue-900/5 rounded-2xl border border-blue-100 dark:border-blue-800/30">
            <div className="p-1 px-2 bg-indigo-600 text-white text-[10px] font-black rounded-lg">OFICIAL</div>
            <span className="text-[11px] font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-widest flex items-center gap-2">
              <CheckCircle2 size={12} />
              COLABORAMOS CON PROGRAMAS DE EMPLEO
            </span>
          </div>
        </motion.div>
        
        <motion.div
           initial={{ opacity: 0, y: 30 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ duration: 0.8, ease: "circOut" }}
           className="space-y-4"
        >
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-slate-900 dark:text-white leading-[0.85] tracking-tighter">
            CENTRO DE <br />
            <span className="text-blue-600 relative">
              OPORTUNIDADES.
              <span className="absolute -bottom-2 left-0 w-full h-2 md:h-3 bg-blue-100 dark:bg-blue-900/30 -z-10" />
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-slate-500 dark:text-slate-400 font-bold max-w-xl leading-tight md:leading-snug">
            Intermediación Laboral USA & Canadá · Procesos Transparentes · Oportunidades Verificadas.
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="p-8 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl rounded-[2.5rem] border border-white dark:border-slate-800 max-w-xl shadow-2xl shadow-blue-900/5 space-y-4"
        >
           <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/50 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                <MapPin size={24} />
              </div>
              <div>
                <h4 className="font-black text-lg text-slate-900 dark:text-white uppercase tracking-tight">Ubicación Estratégica</h4>
                <p className="text-slate-500 dark:text-slate-400 font-medium">Blvd. Austriaco, Zona 16. <br/>Frente a la Embajada de EE. UU.</p>
              </div>
           </div>
           <div className="h-[1px] bg-slate-100 dark:bg-slate-800 w-full" />
           <div className="flex items-center justify-between gap-4">
              <p className="font-black text-2xl text-slate-900 dark:text-white tracking-tighter">CITA ÚNICA: Q1,500</p>
              <div className="px-3 py-1 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-black rounded-lg">98% ÉXITO</div>
           </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col sm:flex-row gap-5"
        >
          <button 
            onClick={() => document.getElementById('contacto')?.scrollIntoView({ behavior: 'smooth' })}
            className="group relative bg-slate-900 dark:bg-blue-600 text-white px-12 py-6 rounded-[2rem] font-black text-xl flex items-center justify-center gap-4 shadow-2xl hover:bg-blue-600 dark:hover:bg-blue-700 transition-all active:scale-95"
          >
            INICIAR AHORA <ArrowRight size={28} className="group-hover:translate-x-2 transition-transform" />
          </button>
          <button 
            onClick={() => openWhatsApp("Hola, me gustaría agendar mi cita.")}
            className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white px-12 py-6 rounded-[2rem] font-black text-xl flex items-center justify-center gap-4 hover:border-blue-600 dark:hover:border-blue-500 transition-all active:scale-95"
          >
            SABER MÁS <Globe size={28} />
          </button>
          <button 
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: 'Centro de Oportunidades Laborales',
                  text: 'Intermediación Laboral USA & Canadá · Procesos Transparentes · Oportunidades Verificadas.',
                  url: window.location.href,
                }).catch((error) => console.log('Error sharing', error));
              } else {
                navigator.clipboard.writeText(window.location.href);
                alert("Enlace copiado al portapapeles");
              }
            }}
            className="p-6 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-[2rem] hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 border border-transparent hover:border-blue-200 transition-all"
            title="Compartir"
          >
            <Share2 size={24} />
          </button>
        </motion.div>
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.8, rotate: -3 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ delay: 0.4, type: "spring", stiffness: 100 }}
        className="flex-1 relative hidden lg:block"
      >
        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-to-br from-blue-600 to-indigo-800 rounded-[5rem] blur-2xl opacity-20 animate-pulse" />
          <div className="relative bg-white dark:bg-slate-800 p-4 rounded-[5rem] shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden group">
            <div className="aspect-[4/5] rounded-[4rem] overflow-hidden relative">
              <img 
                src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1200" 
                alt="Centro de Oportunidades Laborales - Oficinas" 
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000"
                referrerPolicy="no-referrer"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent" />
              
              {/* Floating success stats */}
              <div className="absolute bottom-10 left-10 right-10 space-y-6">
                 <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-xl">
                       <Award size={32} />
                    </div>
                    <div>
                       <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-1">Acreditación</p>
                       <h3 className="text-2xl font-black text-white leading-tight">Agencia Certificada</h3>
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/10 backdrop-blur-md p-4 rounded-3xl border border-white/20">
                       <p className="text-white font-black text-xl">+500</p>
                       <p className="text-white/60 text-[10px] font-bold uppercase">Aprobaciones</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md p-4 rounded-3xl border border-white/20">
                       <p className="text-white font-black text-xl">98%</p>
                       <p className="text-white/60 text-[10px] font-bold uppercase">Eficacia</p>
                    </div>
                 </div>
              </div>
            </div>
          </div>
          
          {/* Decorative floating elements */}
          <motion.div 
             animate={{ y: [0, -10, 0] }}
             transition={{ duration: 4, repeat: Infinity }}
             className="absolute -top-10 -right-10 bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-700 flex items-center gap-4"
          >
             <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-xl flex items-center justify-center">
                <CheckCircle2 size={24} />
             </div>
             <p className="font-black text-slate-800 dark:text-white tracking-tight">Visa Lista</p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  </section>
);

const CoreIdentity = () => (
  <section className="py-12 md:py-24 bg-white dark:bg-slate-900 border-y border-slate-100 dark:border-slate-800">
    <div className="max-w-7xl mx-auto px-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative rounded-2xl md:rounded-[3rem] overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 aspect-[16/9] flex items-center justify-center"
        >
          <img 
            src="https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&q=80&w=1200" 
            alt="Misión, Visión y Valores Corporativos" 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent" />
          <div className="absolute bottom-12 left-12 right-12 text-white">
            <h3 className="text-3xl font-black uppercase tracking-tighter">Nuestros Valores y Misión</h3>
            <p className="text-lg opacity-90 max-w-xl">Conectamos talento con oportunidades reales bajo principios de integridad y transparencia.</p>
          </div>
          <div className="absolute inset-0 pointer-events-none border-[4px] md:border-[12px] border-white dark:border-slate-900 rounded-2xl md:rounded-[3rem]" />
        </motion.div>

    </div>
  </section>
);

const Services = () => (
  <section id="servicios" className="py-32 bg-white dark:bg-slate-900 relative overflow-hidden">
    <div className="max-w-7xl mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-20">
          <motion.div 
            whileHover={{ y: -5 }}
            className="p-8 bg-blue-50/50 dark:bg-blue-900/10 rounded-[2.5rem] border border-blue-100/50 dark:border-blue-800/20 space-y-4"
          >
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
              <ShieldCheck size={24} />
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Política Antiestafas</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Garantizamos procesos 100% legales, sin cobros ocultos ni promesas falsas.</p>
          </motion.div>
          <motion.div 
            whileHover={{ y: -5 }}
            className="p-8 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-[2.5rem] border border-indigo-100/50 dark:border-indigo-800/20 space-y-4"
          >
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
              <Briefcase size={24} />
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Perfiles Verificados</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Buscamos y preparamos el mejor perfil profesional para empresas internacionales.</p>
          </motion.div>
          <motion.div 
            whileHover={{ y: -5 }}
            className="p-8 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-[2.5rem] border border-emerald-100/50 dark:border-emerald-800/20 space-y-4"
          >
            <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">
              <Zap size={24} />
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Intermediación Real</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Acceso a ferias de empleo y convocatorias vigentes de movilidad laboral.</p>
          </motion.div>
          <motion.div 
            whileHover={{ y: -5 }}
            className="p-8 bg-amber-50/50 dark:bg-amber-900/10 rounded-[2.5rem] border border-amber-100/50 dark:border-amber-800/20 space-y-4"
          >
            <div className="w-12 h-12 bg-amber-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-amber-500/30">
              <Globe size={24} />
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Migración Responsable</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Capacitación sobre derechos y deberes legales en el extranjero.</p>
          </motion.div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-end mb-20 gap-8">
          <div className="max-w-2xl space-y-4">
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">Impulsamos la <br/><span className="text-blue-600 dark:text-blue-400">movilidad laboral legal.</span></h2>
            <p className="text-xl text-slate-500 dark:text-slate-400 font-medium leading-relaxed">Intermediación privada estratégica fundamentada en la transparencia y la legalidad internacional.</p>
          </div>
          <div className="hidden md:block">
             <button 
               onClick={() => document.getElementById('contacto')?.scrollIntoView({ behavior: 'smooth' })}
               className="px-8 py-4 bg-slate-900 dark:bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors shadow-xl"
             >
               Ver Portafolio de Oportunidades
             </button>
          </div>
        </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <motion.div 
          whileHover={{ y: -10 }}
          className="p-10 bg-slate-50 dark:bg-slate-800 rounded-[3rem] border border-slate-100 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-500 transition-all group"
        >
          <div className="w-16 h-16 bg-white dark:bg-slate-700 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-600 flex items-center justify-center mb-10 text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 dark:group-hover:bg-blue-500 group-hover:text-white transition-colors">
            <UserCheck size={32} />
          </div>
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">Vïsas de Turismo (B1/B2)</h3>
          <p className="text-slate-500 dark:text-slate-400 leading-relaxed font-medium">Preparamos tu perfil para demostrar arraigo y honestidad ante el oficial consular. Ideal para vacaciones y negocios.</p>
        </motion.div>

        <motion.div 
          whileHover={{ y: -10 }}
          className="p-10 bg-blue-600 dark:bg-blue-700 rounded-[3rem] shadow-2xl shadow-blue-600/20 text-white relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-8 opacity-20">
             <Globe size={120} className="text-white" />
          </div>
          <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 flex items-center justify-center mb-10 text-white">
            <Briefcase size={32} />
          </div>
          <h3 className="text-2xl font-bold mb-4 tracking-tight">Visas de Trabajo (H2A/H2B)</h3>
          <p className="text-blue-100 leading-relaxed font-medium relative z-10">Especialistas en agrupar la documentación de experiencia para trabajadores agrícolas y no-agrícolas hacia EE. UU. y Canadá.</p>
        </motion.div>

        <motion.div 
          whileHover={{ y: -10 }}
          className="p-10 bg-slate-50 dark:bg-slate-800 rounded-[3rem] border border-slate-100 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-500 transition-all group"
        >
          <div className="w-16 h-16 bg-white dark:bg-slate-700 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-600 flex items-center justify-center mb-10 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 dark:group-hover:bg-indigo-500 group-hover:text-white transition-colors">
            <UserCheck size={32} />
          </div>
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">Preparación de Entrevista</h3>
          <p className="text-slate-500 dark:text-slate-400 leading-relaxed font-medium">Simulacros reales basados en las preguntas más frecuentes de la embajada. Perfeccionamos tus respuestas con honestidad.</p>
        </motion.div>
      </div>
    </div>
  </section>
);

const BotAlice = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>(() => {
    try {
      const saved = localStorage.getItem('alice_chat_history_v2');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Error loading chat history", e);
    }
    return [
      { role: 'bot', content: '¡Hola! Soy Alice, tu asistente experta en visas. Mi objetivo es guiarte hacia tu sueño de viajar a EE. UU. o Canadá de forma legal. ¿Qué duda puedo resolverte hoy?' }
    ];
  });
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('alice_chat_history_v2', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    
    const userMsg = input;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setIsTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `
        Eres Alice, la asistente virtual experta de "VisaExpert Guatemala". 
        Tu tono es profesional, amable, servicial y altamente detallista.
        Tu conocimiento se basa en: ${JSON.stringify(ALICE_KNOWLEDGE)}
        
        REGLAS:
        1. Responde SIEMPRE en español con excelente gramática.
        2. Si preguntan por costos, recuerda el pago único de Q1,500 y aclara que los aranceles consulares van por cuenta del usuario.
        3. Si preguntan por ubicación, menciona zona 16 frente a la embajada.
        4. No inventes datos que no estén en el conocimiento base.
        5. Usa Markdown suave (negritas, listas) para facilitar la lectura.
        6. Si el usuario parece muy interesado, anímalo a llenar el formulario de contacto o escribir al WhatsApp ${ALICE_KNOWLEDGE.whatsapp}.
        
        Pregunta del usuario: ${userMsg}
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      const responseText = response.text || "Lo siento, tuve un pequeño problema al procesar tu solicitud. ¿Me lo puedes repetir?";
      setMessages(prev => [...prev, { role: 'bot', content: responseText }]);
    } catch (error) {
      console.error("Gemini Error:", error);
      setMessages(prev => [...prev, { role: 'bot', content: "Lo siento, mi conexión con la central de inteligencia está fallando. Por favor escribe a nuestro WhatsApp oficial: " + ALICE_KNOWLEDGE.whatsapp }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="mb-4 w-full max-w-[90vw] sm:w-[400px] h-[600px] bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden"
          >
            {/* Header Bot */}
            <div className="p-6 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl border-2 border-white/20 overflow-hidden bg-white/10 p-0.5">
                   <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200" alt="Alice Avatar" className="w-full h-full object-cover rounded-xl" />
                </div>
                <div>
                  <h4 className="font-bold text-lg leading-tight">Alice AI</h4>
                  <div className="flex items-center gap-1.5 opacity-80">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <p className="text-xs font-medium">Asesora en Línea</p>
                  </div>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-colors"><X size={24}/></button>
            </div>
            {/* Chat Body */}
            <div ref={scrollRef} className="flex-1 p-6 overflow-y-auto space-y-6 bg-slate-50/50 dark:bg-slate-950/50 scroll-smooth">
              {messages.map((m, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={i} 
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] p-4 rounded-3xl text-sm leading-relaxed ${
                    m.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none shadow-lg shadow-blue-600/20 px-5' 
                    : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-sm rounded-tl-none border border-slate-100 dark:border-slate-700'
                  }`}>
                    <Markdown>{m.content}</Markdown>
                  </div>
                </motion.div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-slate-800 p-4 rounded-3xl rounded-tl-none border border-slate-100 dark:border-slate-700 flex gap-1">
                    <span className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              )}
            </div>
            {/* Input Chat */}
            <div className="p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
               <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-1.5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:bg-white dark:focus-within:bg-slate-800 transition-all">
                  <input 
                    type="text" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Pregúntame sobre visas..."
                    className="flex-1 bg-transparent px-2 py-3 text-sm focus:outline-none text-slate-900 dark:text-white"
                    disabled={isTyping}
                  />
                  <button 
                    onClick={handleSend}
                    disabled={isTyping}
                    className="bg-blue-600 text-white p-2.5 rounded-xl hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Send size={20} />
                  </button>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-blue-600 text-white shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all relative group"
      >
        <div className="absolute inset-0 rounded-3xl border-4 border-white/20 transition-transform group-hover:scale-110" />
        <MessageCircle size={32} className="group-hover:rotate-12 transition-transform" />
        {!isOpen && (
          <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 rounded-full border-4 border-white animate-bounce" />
        )}
      </button>
    </div>
  );
};

const Process = () => (
  <section id="proceso" className="py-20 bg-white dark:bg-slate-900">
    <div className="max-w-7xl mx-auto px-4">
      <h2 className="text-3xl md:text-4xl font-bold text-center text-slate-900 dark:text-white mb-16 uppercase tracking-tighter">Nuestra Ruta al Éxito</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {[
          { step: "01", title: "Asesoría Inicial", desc: "Revisamos tu caso a fondo." },
          { step: "02", title: "Formularios", desc: "Lllenado profesional sin errores." },
          { step: "03", title: "Simulacro", desc: "Te preparamos para el cónsul." },
          { step: "04", title: "Visa en Mano", desc: "Disfruta de tu viaje seguro." }
        ].map((item, i) => (
          <div key={i} className="relative p-8 bg-white dark:bg-slate-800 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 text-center shadow-sm">
            <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-xs font-black tracking-widest">{item.step}</span>
            <h4 className="font-bold text-slate-900 dark:text-white mt-4 mb-2 text-xl">{item.title}</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const Testimonials = () => (
  <section id="testimonios" className="py-24 bg-blue-600 dark:bg-blue-900 text-white overflow-hidden relative">
    {/* Decorative background element */}
    <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 dark:bg-blue-700 rounded-full blur-3xl opacity-20 -mr-48 -mt-48" />
    <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500 dark:bg-indigo-700 rounded-full blur-3xl opacity-20 -ml-48 -mb-48" />

    <div className="max-w-7xl mx-auto px-4 relative z-10">
      <div className="flex flex-col lg:flex-row gap-16 items-center">
        <div className="flex-1 space-y-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-5xl font-bold leading-tight">Clientes que ya están cumpliendo sus metas</h2>
            <p className="mt-6 text-blue-100 dark:text-blue-200 text-xl leading-relaxed">
              Hemos asesorado con éxito a cientos de guatemaltecos, brindando seguridad y transparencia en cada trámite.
            </p>
          </motion.div>
          
          <div className="flex flex-wrap gap-8 items-center pt-4">
            <div className="flex flex-col">
              <span className="text-3xl font-bold text-white">98%</span>
              <span className="text-blue-200 text-sm italic">Tasa de Eficacia</span>
            </div>
            <div className="h-10 w-[1px] bg-blue-400 hidden sm:block" />
            <div className="flex flex-col">
              <span className="text-3xl font-bold text-white">+500</span>
              <span className="text-blue-200 text-sm italic">Visas Aprobadas</span>
            </div>
            <div className="h-10 w-[1px] bg-blue-400 hidden sm:block" />
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(i => <Award key={i} className="text-yellow-400 fill-yellow-400" size={24} />)}
            </div>
          </div>
        </div>

        <div className="flex-1 w-full space-y-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white/10 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/20 shadow-2xl hover:bg-white/15 transition-colors group"
          >
            <div className="flex gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-blue-400/30 flex items-center justify-center text-xl font-bold">J</div>
              <div>
                <p className="font-bold text-lg">Juan Carlos P.</p>
                <p className="text-blue-200 text-sm">Residente en Canadá</p>
              </div>
            </div>
            <p className="text-lg italic leading-relaxed text-blue-50">
              "Gracias a **VisaExpert Guatemala**, mi sueño de trabajar en Canadá se hizo realidad. El proceso fue claro, honesto y eficiente desde la primera cita."
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="bg-white/10 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/20 shadow-2xl hover:bg-white/15 transition-colors group"
          >
            <div className="flex gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-indigo-400/30 flex items-center justify-center text-xl font-bold">M</div>
              <div>
                <p className="font-bold text-lg">María Elena G.</p>
                <p className="text-blue-200 text-sm">Viajera a EE.UU.</p>
              </div>
            </div>
            <p className="text-lg italic leading-relaxed text-blue-50">
              "La asesoría fue fundamental para obtener mi visa de trabajo a EE.UU. Recomiendo sus servicios al 100% por su profesionalismo y dedicación."
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  </section>
);

const FormSection = React.forwardRef<HTMLDivElement>((props, ref) => {
  const [formData, setFormData] = useState({
    nombre: '',
    localidad: '',
    tipoTrabajo: '',
    educacion: 'Primaria / Diversificado',
    experiencia: 'Sin experiencia previa',
    telefono: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (formData.nombre.trim().split(' ').length < 2) newErrors.nombre = "Por favor, ingresa tu nombre y apellido.";
    if (!/^\d{8}$/.test(formData.telefono.replace(/\s/g, ''))) {
      newErrors.telefono = "Ingresa 8 dígitos (Ej: 59686584).";
    }
    if (!formData.localidad) newErrors.localidad = "Dinosh de dónde nos escribes.";
    if (!formData.tipoTrabajo) newErrors.tipoTrabajo = "Selecciona una opción.";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // 1. Save to Database
      await addDoc(collection(db, "prospects"), {
        ...formData,
        createdAt: serverTimestamp()
      });

      // 2. Open WhatsApp
      const msg = `HOLA VISAEXPERT, ME INTERESA UNA ASESORÍA\n\n` +
                  `👤 Nombre: ${formData.nombre}\n` +
                  `📍 Localidad: ${formData.localidad}\n` +
                  `💼 Interés: ${formData.tipoTrabajo}\n` +
                  `🎓 Educación: ${formData.educacion}\n` +
                  `🛠 Experiencia: ${formData.experiencia}\n` +
                  `📞 Teléfono: ${formData.telefono}\n\n` +
                  `Deseo agendar mi cita de Q1,500 para iniciar mi proceso.`;
      
      openWhatsApp(msg);
      
      // Reset form or show success if needed
      setFormData({
        nombre: '',
        localidad: '',
        tipoTrabajo: '',
        educacion: 'Primaria / Diversificado',
        experiencia: 'Sin experiencia previa',
        telefono: ''
      });
    } catch (error) {
      console.error("Error saving prospect:", error);
      alert("Hubo un error al guardar tu información. Sin embargo, puedes contactarnos directamente por WhatsApp.");
      
      // Fallback to WhatsApp even if DB fails
      const msg = `HOLA VISAEXPERT, ME INTERESA UNA ASESORÍA\n\n` +
                  `👤 Nombre: ${formData.nombre}\n` +
                  `📞 Teléfono: ${formData.telefono}\n\n` +
                  `Hubo un error en el formulario web, pero deseo agendar mi cita.`;
      openWhatsApp(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="contacto" ref={ref} className="py-24 bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-2 gap-20 items-start">
        <div className="space-y-12">
          <div className="space-y-6">
            <h2 className="text-4xl font-bold text-slate-900 dark:text-white leading-tight">Empieza hoy mismo tu proceso</h2>
            <p className="text-slate-600 dark:text-slate-400 text-lg font-medium leading-relaxed">Nuestro equipo de expertos está listo para transformar tu perfil en una solicitud ganadora.</p>
          </div>

          <div className="grid gap-8">
            <div className="flex gap-6 items-start">
              <div className="w-14 h-14 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                <MapPin size={28} />
              </div>
              <div>
                <dt className="font-bold text-slate-900 dark:text-white text-lg mb-1 tracking-tight">Visítanos Personalmente</dt>
                <dd className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                  Boulevard Austriaco zona 16, Guatemala.<br />
                  Frente a la Embajada de Estados Unidos.
                </dd>
              </div>
            </div>

            <div className="flex gap-6 items-start">
              <div className="w-14 h-14 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-center text-green-600 dark:text-green-400 shrink-0">
                <Phone size={28} />
              </div>
              <div>
                <dt className="font-bold text-slate-900 dark:text-white text-lg mb-1 tracking-tight">Llámanos o Escríbenos</dt>
                <dd className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                  WhatsApp: <span className="font-black text-slate-800 dark:text-slate-200 tracking-wider">5968-6584</span><br />
                  Atención detallada y amable.
                </dd>
              </div>
            </div>
          </div>

          <div className="p-8 bg-blue-50 dark:bg-blue-900/20 rounded-3xl border border-blue-100 dark:border-blue-800 space-y-4 shadow-sm">
             <div className="flex items-center gap-3 text-blue-800 dark:text-blue-400 font-black uppercase tracking-widest text-sm">
               <CheckCircle2 size={24} />
               <h4>Información de Cobro</h4>
             </div>
             <p className="text-blue-700/80 dark:text-blue-300/80 text-sm leading-relaxed font-bold italic">
               Nuestra asesoría integral tiene un <span className="text-blue-900 dark:text-blue-100 font-black">cobro único de Q1,500</span>. 
               Es importante aclarar que los aranceles consulares (tasas de visa) son responsabilidad del interesado y se pagan directamente a la embajada.
             </p>
          </div>
        </div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] shadow-2xl shadow-blue-900/5 border border-slate-100 dark:border-slate-800"
        >
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">Nombre Completo</label>
              <input 
                type="text" 
                className={`w-full bg-slate-50 dark:bg-slate-800 border ${errors.nombre ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'} rounded-2xl px-6 py-4 outline-none focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/30 transition-all font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600`}
                placeholder="Ej. Carlos Roberto Méndez"
                value={formData.nombre}
                onChange={e => setFormData({...formData, nombre: e.target.value})}
              />
              {errors.nombre && <p className="text-red-500 text-xs mt-1 ml-1 font-bold">{errors.nombre}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">Localidad</label>
                <input 
                  type="text" 
                  className={`w-full bg-slate-50 dark:bg-slate-800 border ${errors.localidad ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'} rounded-2xl px-6 py-4 outline-none focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/30 transition-all font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600`}
                  placeholder="Ej. Quetzaltenango"
                  value={formData.localidad}
                  onChange={e => setFormData({...formData, localidad: e.target.value})}
                />
                {errors.localidad && <p className="text-red-500 text-xs mt-1 ml-1 font-bold">{errors.localidad}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">Teléfono WhatsApp</label>
                <input 
                  type="text" 
                  className={`w-full bg-slate-50 dark:bg-slate-800 border ${errors.telefono ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'} rounded-2xl px-6 py-4 outline-none focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/30 transition-all font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600`}
                  placeholder="5968 6584"
                  value={formData.telefono}
                  onChange={e => setFormData({...formData, telefono: e.target.value})}
                />
                {errors.telefono && <p className="text-red-500 text-xs mt-1 ml-1 font-bold">{errors.telefono}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">Propósito del Viaje</label>
              <select 
                className={`w-full bg-slate-50 dark:bg-slate-800 border ${errors.tipoTrabajo ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'} rounded-2xl px-6 py-4 outline-none focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/30 transition-all font-bold text-slate-900 dark:text-white appearance-none`}
                value={formData.tipoTrabajo}
                onChange={e => setFormData({...formData, tipoTrabajo: e.target.value})}
              >
                <option value="">Selecciona tu interés...</option>
                <option value="Trabajo Agricola (H2A)">Trabajo Agrícola (H2A)</option>
                <option value="Trabajo No-Agricola (H2B)">Trabajo No-Agrícola (H2B)</option>
                <option value="Turismo o Negocios (B1/B2)">Turismo o Negocios (B1/B2)</option>
                <option value="Renovacion">Renovación de Visa</option>
                <option value="Estudios">Visa de Estudiante</option>
              </select>
              {errors.tipoTrabajo && <p className="text-red-500 text-xs mt-1 ml-1 font-bold">{errors.tipoTrabajo}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">Nivel Educativo</label>
                <select 
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-4 outline-none focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/30 transition-all font-bold text-slate-900 dark:text-white appearance-none"
                  value={formData.educacion}
                  onChange={e => setFormData({...formData, educacion: e.target.value})}
                >
                  <option>Primaria / Diversificado</option>
                  <option>Técnico Profesional</option>
                  <option>Universitario</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">Experiencia Laboral</label>
                <select 
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-4 outline-none focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/30 transition-all font-bold text-slate-900 dark:text-white appearance-none"
                  value={formData.experiencia}
                  onChange={e => setFormData({...formData, experiencia: e.target.value})}
                >
                  <option>Sin experiencia previa</option>
                  <option>1-3 años en el área</option>
                  <option>+5 años de experiencia</option>
                </select>
              </div>
            </div>

            <button 
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-5 rounded-2xl font-black transition-all shadow-xl shadow-blue-500/20 active:scale-[0.98] flex items-center justify-center gap-3 text-lg disabled:opacity-50"
            >
              {isSubmitting ? "Enviando..." : "Agendar Asesoría vía WhatsApp"} <Send size={22} />
            </button>
            <p className="text-center text-[10px] font-black uppercase tracking-widest text-slate-400 mt-4">
              *Tus datos están protegidos conforme a la ley.
            </p>
          </form>
        </motion.div>
      </div>
    </section>
  );
});

const Downloads = () => {
  const generatePDF = (title: string, items: string[], header: string) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // --- Background Decor ---
    doc.setFillColor(248, 250, 252); // slate-50
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    // Header - Professional blue bar
    doc.setFillColor(30, 41, 59); // slate-900
    doc.rect(0, 0, pageWidth, 45, 'F');
    
    // Add Logo or Fallback
    try {
      doc.addImage("/logo.png", "PNG", 20, 10, 25, 25);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text("VisaExpert", 50, 22);
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text("Guatemala", 50, 29);
    } catch (e) {
      // Fallback
      doc.setFillColor(59, 130, 246);
      doc.circle(28, 22, 12, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("VE", 28, 24, { align: "center" });
      doc.setFontSize(22);
      doc.text("VisaExpert", 45, 22);
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text("Guatemala", 45, 29);
    }
    
    // Badge "98% Éxito"
    doc.setFillColor(34, 197, 94); // green-500
    doc.roundedRect(pageWidth - 65, 15, 45, 12, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("98% EFECTIVIDAD", pageWidth - 42.5, 23, { align: "center" });

    // --- Content Section ---
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text(header.toUpperCase(), 20, 65);

    // Subtle line
    doc.setDrawColor(51, 65, 85);
    doc.setLineWidth(0.8);
    doc.line(20, 70, 70, 70);

    // Description text
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 116, 139);
    doc.text("Documento oficial para clientes de VisaExpert Guatemala. Blvd. Austriaco, Zona 16.", 20, 78);

    // List Logic
    doc.setFontSize(11);
    doc.setTextColor(51, 65, 85);
    
    let yPos = 90;
    items.forEach((item) => {
      if (item.startsWith("**")) {
        // Section Title
        yPos += 5;
        doc.setFillColor(226, 232, 240); // slate-200
        doc.rect(20, yPos - 6, pageWidth - 40, 9, 'F');
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59);
        doc.text(item.replace(/\*\*/g, ""), 25, yPos);
        yPos += 12;
      } else {
        // List Item
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        
        // Custom Bullet
        doc.setFillColor(59, 130, 246); // blue-500
        doc.circle(24, yPos - 1.5, 0.8, 'F');

        const splitText = doc.splitTextToSize(item, pageWidth - 50);
        doc.text(splitText, 30, yPos);
        yPos += (splitText.length * 7) + 2;
      }
      
      if (yPos > pageHeight - 40) {
        doc.addPage();
        yPos = 30;
      }
    });

    // --- Professional "Seal" at bottom right ---
    const sealX = pageWidth - 60;
    const sealY = pageHeight - 65;
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.5);
    doc.circle(sealX + 20, sealY + 20, 15, 'S');
    doc.setFontSize(7);
    doc.text("CERTIFICADO", sealX + 20, sealY + 15, { align: "center" });
    doc.setFontSize(9);
    doc.text("VISAEXPERT", sealX + 20, sealY + 22, { align: "center" });
    doc.setFontSize(7);
    doc.text("GUATEMALA", sealX + 20, sealY + 28, { align: "center" });

    // --- Footer ---
    doc.setFillColor(30, 41, 59);
    doc.rect(0, pageHeight - 20, pageWidth, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Ubicación: Blvd. Austriaco frente a Embajada EE.UU, Z.16", 20, pageHeight - 9);
    doc.text("WhatsApp: +502 5968 6584 | www.visaexpert.com.gt", pageWidth - 20, pageHeight - 9, { align: "right" });

    doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
  };

  const requisitosItems = [
    "**DOCUMENTOS DE IDENTIDAD**",
    "Pasaporte vigente con un mínimo de 6 meses de validez restante.",
    "DPI (Documento Personal de Identificación) original y copia legible.",
    "**SOPORTE ECONÓMICO**",
    "Constancia laboral reciente en hoja membretada (puesto, sueldo y antigüedad).",
    "Estados de cuenta bancarios de los últimos 3 meses, firmados y sellados por el banco.",
    "Títulos de propiedad o registros de vehículos a su nombre (si posee).",
    "**VÍNCULOS Y ARRAIGO**",
    "Certificados de nacimiento o matrimonio (para solicitudes familiares).",
    "Información detallada de familiares en el extranjero (si aplica).",
    "**PASOS FINALES**",
    "Pago de honorarios por asesoría profesional (Q1,500).",
    "Comprobante de pago de aranceles consulares (según el tipo de visa)."
  ];

  const formulariosItems = [
    "**VISA ESTADOS UNIDOS**",
    "Formulario DS-160: Es el documento electrónico principal. Requiere foto digital específica.",
    "Cita Consular: Programación en el sistema oficial de la embajada.",
    "**VISA CANADÁ**",
    "Formulario de Información Familiar (IMM5645).",
    "Cuestionario de Historial de Viajes y ArriveCAN.",
    "**ASISTENCIA VISAEXPERT**",
    "Nosotros nos encargamos del llenado técnico de cada uno de estos documentos para garantizar que no existan errores gramaticales o de fondo."
  ];

  return (
    <section className="py-20 bg-slate-900 dark:bg-black text-white">
      <div className="max-w-7xl mx-auto px-4 text-center">
        <h2 className="text-3xl font-black mb-8 uppercase tracking-tighter">Documentación y Recursos</h2>
        <div className="flex flex-wrap justify-center gap-6">
          <button 
            onClick={() => generatePDF("Guia_Formularios_Visa", formulariosItems, "Guía de Formularios Oficiales")}
            className="bg-white/10 hover:bg-white/20 px-8 py-6 rounded-3xl border border-white/20 flex flex-col items-center gap-4 transition-all group"
          >
            <FileDown size={32} className="text-blue-400 group-hover:scale-110 transition-transform" />
            <div className="text-left">
              <p className="font-black text-sm uppercase tracking-tight">Formularios Oficiales</p>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">PDF - DS-160 / ArriveCAN</p>
            </div>
          </button>
          <button 
            onClick={() => generatePDF("Requisitos_Legales_VisaExpert", requisitosItems, "Listado de Requisitos Legales")}
            className="bg-white/10 hover:bg-white/20 px-8 py-6 rounded-3xl border border-white/20 flex flex-col items-center gap-4 transition-all group"
          >
            <FileDown size={32} className="text-green-400 group-hover:scale-110 transition-transform" />
            <div className="text-left">
              <p className="font-black text-sm uppercase tracking-tight">Listado de Requisitos</p>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">PDF - Documentación Necesaria</p>
            </div>
          </button>
        </div>
      </div>
    </section>
  );
};

const LocationSection = () => {
  return (
    <section id="ubicacion" className="py-24 bg-white dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4">
        <div className="bg-slate-900 dark:bg-slate-950 rounded-[3rem] p-10 md:p-20 text-white relative overflow-hidden flex flex-col md:flex-row items-center gap-12">
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600 rounded-full blur-[100px] opacity-20 -mr-48 -mt-48" />
          
          <div className="flex-1 space-y-8 relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 text-blue-400 font-black text-xs uppercase tracking-widest">
              <MapPin size={16} /> Ubicación Estratégica
            </div>
            <h2 className="text-4xl md:text-5xl font-black leading-tight tracking-tight">
              Visítanos justo frente a la <span className="text-blue-500">nueva Embajada.</span>
            </h2>
            <div className="space-y-4">
              <p className="text-xl text-slate-300 font-medium leading-relaxed">
                Estamos ubicados en el corazón de Zona 16, un punto clave para todos los solicitantes de visa en Guatemala.
              </p>
              <div className="flex items-center gap-4 text-slate-400">
                <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-white">
                   <Phone size={20} />
                </div>
                <div>
                   <p className="text-xs font-bold uppercase tracking-widest">Atención inmediata</p>
                   <p className="font-bold text-white">Lunes a Viernes: 7:00 AM - 4:00 PM</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 w-full relative z-10">
            <div className="bg-white/5 backdrop-blur-sm p-8 rounded-[2.5rem] border border-white/10 space-y-6">
              <div className="space-y-2">
                 <p className="text-sm font-black text-blue-400 uppercase tracking-widest">Dirección Exacta</p>
                 <p className="text-2xl font-bold leading-tight">Blvd. Austriaco 11-51, Zona 16, Ciudad de Guatemala.</p>
              </div>
              <p className="text-slate-400 leading-relaxed font-bold italic text-sm">
                Referencia: Edificio comercial justo al cruzar la calle de la entrada principal de la Embajada de EE. UU.
              </p>
              <a 
                href="https://maps.app.goo.gl/arCh7pbgHUQxHhap6" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-3 bg-white text-slate-900 px-8 py-5 rounded-2xl font-black text-lg shadow-xl hover:bg-blue-600 hover:text-white transition-all active:scale-95 group"
              >
                ABRIR EN GOOGLE MAPS <ExternalLink size={24} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const MythsSection = () => (
  <section className="py-24 bg-white dark:bg-slate-900">
    <div className="max-w-7xl mx-auto px-4">
      <h2 className="text-3xl md:text-4xl font-black text-center text-slate-900 dark:text-white mb-16 uppercase tracking-tighter">Mitos vs Realidades</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {(ALICE_KNOWLEDGE as any).myths.map((item: any, i: number) => (
          <motion.div 
            key={i}
            whileHover={{ y: -5 }}
            className="p-8 rounded-[2rem] border border-blue-50 dark:border-blue-900/30 bg-blue-50/30 dark:bg-blue-900/10 space-y-4"
          >
            <div className="flex items-start gap-4">
              <div className="mt-1 p-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full"><X size={16} /></div>
              <p className="font-black text-slate-800 dark:text-white leading-relaxed">{item.myth}</p>
            </div>
            <div className="flex items-start gap-4">
              <div className="mt-1 p-1 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full"><CheckCircle2 size={16} /></div>
              <p className="text-slate-600 dark:text-slate-400 text-sm font-medium leading-relaxed">{item.truth}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

const OfficeTour = () => (
  <section className="py-24 bg-slate-50 dark:bg-slate-950 overflow-hidden">
    <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center gap-16">
      <div className="flex-1 order-2 md:order-1">
        <div className="relative group">
          <div className="absolute -inset-4 bg-blue-600/10 rounded-[2rem] blur-2xl group-hover:bg-blue-600/20 transition-all"></div>
          <div className="relative aspect-video rounded-[3rem] overflow-hidden shadow-2xl bg-slate-200 dark:bg-slate-800 border-4 border-white dark:border-slate-800">
            <img 
              src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1000" 
              className="w-full h-full object-cover" 
              alt="Nuestras oficinas"
            />
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center group-hover:bg-black/10 transition-colors">
              <PlayCircle size={64} className="text-white drop-shadow-lg" />
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 order-1 md:order-2 space-y-8">
        <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white leading-tight tracking-tight">Visítanos y siéntete <br/>como en casa</h2>
        <p className="text-xl text-slate-600 dark:text-slate-400 font-bold italic leading-relaxed">
          "Estamos ubicados estratégicamente justo frente a la entrada principal de la Embajada de Estados Unidos."
        </p>
        <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
           {(ALICE_KNOWLEDGE as any).office_tour}
        </p>
        <div className="flex flex-col sm:flex-row gap-5 pt-4">
          <a href={`https://wa.me/502${ALICE_KNOWLEDGE.whatsapp}`} className="bg-blue-600 text-white px-10 py-5 rounded-2xl font-black shadow-xl shadow-blue-500/30 hover:bg-blue-700 transition-all flex items-center justify-center gap-3 text-lg" target="_blank" rel="noopener noreferrer">
            Agendar cita <Phone size={22} />
          </a>
          <a href="https://maps.app.goo.gl/arCh7pbgHUQxHhap6" target="_blank" rel="noopener noreferrer" className="bg-white dark:bg-slate-800 text-slate-700 dark:text-white border border-slate-200 dark:border-slate-700 px-10 py-5 rounded-2xl font-black shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-3 text-lg">
            Ver ubicación <MapPin size={22} className="text-blue-600 dark:text-blue-400" />
          </a>
        </div>
        <div className="flex items-center gap-6 pt-4">
          <div className="flex -space-x-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="w-12 h-12 rounded-full border-2 border-white dark:border-slate-800 overflow-hidden bg-slate-100 dark:bg-slate-800">
                <img src={`https://i.pravatar.cc/100?u=office${i}`} alt="Avatar" />
              </div>
            ))}
          </div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Nuestro equipo está listo para recibirte.</p>
        </div>
      </div>
    </div>
  </section>
);

const VideoGallery = () => (
  <section className="py-24 bg-slate-900 dark:bg-black text-white overflow-hidden relative">
    <div className="max-w-7xl mx-auto px-4 relative z-10">
      <div className="text-center mb-16 space-y-4">
        <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tighter">Videos Informativos</h2>
        <p className="text-slate-400 font-bold">Consejos rápidos y educativos sobre tu trámite.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {[
          { title: "Mitos sobre la visa B1/B2", desc: "Lo que el cónsul realmente busca." },
          { title: "Recorrido por nuestras oficinas", desc: "Conoce dónde preparamos tu éxito." }
        ].map((v, i) => (
          <div key={i} className="aspect-video bg-slate-800 dark:bg-slate-900 rounded-[3rem] overflow-hidden shadow-2xl relative group cursor-pointer border border-white/5">
             <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-10 flex flex-col justify-end">
                <h4 className="text-2xl font-black mb-1 uppercase tracking-tight">{v.title}</h4>
                <p className="text-slate-400 font-medium">{v.desc}</p>
             </div>
             <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                <PlayCircle size={80} className="text-white/30 group-hover:text-white group-hover:scale-110 drop-shadow-2xl transition-all duration-500" />
             </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const VisaStatusChecker = () => {
  const [refNumber, setRefNumber] = useState('');
  const [statusData, setStatusData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refNumber.trim()) return;

    setIsLoading(true);
    setError(null);
    setStatusData(null);

    try {
      const docRef = doc(db, "visaApplications", refNumber.trim());
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setStatusData(data);
      } else {
        setError("No se encontró ninguna solicitud con ese número de referencia. Por favor verifica e intenta de nuevo.");
      }
    } catch (err) {
      console.error("Error checking status:", err);
      setError("Ocurrió un error al consultar el sistema. Por favor intenta más tarde.");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved': return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
      case 'Denied': return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
      case 'Processing': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
      case 'Awaiting Documents': return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800';
      default: return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'Approved': return 'Aprobada';
      case 'Denied': return 'Denegada';
      case 'Processing': return 'En Proceso';
      case 'Awaiting Documents': return 'Pendiente de Documentos';
      default: return status;
    }
  };

  return (
    <section id="consulta" className="py-24 bg-slate-50 dark:bg-slate-950">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800">
          <div className="p-10 md:p-14 bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900 text-white">
            <div className="flex items-center gap-6 mb-10">
              <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/20">
                <Globe size={36} />
              </div>
              <div>
                <h3 className="text-3xl md:text-4xl font-black tracking-tight uppercase tracking-tighter">Consulta tu Solicitud</h3>
                <p className="text-slate-400 font-bold uppercase text-xs tracking-widest mt-1">Ingresa tu número de referencia.</p>
              </div>
            </div>

            <form onSubmit={handleCheckStatus} className="flex flex-col sm:flex-row gap-5">
              <input 
                type="text" 
                value={refNumber}
                onChange={(e) => setRefNumber(e.target.value)}
                placeholder="Ej: VE-2026-XXXX"
                className="flex-1 bg-white/10 border border-white/20 rounded-2xl px-8 py-5 outline-none focus:ring-4 focus:ring-blue-500/30 transition-all font-black placeholder:text-slate-500 text-white text-lg"
                required
              />
              <button 
                type="submit"
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-12 py-5 rounded-2xl font-black transition-all active:scale-95 flex items-center justify-center gap-3 whitespace-nowrap shadow-2xl shadow-blue-500/30 text-lg uppercase tracking-widest"
              >
                {isLoading ? (
                  <span className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>CONSULTAR <ArrowRight size={24} /></>
                )}
              </button>
            </form>
          </div>

          <AnimatePresence mode="wait">
            {statusData && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="p-10 md:p-14 border-t border-slate-100 dark:border-slate-800"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
                  <div className="space-y-8">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">Candidato Oficial</p>
                      <h4 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{statusData.applicantName}</h4>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3">Estado del Proceso</p>
                      <span className={`inline-flex items-center gap-3 px-6 py-3 rounded-2xl border text-base font-black tracking-wide ${getStatusColor(statusData.status)}`}>
                        <div className={`w-3 h-3 rounded-full animate-pulse ${statusData.status === 'Approved' ? 'bg-green-500' : 'bg-blue-500'}`} />
                        {getStatusLabel(statusData.status)}
                      </span>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">Última Actualización</p>
                      <p className="font-black text-slate-700 dark:text-slate-300 uppercase italic">{new Date(statusData.updatedAt).toLocaleString('es-GT')}</p>
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 space-y-6">
                    <h5 className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-sm flex items-center gap-3">
                       <Award size={24} className="text-blue-600" /> Próximos Pasos
                    </h5>
                    <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                      {statusData.status === 'Approved' 
                        ? '¡Felicidades! Tu visa ha sido aprobada. Nuestro equipo se pondrá en contacto contigo para la entrega de documentos.' 
                        : statusData.status === 'Processing'
                        ? 'Tu solicitud está siendo analizada minuciosamente por nuestro equipo experto para asegurar el éxito.'
                        : statusData.status === 'Awaiting Documents'
                        ? 'Necesitamos que nos envíes los documentos faltantes a la brevedad posible para continuar.'
                        : 'Lamentamos el inconveniente. Te invitamos a agendar una cita con un asesor para analizar los motivos y re-aplicar.'
                      }
                    </p>
                    <button 
                      onClick={() => openWhatsApp(`Hola, mi referencia es ${refNumber}. Consulté mi estado y es: ${statusData.status}. ¿Qué debo hacer ahora?`)}
                      className="w-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 py-4 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-3"
                    >
                      Hablar con un asesor <MessageCircle size={20} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {!statusData && (
              <div className="p-10 md:p-14 border-t border-slate-100 dark:border-slate-800">
                <PushNotificationManager />
              </div>
            )}

            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="p-14 text-center"
              >
                <div className="inline-flex flex-col items-center gap-6 text-slate-500">
                  <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full flex items-center justify-center">
                    <X size={32} />
                  </div>
                  <p className="font-black text-lg max-w-sm tracking-tight">{error}</p>
                  <button 
                     onClick={() => openWhatsApp("Hola, perdí mi número de referencia de mi solicitud de visa. ¿Me pueden ayudar?")}
                     className="text-blue-600 dark:text-blue-400 font-black uppercase tracking-widest text-sm hover:underline"
                  >
                    ¿Olvidaste tu número? Contáctanos
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
};

export default function App() {
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll behavior for navbar links
    const handleScroll = () => {
      const nav = document.querySelector('nav');
      if (window.scrollY > 20) {
        nav?.classList.add('shadow-lg', 'bg-white/95', 'dark:bg-slate-900/95');
      } else {
        nav?.classList.remove('shadow-lg', 'bg-white/95', 'dark:bg-slate-900/95');
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved as 'light' | 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 font-sans text-slate-900 dark:text-white selection:bg-blue-100 selection:text-blue-900 transition-colors duration-300">
      <Navbar theme={theme} toggleTheme={toggleTheme} />
      <main>
        <Hero />
        <CoreIdentity />
        <Services />
        <Process />
        <OfficeTour />
        <LocationSection />
        <MythsSection />
        <VisaStatusChecker />
        <VideoGallery />
        <Testimonials />
        <Downloads />
        <FormSection ref={formRef} />
      </main>
      
      <footer className="py-20 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-12 mb-16">
            <div className="col-span-1 lg:col-span-2 space-y-6">
              <Logo />
              <p className="text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed font-bold">
                Centro de Oportunidades Laborales: Intermediación laboral privada estratégica con enfoque en la movilidad legal y la transparencia hacia USA & Canadá.
              </p>
              <div className="flex flex-wrap gap-4 items-center">
                <a href="#" className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all shadow-sm"><X size={20} /></a>
                <a href="#" className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all shadow-sm"><MessageCircle size={20} /></a>
              </div>
            </div>
            <div>
              <h5 className="font-black text-slate-900 dark:text-white mb-6 uppercase tracking-[0.2em] text-xs">Empresa</h5>
              <ul className="space-y-4 text-slate-500 dark:text-slate-400 text-sm font-bold">
                <li><a href="#servicios" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors uppercase tracking-widest text-[10px]">Servicios</a></li>
                <li><a href="#proceso" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors uppercase tracking-widest text-[10px]">Nuestro Proceso</a></li>
                <li><a href="#testimonios" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors uppercase tracking-widest text-[10px]">Testimonios</a></li>
              </ul>
            </div>
            <div>
              <h5 className="font-black text-slate-900 dark:text-white mb-6 uppercase tracking-[0.2em] text-xs">Legal</h5>
              <ul className="space-y-4 text-slate-500 dark:text-slate-400 text-sm font-bold">
                <li><a href="#" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors uppercase tracking-widest text-[10px]">Privacidad</a></li>
                <li><a href="#" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors uppercase tracking-widest text-[10px]">Términos</a></li>
                <li><button onClick={() => alert("Aviso: VisaExpert no garantiza la aprobación de visas, esa decisión es exclusiva del cónsul.")} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors uppercase tracking-widest text-[10px] text-left">Descargo</button></li>
              </ul>
            </div>
          </div>
          
          <div className="pt-8 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-slate-400 dark:text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">© 2026 Centro de Oportunidades Laborales · Intermediación Internacional Privada.</p>
            <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-[10px] font-black uppercase tracking-widest text-center md:text-right">
               Comprometidos con el empleo formal y la <span className="text-indigo-600 dark:text-indigo-400">Migración Responsable</span>
            </div>
          </div>
        </div>
      </footer>

      <BotAlice />
      <VoiceAssistant />

    </div>
  );
}
