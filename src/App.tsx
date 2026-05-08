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
  Mic,
  Volume2,
  VolumeX,
  Loader2,
  ShieldCheck,
  Zap,
  Share2,
  Facebook,
  Link,
  Music,
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ALICE_KNOWLEDGE } from './knowledge.ts';
import Markdown from 'react-markdown';

// Assets are no longer needed as we're removing image/video sections

import { jsPDF } from 'jspdf';
import { GoogleGenAI } from "@google/genai";
import { 
  collection, addDoc, getDoc, setDoc, doc, updateDoc, 
  onSnapshot, query, where, orderBy, limit, serverTimestamp, getDocFromServer
} from 'firebase/firestore';
import { 
  onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User 
} from 'firebase/auth';
import { db, auth } from './lib/firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const currentUser = auth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid || null,
      email: currentUser?.email || null,
      emailVerified: currentUser?.emailVerified || null,
    },
    operationType,
    path
  };
  console.error('Firestore Error Details:', JSON.stringify(errInfo, null, 2));
  throw new Error(JSON.stringify(errInfo));
}

// --- Firebase Initialization is handled in ./lib/firebase ---

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection successful");
  } catch (error) {
    if (error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('failed-precondition'))) {
      console.error("Please check your Firebase configuration or network.");
    } else {
      console.error("Firestore connection error:", error);
    }
  }
}
testConnection();

// --- Tracking Constants ---
const TRACKING_STEPS = [
  "Solicitud de Servicios",
  "Recepción de Documentos",
  "Análisis de Perfil",
  "Llenado de Formularios",
  "Programación de Cita",
  "Certificación de la Visa",
  "Cita de Entrega de Visa"
];

// --- WhatsApp & Automation Helpers ---
const openWhatsApp = (msg: string) => {
  const phone = "50259686584"; // Guatemala prefix
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
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

  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || "" });

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
    // Remove markdown symbols and format currency for better narration
    const cleanText = text
      .replace(/[*#_`]/g, '')
      .replace(/Q\s?([\d,.]+)/g, '$1 quetzales')
      .replace(/(\d{2})(\d{2})[- ]?(\d{2})(\d{2})/g, '$1 $2 $3 $4');

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: `Actúa como una asistente experta real. Narra este texto con una voz de mujer natural, fluida y cálida. Usa variaciones de tono expresivas, haz pausas naturales para que suene natural, y mantén un tono empático y profesional. No suenes mecánica. Texto: ${cleanText}` }] }],
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
      const utterance = new SpeechSynthesisUtterance(cleanText);
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
          systemInstruction: `Eres un Agente de Llamada de "Centro de Oportunidades Laborales" en Guatemala. 
          Responde de forma MUY BREVE (máximo 1 o 2 frases), profesional y amable. 
          Al final de cada respuesta, si es pertinente, sugiere contactarnos por WhatsApp al 59 68 65 84 para agendar una cita.
          INFORMACIÓN CRÍTICA: 
          - Nuestra asesoría profesional tiene un costo de PAGO ÚNICO de Q1,500 por persona. 
          - Estamos ubicados frente a la Embajada de EE. UU. en zona 16.
          - Si preguntan por WhatsApp, diles que es el 59 68 65 84.
          Tu respuesta será leída por un motor de voz.`,
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

const BrandLogo = ({ size = 48 }: { size?: number }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 100 100" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className="drop-shadow-sm"
  >
    <defs>
      <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F59E0B" />
        <stop offset="50%" stopColor="#FEF3C7" />
        <stop offset="100%" stopColor="#D97706" />
      </linearGradient>
      <radialGradient id="blueDepth" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
        <stop offset="0%" stopColor="#2563EB" />
        <stop offset="100%" stopColor="#1E3A8A" />
      </radialGradient>
    </defs>
    
    {/* Background Circle with Depth */}
    <circle cx="50" cy="50" r="48" fill="url(#blueDepth)" />
    <circle cx="50" cy="50" r="46" stroke="url(#goldGradient)" strokeWidth="2.5" />
    
    {/* Stylized Globe */}
    <g opacity="0.2">
      <circle cx="50" cy="50" r="35" stroke="white" strokeWidth="0.5" />
      <ellipse cx="50" cy="50" rx="12" ry="35" stroke="white" strokeWidth="0.5" />
      <line x1="15" y1="50" x2="85" y2="50" stroke="white" strokeWidth="0.5" />
      <path d="M20 30 Q50 20 80 30" fill="none" stroke="white" strokeWidth="0.5" />
      <path d="M20 70 Q50 80 80 70" fill="none" stroke="white" strokeWidth="0.5" />
    </g>
    
    {/* Human Silhouette Reaching High */}
    <path 
      d="M50 78 C50 78 44 75 44 65 C44 55 50 50 50 50 C50 50 56 55 56 65 C56 75 50 78 50 78 Z" 
      fill="white" 
      opacity="0.9"
    />
    <circle cx="50" cy="42" r="5" fill="white" />
    <path 
      d="M50 52 L68 32M50 52 L32 32" 
      stroke="white" 
      strokeWidth="4" 
      strokeLinecap="round" 
    />
    
    {/* The Star - Aspiration */}
    <path 
      d="M50 18 L53 25 L60 25 L55 30 L57 37 L50 33 L43 37 L45 30 L40 25 L47 25 Z" 
      fill="url(#goldGradient)" 
      className="animate-pulse"
    />
    
    {/* Accent Glow */}
    <circle cx="50" cy="28" r="8" fill="#FDE68A" opacity="0.1" />
  </svg>
);

const Logo = () => (
  <div className="flex items-center gap-4 group cursor-pointer">
    <div className="w-14 h-14 bg-white dark:bg-slate-900 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/10 border border-slate-100 dark:border-slate-800 transition-transform group-hover:scale-105 duration-300">
      <BrandLogo size={48} />
    </div>
    <div className="flex flex-col">
      <span className="text-xl font-extrabold text-slate-900 dark:text-white leading-tight tracking-tight">C.O.L.</span>
      <span className="text-blue-600 font-bold text-[10px] tracking-widest uppercase opacity-80">Oportunidades Laborales</span>
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

const SocialShare = () => {
  const [isOpen, setIsOpen] = useState(false);
  const shareUrl = window.location.href;
  const shareTitle = 'Centro de Oportunidades Laborales';
  const shareText = 'Intermediación Laboral USA & Canadá · Procesos Transparentes · Oportunidades Verificadas.';

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    alert("Enlace copiado al portapapeles");
    setIsOpen(false);
  };

  const shareLinks = [
    {
      name: 'WhatsApp',
      icon: <MessageCircle size={20} />,
      color: 'bg-green-500',
      action: () => window.open(`https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`, '_blank'),
    },
    {
      name: 'Facebook',
      icon: <Facebook size={20} />,
      color: 'bg-blue-600',
      action: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank'),
    },
    {
      name: 'TikTok',
      icon: <Music size={20} />,
      color: 'bg-black',
      action: () => {
        // Fallback for tiktok since it's hard to direct-share generic web URLs to app feed
        handleCopy();
      },
    },
    {
      name: 'Copiar URL',
      icon: <Link size={20} />,
      color: 'bg-slate-600',
      action: handleCopy,
    },
  ];

  return (
    <div className="relative group/share">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`p-6 rounded-[2rem] transition-all border flex items-center justify-center ${
          isOpen 
          ? 'bg-blue-600 text-white border-blue-600 scale-95 shadow-inner' 
          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-transparent hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 hover:border-blue-200'
        }`}
        title="Compartir"
      >
        <Share2 size={24} className={isOpen ? 'rotate-12' : ''} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] p-4 flex gap-3 z-[100] backdrop-blur-xl"
          >
            {shareLinks.map((link) => (
              <div key={link.name} className="flex flex-col items-center gap-2">
                <button
                  onClick={link.action}
                  className={`w-12 h-12 ${link.color} text-white rounded-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg overflow-hidden relative`}
                  title={link.name}
                >
                  {link.icon}
                </button>
                <span className="text-[9px] font-black uppercase tracking-tighter text-slate-400 dark:text-slate-500">{link.name}</span>
              </div>
            ))}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white dark:bg-slate-900 border-r border-b border-slate-200 dark:border-slate-800 rotate-45" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Hero = () => (
  <section className="pt-48 pb-32 px-4 relative overflow-hidden">
    {/* High Impact Background Design */}
    <div className="absolute inset-0 bg-slate-50 dark:bg-slate-950" />
    <div className="absolute top-0 right-0 w-[1000px] h-[1000px] bg-gradient-to-br from-blue-600/10 to-indigo-600/5 rounded-full blur-[120px] -mr-[300px] -mt-[300px] dark:opacity-20" />
    <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-[100px] -ml-[200px] -mb-[200px] dark:opacity-20" />
    
    <div className="max-w-7xl mx-auto flex flex-col items-center text-center relative z-10 w-full">
        <div className="space-y-10">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex justify-center flex-wrap gap-3"
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
            <h1 className="text-5xl md:text-8xl lg:text-9xl font-black text-slate-900 dark:text-white leading-[0.85] tracking-tighter">
              CENTRO DE <br />
              <span className="text-blue-600 relative">
                OPORTUNIDADES.
                <span className="absolute -bottom-2 left-0 w-full h-2 md:h-3 bg-blue-100 dark:bg-blue-900/30 -z-10" />
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-slate-500 dark:text-slate-400 font-bold max-w-2xl mx-auto leading-tight md:leading-snug">
              Intermediación Laboral USA & Canadá · Procesos Transparentes · Oportunidades Verificadas.
            </p>
          </motion.div>
  
          <div className="flex flex-col items-center gap-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="p-8 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl rounded-[2.5rem] border border-white dark:border-slate-800 w-full max-w-xl shadow-2xl shadow-blue-900/5 space-y-4"
            >
               <div className="flex items-start gap-4 text-left">
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
              <SocialShare />
            </motion.div>
          </div>
        </div>
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
  const [status, setStatus] = useState<'ai' | 'waiting_advisor' | 'active_advisor' | 'closed'>('ai');
  const [isSpeakingEnabled, setIsSpeakingEnabled] = useState(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [sessionId, setSessionId] = useState<string>(() => {
    let id = localStorage.getItem('alice_session_id');
    if (!id) {
      id = 'chat_' + Math.random().toString(36).substring(2, 11);
      localStorage.setItem('alice_session_id', id);
    }
    return id;
  });

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

  // Sync with Firestore for remote agent responses
  useEffect(() => {
    if (!sessionId) return;

    const q = query(
      collection(db, 'chat_sessions', sessionId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          // If it's from an agent, add it to our local state if it's not already there
          if (data.role === 'agent') {
            setMessages(prev => {
              // Simple deduplication by content in this turn for simplicity
              const alreadyExists = prev.some(m => m.content === data.content && m.role === 'bot');
              if (!alreadyExists) {
                return [...prev, { role: 'bot', content: data.content }];
              }
              return prev;
            });
            setStatus('active_advisor');
          }
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `chat_sessions/${sessionId}/messages`);
    });

    // Sync session status
    const sessionUnsub = onSnapshot(doc(db, 'chat_sessions', sessionId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.status) setStatus(data.status as any);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `chat_sessions/${sessionId}`);
    });

    return () => {
      unsubscribe();
      sessionUnsub();
      if (currentAudioSourceRef.current) {
        currentAudioSourceRef.current.stop();
      }
    };
  }, [sessionId]);

  const speak = async (text: string) => {
    if (!isSpeakingEnabled) return;

    // Remove markdown symbols from text for better narration
    const cleanText = text
      .replace(/[*#_`]/g, '')
      .replace(/Q\s?([\d,.]+)/g, '$1 quetzales')
      .replace(/(\d{2})(\d{2})[- ]?(\d{2})(\d{2})/g, '$1 $2 $3 $4');

    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || "" });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: `Actúa como una asistente experta real llamada Alice. Narra este texto con una voz de mujer natural, fluida y cálida. Usa variaciones de tono expresivas según el contenido, haz pausas naturales donde corresponda y suena muy empática. Evita sonar como un robot. Texto: ${cleanText}` }] }],
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
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }

        // Stop current audio if playing
        if (currentAudioSourceRef.current) {
          currentAudioSourceRef.current.stop();
        }

        const buffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        currentAudioSourceRef.current = source;
        source.start();
      }
    } catch (e) {
      console.warn("Gemini TTS Error:", e);
      // Fallback to browser synthesis
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'es-GT';
      window.speechSynthesis.speak(utterance);
    }
  };

  const saveMessageToFirestore = async (role: 'user' | 'ai' | 'agent', content: string) => {
    try {
      // Ensure session exists
      const sessionRef = doc(db, 'chat_sessions', sessionId);
      const sessionSnap = await getDoc(sessionRef).catch(e => handleFirestoreError(e, OperationType.GET, `chat_sessions/${sessionId}`));
      
      if (!sessionSnap.exists()) {
        await setDoc(sessionRef, {
          status: 'ai',
          createdAt: serverTimestamp(),
          lastMessageAt: serverTimestamp()
        }).catch(e => handleFirestoreError(e, OperationType.CREATE, `chat_sessions/${sessionId}`));
      } else {
        await updateDoc(sessionRef, {
          lastMessageAt: serverTimestamp()
        }).catch(e => handleFirestoreError(e, OperationType.UPDATE, `chat_sessions/${sessionId}`));
      }

      await addDoc(collection(db, 'chat_sessions', sessionId, 'messages'), {
        role,
        content,
        createdAt: serverTimestamp()
      }).catch(e => handleFirestoreError(e, OperationType.CREATE, `chat_sessions/${sessionId}/messages`));
    } catch (e) {
      console.error("Error saving message to Firestore:", e);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    
    const userMsg = input;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    
    // Always save user message to Firestore for agent context
    saveMessageToFirestore('user', userMsg);

    if (status !== 'ai') {
      // If we're waiting for an advisor or talking to one, don't trigger Alice
      return;
    }

    setIsTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || "" });
      const prompt = `
        Eres Alice, la asistente virtual experta y oficial de "Centro de Oportunidades Laborales" (C.O.L.) en Guatemala. 
        Tu personalidad: Profesional, amable, empática y sumamente eficiente.
        Tu objetivo: Guiar a los usuarios en sus trámites de visa para USA y Canadá, filtrando interesados reales.
        
        REGLAS DE RESPUESTA:
        1. Sé MUY BREVE (máximo 1-2 párrafos cortos). No abrumes con texto.
        2. Proporciona la información técnica exacta basada en tu conocimiento: ${JSON.stringify(ALICE_KNOWLEDGE)}
        3. Siempre sugiere contactar por WhatsApp al ${ALICE_KNOWLEDGE.whatsapp} si la duda requiere una cita personalizada.
        4. Costos: Pago único de Q1,500 por asesoría técnica (aranceles consulares aparte).
        5. Ubicación: Blvd. Austriaco, Zona 16, frente a la Embajada de EE. UU.
        6. Si el usuario desea hablar con una persona real, instrúyele a usar el botón "Hablar con un Asesor" en la parte superior del chat.
        7. No inventes beneficios migratorios; sé realista y honesta.
        
        Contexto de la conversación actual:
        ${messages.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')}
        
        Pregunta del usuario: ${userMsg}
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      const responseText = response.text || "Lo siento, tuve un pequeño problema al procesar tu solicitud. ¿Me lo puedes repetir?";
      setMessages(prev => [...prev, { role: 'bot', content: responseText }]);
      saveMessageToFirestore('ai', responseText);
      if (isSpeakingEnabled) {
        speak(responseText);
      }
    } catch (error) {
      console.error("Gemini Error:", error);
      const fallback = "Lo siento, mi conexión con la central de inteligencia está fallando. Por favor escribe a nuestro WhatsApp oficial: " + ALICE_KNOWLEDGE.whatsapp;
      setMessages(prev => [...prev, { role: 'bot', content: fallback }]);
    } finally {
      setIsTyping(false);
    }
  };

  const requestAdvisor = async () => {
    setStatus('waiting_advisor');
    try {
      const sessionRef = doc(db, 'chat_sessions', sessionId);
      await updateDoc(sessionRef, {
        status: 'waiting_advisor',
        lastMessageAt: serverTimestamp(),
        requestType: 'advisor_intervention'
      }).catch(e => handleFirestoreError(e, OperationType.UPDATE, `chat_sessions/${sessionId}`));

      // Explicit notification for agents
      await addDoc(collection(db, 'advisor_support_requests'), {
        sessionId,
        status: 'pending',
        requestedAt: serverTimestamp(),
        lastMessages: messages.slice(-3) // Context for the agent
      }).catch(e => handleFirestoreError(e, OperationType.CREATE, "advisor_support_requests"));

      setMessages(prev => [...prev, { role: 'bot', content: '⏳ ¡Entendido! He notificado a mis compañeros asesores. Un asesor real se unirá a este chat en un momento. Por favor, mantén esta ventana abierta.' }]);
    } catch (e) {
      console.error("Failed to request advisor:", e);
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
                <div className="w-12 h-12 rounded-2xl border-2 border-white/20 overflow-hidden bg-white/10 flex items-center justify-center">
                   <UserCheck size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-lg leading-tight">{status === 'ai' ? 'Alice AI' : 'Soporte de Asesor'}</h4>
                  <div className="flex items-center gap-1.5 opacity-80">
                    <span className={`w-2 h-2 rounded-full animate-pulse ${status === 'waiting_advisor' ? 'bg-amber-400' : 'bg-green-400'}`} />
                    <p className="text-xs font-medium">
                      {status === 'ai' ? 'Asesora en Línea' : status === 'waiting_advisor' ? 'Esperando Asesor...' : 'Asesor Conectado'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {status === 'ai' && (
                  <button 
                    onClick={requestAdvisor}
                    className="text-[10px] bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg font-black uppercase tracking-widest transition-all"
                  >
                    Hablar con un Asesor
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} className="bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-colors"><X size={24}/></button>
              </div>
            </div>
            {/* Audio Toggle Sub-header */}
            <div className="px-6 py-2 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
               <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Audio Narración</span>
               <button 
                onClick={() => {
                  setIsSpeakingEnabled(!isSpeakingEnabled);
                  if (currentAudioSourceRef.current) currentAudioSourceRef.current.stop();
                }}
                className={`p-1.5 rounded-lg transition-all flex items-center gap-2 ${isSpeakingEnabled ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}
               >
                 {isSpeakingEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                 <span className="text-[9px] font-black uppercase tracking-tighter">{isSpeakingEnabled ? 'Activado' : 'Desactivado'}</span>
               </button>
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
                    placeholder={status === 'ai' ? "Pregúntame sobre visas..." : "Escribe al asesor..."}
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
              "Gracias a **Centro de Oportunidades**, mi sueño de trabajar en Canadá se hizo realidad. El proceso fue claro, honesto y eficiente desde la primera cita."
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
    educacion: 'Sin estudios',
    experiencia: 'Sin experiencia previa',
    telefono: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successCode, setSuccessCode] = useState<string | null>(null);

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
      // 1. Generate Tracking ID
      const randomId = Math.floor(1000 + Math.random() * 9000);
      const trackingCode = `COL-${randomId}`;

      // 2. Save to Database (Prospect)
      await addDoc(collection(db, "prospects"), {
        ...formData,
        trackingCode,
        createdAt: serverTimestamp()
      }).catch(e => handleFirestoreError(e, OperationType.CREATE, "prospects"));

      // 3. Initialize Tracking Entry
      await setDoc(doc(db, "tracking", trackingCode), {
        trackingId: trackingCode,
        applicantName: formData.nombre,
        currentStep: 1,
        steps: TRACKING_STEPS.map((label, idx) => ({
          label,
          status: idx === 0 ? 'active' : 'pending',
          updatedAt: new Date().toISOString()
        })),
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp()
      }).catch(e => handleFirestoreError(e, OperationType.CREATE, `tracking/${trackingCode}`));

      // 4. Show Success
      setSuccessCode(trackingCode);

      // 5. Open WhatsApp
      const msg = `HOLA CENTRO DE OPORTUNIDADES, ME INTERESA UNA ASESORÍA\n\n` +
                  `👤 Nombre: ${formData.nombre}\n` +
                  `📍 Localidad: ${formData.localidad}\n` +
                  `💼 Interés: ${formData.tipoTrabajo}\n` +
                  `📞 Teléfono: ${formData.telefono}\n` +
                  `🎟 Mi código es: ${trackingCode}\n\n` +
                  `Deseo agendar mi cita de Q1,500 para iniciar mi proceso.`;
      
      openWhatsApp(msg);
      
      // Reset form or show success if needed
      setFormData({
        nombre: '',
        localidad: '',
        tipoTrabajo: '',
        educacion: 'Sin estudios',
        experiencia: 'Sin experiencia previa',
        telefono: ''
      });
    } catch (error) {
      console.error("Error saving prospect:", error);
      alert("Hubo un error al guardar tu información. Sin embargo, puedes contactarnos directamente por WhatsApp.");
      
      // Fallback to WhatsApp even if DB fails
      const msg = `HOLA CENTRO DE OPORTUNIDADES, ME INTERESA UNA ASESORÍA\n\n` +
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
            <AnimatePresence>
              {successCode && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-8 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-[2rem] text-center space-y-4 mb-8"
                >
                  <div className="w-12 h-12 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 size={24} />
                  </div>
                  <h4 className="text-green-800 dark:text-green-400 font-black uppercase tracking-tight">¡Solicitud Enviada!</h4>
                  <p className="text-green-700 dark:text-green-500 text-xs font-bold leading-relaxed">
                    Usa este código para seguir tu trámite en nuestra web:
                  </p>
                  <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-green-100 dark:border-green-800/50 font-black text-2xl tracking-widest text-slate-900 dark:text-white">
                    {successCode}
                  </div>
                  <button 
                    onClick={() => setSuccessCode(null)}
                    className="text-green-600 font-black uppercase tracking-widest text-[9px] hover:underline"
                  >
                    Enviar otra consulta
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
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
                  <option value="Sin estudios">SIN ESTUDIOS</option>
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
    
    // Add Logo (SVG-style fallback for PDF)
    doc.setFillColor(59, 130, 246);
    doc.circle(28, 22, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("VE", 28, 24, { align: "center" });
    doc.setFontSize(22);
    doc.text("C.O.L.", 45, 22);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Guatemala", 45, 29);
    
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
    doc.text("Documento oficial para clientes de Centro de Oportunidades Laborales. Blvd. Austriaco, Zona 16.", 20, 78);

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
    doc.text("CENTRO DE OPORTUNIDADES", sealX + 20, sealY + 22, { align: "center" });
    doc.setFontSize(7);
    doc.text("GUATEMALA", sealX + 20, sealY + 28, { align: "center" });

    // --- Footer ---
    doc.setFillColor(30, 41, 59);
    doc.rect(0, pageHeight - 20, pageWidth, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Ubicación: Blvd. Austriaco frente a Embajada EE.UU, Z.16", 20, pageHeight - 9);
    doc.text("WhatsApp: +502 5968 6584 | www.oportunidades.com.gt", pageWidth - 20, pageHeight - 9, { align: "right" });

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
    "**ASISTENCIA C.O.L.**",
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
            onClick={() => generatePDF("Requisitos_Legales_COL", requisitosItems, "Listado de Requisitos Legales")}
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

const ConsultationTracker = () => {
  const [trackingId, setTrackingId] = useState('');
  const [trackingData, setTrackingData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isAdminMode, setIsAdminMode] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const ADMIN_EMAILS = ['amilcaralvarado330@gmail.com', 'admin@visaexpert.com'];

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      const isUserAdmin = u ? ADMIN_EMAILS.includes(u.email || '') : false;
      setIsAdmin(isUserAdmin);

      if (u && isUserAdmin) {
        try {
          const adminDocRef = doc(db, "admins", u.uid);
          const adminSnap = await getDoc(adminDocRef);
          if (!adminSnap.exists()) {
            await setDoc(adminDocRef, {
              email: u.email,
              role: 'admin',
              createdAt: serverTimestamp()
            });
            console.log("Admin bootstrapped successfully");
          }
        } catch (err) {
          console.error("Error bootstrapping admin:", err);
        }
      }
    });
    return () => unsub();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login Error:", err);
    }
  };

  const handleUpdateStep = async (newStep: number) => {
    if (!trackingData || !trackingId) return;
    const cleanId = trackingId.trim().toUpperCase();
    
    try {
      const docRef = doc(db, "tracking", cleanId);
      await updateDoc(docRef, {
        currentStep: newStep,
        lastUpdated: serverTimestamp(),
        "steps": trackingData.steps.map((s: any, idx: number) => ({
          ...s,
          status: (idx + 1) === newStep ? 'active' : (idx + 1) < newStep ? 'completed' : 'pending',
          updatedAt: (idx + 1) === newStep ? new Date().toISOString() : s.updatedAt
        }))
      }).catch(e => handleFirestoreError(e, OperationType.UPDATE, `tracking/${cleanId}`));
      
      // Refresh local state
      setTrackingData((prev: any) => ({
        ...prev,
        currentStep: newStep,
        steps: prev.steps.map((s: any, idx: number) => ({
          ...s,
          status: (idx + 1) === newStep ? 'active' : (idx + 1) < newStep ? 'completed' : 'pending'
        }))
      }));
    } catch (err) {
      console.error("Update Error:", err);
      alert("Error al actualizar el estado.");
    }
  };

  const handleCheckStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingId.trim()) return;

    setIsLoading(true);
    setError(null);
    setTrackingData(null);

    const cleanId = trackingId.trim().toUpperCase();

    try {
      const docRef = doc(db, "tracking", cleanId);
      const docSnap = await getDoc(docRef).catch(e => handleFirestoreError(e, OperationType.GET, `tracking/${cleanId}`));

      if (docSnap && docSnap.exists()) {
        setTrackingData(docSnap.data());
      } else {
        // Fallback or legacy check
        const legacyRef = doc(db, "visaApplications", cleanId);
        const legacySnap = await getDoc(legacyRef).catch(e => handleFirestoreError(e, OperationType.GET, `visaApplications/${cleanId}`));
        
        if (legacySnap && legacySnap.exists()) {
          const ld = legacySnap.data();
          // Map legacy to new format
          setTrackingData({
            applicantName: ld.applicantName,
            currentStep: ld.status === 'Approved' ? 6 : ld.status === 'Awaiting Documents' ? 2 : 3,
            steps: TRACKING_STEPS.map((label, idx) => ({
              label,
              status: idx < 3 ? 'completed' : 'pending'
            })),
            lastUpdated: ld.updatedAt
          });
        } else {
          setError("No se encontró ningún trámite con ese código. Por favor verifica e intenta de nuevo.");
        }
      }
    } catch (err) {
      console.error("Error checking tracking:", err);
      setError("Error al consultar el sistema. Intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section id="consulta" className="py-24 bg-slate-50 dark:bg-slate-950 scroll-mt-24">
      <div className="max-w-5xl mx-auto px-4">
        <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800">
          <div className="p-10 md:p-14 bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900 text-white text-center">
            <div className="inline-flex w-16 h-16 bg-blue-600 rounded-3xl items-center justify-center shadow-2xl shadow-blue-500/20 mb-8 mx-auto">
              <Globe size={36} />
            </div>
            <h3 className="text-3xl md:text-5xl font-black tracking-tighter uppercase mb-2">Seguimiento de Trámite</h3>
            <p className="text-slate-400 font-bold uppercase text-xs tracking-widest max-w-md mx-auto mb-10">
              Consulta el progreso de tu solicitud en tiempo real con tu código de seguimiento proporcionado.
            </p>

            <form onSubmit={handleCheckStatus} className="max-w-xl mx-auto flex flex-col sm:flex-row gap-4">
              <input 
                type="text" 
                value={trackingId}
                onChange={(e) => setTrackingId(e.target.value)}
                placeholder="Ej: COL-XXXX"
                className="flex-1 bg-white/10 border border-white/20 rounded-2xl px-8 py-5 outline-none focus:ring-4 focus:ring-blue-500/30 transition-all font-black placeholder:text-slate-500 text-white text-lg text-center sm:text-left"
                required
              />
              <button 
                type="submit"
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-10 py-5 rounded-2xl font-black transition-all active:scale-95 flex items-center justify-center gap-3 shadow-2xl shadow-blue-500/30 text-base uppercase tracking-widest"
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" size={24} />
                ) : (
                  <>RASTREAR <ArrowRight size={24} /></>
                )}
              </button>
            </form>
          </div>

          <AnimatePresence mode="wait">
            {trackingData && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="p-8 md:p-16 border-t border-slate-100 dark:border-slate-800"
              >
                <div className="flex flex-col md:flex-row justify-between items-start mb-16 gap-8 bg-slate-50 dark:bg-slate-800/50 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">Titular de la Solicitud</p>
                    <h4 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{trackingData.applicantName}</h4>
                    {isAdmin && (
                      <div className="mt-4 flex gap-2">
                        <button 
                          onClick={() => setIsAdminMode(!isAdminMode)}
                          className="px-4 py-2 bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center gap-2"
                        >
                          {isAdminMode ? <ArrowRight size={14} className="rotate-180" /> : <Settings size={14} />}
                          {isAdminMode ? 'Volver a Vista Cliente' : 'Gestionar Estado'}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">Última Actualización</p>
                    <p className="font-black text-slate-700 dark:text-slate-300 uppercase italic">
                      {trackingData.lastUpdated ? new Date(trackingData.lastUpdated?.seconds ? trackingData.lastUpdated.seconds * 1000 : trackingData.lastUpdated).toLocaleString('es-GT') : '--'}
                    </p>
                  </div>
                </div>

                <div className="relative">
                  {/* Progress Line */}
                  <div className="absolute left-[15px] md:left-1/2 top-0 bottom-0 w-[4px] bg-slate-100 dark:bg-slate-800 md:-translate-x-1/2 rounded-full" />
                  
                  <div className="space-y-12 md:space-y-24 relative">
                    {TRACKING_STEPS.map((label, index) => {
                      const stepNum = index + 1;
                      const isCompleted = stepNum < trackingData.currentStep;
                      const isActive = stepNum === trackingData.currentStep;
                      
                      return (
                        <div key={index} className={`flex flex-col md:flex-row items-center gap-8 ${index % 2 === 0 ? 'md:flex-row-reverse' : ''}`}>
                          <div className="flex-1 w-full md:text-right hidden md:block">
                            {index % 2 !== 0 && (
                               <div className="bg-slate-50 dark:bg-slate-800/30 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800/50">
                                 <h5 className={`font-black uppercase tracking-widest text-[11px] mb-2 ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>Paso {stepNum}</h5>
                                 <p className={`font-bold text-lg leading-tight ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>{label}</p>
                               </div>
                            )}
                          </div>

                          <div className="relative z-10 flex items-center justify-center self-start md:self-center ml-[3px] md:ml-0">
                            <div className={`w-8 h-8 rounded-full border-4 flex items-center justify-center transition-all duration-500 ${
                              isCompleted ? 'bg-green-500 border-green-200 text-white' : 
                              isActive ? 'bg-blue-600 border-blue-200 text-white animate-pulse shadow-lg shadow-blue-500/50' : 
                              'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-300'
                            }`}>
                              {isCompleted ? <CheckCircle2 size={16} /> : <span className="text-[10px] font-black">{stepNum}</span>}
                            </div>
                          </div>

                          <div className="flex-1 w-full text-left md:hidden lg:block">
                             {(index % 2 === 0 || window.innerWidth < 768) && (
                                <div className={`p-6 rounded-[2rem] border transition-all ${
                                  isActive 
                                  ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/50' 
                                  : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800/30'
                                } relative overflow-hidden group`}>
                                  <h5 className={`font-black uppercase tracking-widest text-[11px] mb-2 ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>Paso {stepNum}</h5>
                                  <p className={`font-bold text-lg leading-tight ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>{label}</p>
                                  
                                  {isAdminMode && (
                                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center bg-white/50 dark:bg-slate-800/50 -mx-6 -mb-6 p-6">
                                      <span className="text-[9px] font-black uppercase text-slate-500">Acción Admin</span>
                                      <button 
                                        onClick={() => handleUpdateStep(stepNum)}
                                        disabled={isActive}
                                        className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                                          isActive 
                                          ? 'bg-green-100 text-green-600' 
                                          : 'bg-blue-600 text-white hover:bg-blue-700'
                                        }`}
                                      >
                                        {isActive ? 'Paso Actual' : 'Mover Aquí'}
                                      </button>
                                    </div>
                                  )}

                                  {isActive && !isAdminMode && (
                                     <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mt-4">Actualización pendiente del asesor.</p>
                                  )}
                                </div>
                             )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-20 p-8 bg-blue-600 rounded-[2.5rem] text-white flex flex-col md:flex-row items-center justify-between gap-8 text-center md:text-left">
                   <div className="space-y-2">
                     <h5 className="text-2xl font-black uppercase tracking-tight">¿Alguna duda sobre este paso?</h5>
                     <p className="text-blue-100 font-medium">Habla directamente con el analista asignado a tu caso.</p>
                   </div>
                   <button 
                     onClick={() => openWhatsApp(`Hola, mi código de seguimiento es ${trackingId}. Estoy en el paso "${TRACKING_STEPS[trackingData.currentStep - 1]}". ¿Me pueden dar más información?`)}
                     className="bg-white text-blue-600 px-10 py-5 rounded-2xl font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
                   >
                     HABLAR CON ASESOR
                   </button>
                </div>
              </motion.div>
            )}

            {error && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-16 text-center"
              >
                <div className="inline-flex flex-col items-center gap-6">
                  <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-2xl flex items-center justify-center">
                    <X size={32} />
                  </div>
                  <p className="font-bold text-slate-500 max-w-sm leading-relaxed">{error}</p>
                  <button onClick={() => openWhatsApp("Hola, ¿me pueden ayudar con mi código de seguimiento?")} className="text-blue-600 font-black uppercase tracking-widest text-[10px] hover:underline">Solicitar Ayuda</button>
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
        <Services />
        <Process />
        <LocationSection />
        <MythsSection />
        <ConsultationTracker />
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
                <li><button onClick={() => alert("Aviso: Centro de Oportunidades no garantiza la aprobación de visas, esa decisión es exclusiva del cónsul.")} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors uppercase tracking-widest text-[10px] text-left">Descargo</button></li>
              </ul>
            </div>
          </div>
          
          <div className="pt-8 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-slate-400 dark:text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">© 2026 Centro de Oportunidades Laborales · Intermediación Internacional Privada.
              <button 
                onClick={async () => {
                  if (auth.currentUser) {
                    await signOut(auth);
                  } else {
                    const provider = new GoogleAuthProvider();
                    await signInWithPopup(auth, provider);
                  }
                }}
                className="ml-4 text-slate-300 dark:text-slate-700 hover:text-blue-600 transition-colors uppercase tracking-widest text-[9px]"
              >
                {auth.currentUser ? 'Salir' : 'Gestión'}
              </button>
            </p>
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
