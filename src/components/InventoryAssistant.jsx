import React, { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import {
  X,
  Send,
  Loader2,
  Sparkles,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

/**
 * InventoryAssistant — floating chat widget that talks to the askAI backend.
 *
 * Voice (Option A, browser-native):
 *   - SpeechRecognition: tap the mic, talk, it fills the input and auto-sends.
 *   - SpeechSynthesis: toggle the speaker icon to have the AI read replies aloud.
 *   - Both degrade gracefully — unsupported browsers just hide the buttons.
 */
export default function InventoryAssistant() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "Hi! I'm trained on your Roll Selection Guidelines SOP. I can:\n" +
        "• Search rolls and jobs, pull dashboard stats\n" +
        "• Suggest rolls to plan for a job (child-first, dye-lot consistent, per SOP)\n" +
        "• Assign rolls to jobs, release allocations, update statuses\n\n" +
        "Try: \"What rolls should I plan for 40ft of TurfX 15 on job 9001?\"\n\n" +
        "Tip: tap the mic to speak instead of typing.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakEnabled, setSpeakEnabled] = useState(false);

  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);
  const interimRef = useRef('');
  const autoSendRef = useRef(false);

  // ---- Capability detection (stable across renders) ----
  const speechSupported =
    typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  const synthSupported =
    typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // ---- Speech synthesis (AI -> voice) ----
  const speak = useCallback(
    (text) => {
      if (!synthSupported || !speakEnabled || !text) return;
      try {
        // Strip markdown bold/italic markers so TTS doesn't say "star star".
        const clean = text.replace(/\*\*/g, '').replace(/[*_`]/g, '');
        const utter = new SpeechSynthesisUtterance(clean);
        utter.rate = 1.05;
        utter.pitch = 1.0;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
      } catch {
        // ignore
      }
    },
    [synthSupported, speakEnabled],
  );

  // Stop any ongoing speech when the panel closes or speak toggles off.
  useEffect(() => {
    if (!synthSupported) return;
    if (!open || !speakEnabled) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    }
  }, [open, speakEnabled, synthSupported]);

  // ---- Core send function ----
  const sendText = useCallback(
    async (textArg) => {
      const text = (textArg ?? input).trim();
      if (!text || loading) return;

      const next = [...messages, { role: 'user', content: text }];
      setMessages(next);
      setInput('');
      setLoading(true);

      try {
        const payload = {
          messages: next.map(m => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : String(m.content),
          })),
        };
        const raw = await base44.functions.invoke('askAI', payload);
        const result = raw?.data ?? raw;

        if (result?.error) throw new Error(result.error);

        const replyText =
          typeof result?.reply === 'string' && result.reply.length > 0
            ? result.reply
            : `(no reply — raw response: ${JSON.stringify(raw).slice(0, 300)})`;

        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: replyText, actions: result?.actionsTaken },
        ]);

        // Read it aloud if voice output is on.
        speak(replyText);

        if (result.actionsTaken?.length) {
          queryClient.invalidateQueries({ queryKey: ['rolls'] });
          queryClient.invalidateQueries({ queryKey: ['allocations'] });
          queryClient.invalidateQueries({ queryKey: ['jobs'] });
        }
      } catch (e) {
        toast.error(e.message || 'Assistant failed');
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Error: ${e.message || 'Something went wrong.'}` },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, messages, loading, queryClient, speak],
  );

  // ---- Speech recognition (voice -> AI) ----
  const startListening = useCallback(() => {
    if (!speechSupported || listening || loading) return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    interimRef.current = '';
    autoSendRef.current = false;

    rec.onresult = (event) => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }
      // Show interim + final text live in the input box.
      const combined = (interimRef.current + finalText + interim).trim();
      setInput(combined);
      if (finalText) {
        interimRef.current += finalText + ' ';
        autoSendRef.current = true;
      }
    };

    rec.onerror = (e) => {
      setListening(false);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        toast.error('Microphone permission denied. Enable mic access in your browser settings.');
      } else if (e.error === 'no-speech') {
        // Silent no-op; common when users pause
      } else {
        toast.error(`Speech error: ${e.error || 'unknown'}`);
      }
    };

    rec.onend = () => {
      setListening(false);
      const finalInput = interimRef.current.trim();
      if (autoSendRef.current && finalInput) {
        sendText(finalInput);
      }
    };

    try {
      rec.start();
      recognitionRef.current = rec;
      setListening(true);
    } catch (e) {
      toast.error('Could not start the microphone.');
      setListening(false);
    }
  }, [speechSupported, listening, loading, sendText]);

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    setListening(false);
  }, []);

  const toggleMic = () => {
    if (listening) stopListening();
    else startListening();
  };

  // Stop recognition if the panel is closed.
  useEffect(() => {
    if (!open && listening) stopListening();
  }, [open, listening, stopListening]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendText();
    }
  };

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-gradient-to-br from-[#87c71a] to-[#6fa615] shadow-lg shadow-black/20 flex items-center justify-center hover:scale-105 transition-transform"
          aria-label="Open inventory assistant"
        >
          <Sparkles className="h-6 w-6 text-black" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-40 w-[380px] max-w-[calc(100vw-24px)] h-[560px] max-h-[calc(100vh-48px)] bg-white dark:bg-[#2d2d2d] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="h-12 px-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-700/50 bg-gradient-to-r from-[#87c71a]/10 to-transparent">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#87c71a]" />
              <span className="font-semibold text-slate-800 dark:text-white text-sm">
                Inventory Assistant
              </span>
            </div>
            <div className="flex items-center gap-1">
              {synthSupported && (
                <button
                  onClick={() => setSpeakEnabled(s => !s)}
                  className={[
                    'p-1.5 rounded transition-colors',
                    speakEnabled
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                      : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700',
                  ].join(' ')}
                  aria-label={speakEnabled ? 'Turn off voice replies' : 'Turn on voice replies'}
                  title={speakEnabled ? 'Voice replies ON' : 'Voice replies OFF'}
                >
                  {speakEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
              >
                <div
                  className={[
                    'rounded-2xl px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap',
                    m.role === 'user'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100',
                  ].join(' ')}
                >
                  {m.content}
                  {m.actions?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 text-xs text-slate-500 dark:text-slate-400">
                      {m.actions.map((a, j) => (
                        <div key={j}>✓ {a}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-sm flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Thinking…
                </div>
              </div>
            )}
            {listening && (
              <div className="flex justify-end">
                <div className="rounded-2xl px-3 py-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  Listening… tap mic again to stop
                </div>
              </div>
            )}
          </div>

          {/* Input row */}
          <div className="p-3 border-t border-slate-100 dark:border-slate-700/50 flex gap-2">
            {speechSupported && (
              <Button
                onClick={toggleMic}
                disabled={loading}
                variant={listening ? 'default' : 'outline'}
                className={
                  listening
                    ? 'bg-red-600 hover:bg-red-700 px-3'
                    : 'px-3'
                }
                aria-label={listening ? 'Stop listening' : 'Start voice input'}
                title={listening ? 'Stop listening' : 'Speak your request'}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            )}
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={listening ? 'Listening…' : 'Ask about inventory, assign rolls…'}
              disabled={loading}
              className="flex-1 text-sm"
            />
            <Button
              onClick={() => sendText()}
              disabled={loading || !input.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 px-3"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
