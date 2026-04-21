import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { MessageSquare, X, Send, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

/**
 * InventoryAssistant — floating chat widget that talks to the askAI backend
 * function. The backend holds the Anthropic API key and executes tool calls
 * against Base44 entities.
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
        "Try: \"What rolls should I plan for 40ft of TurfX 15 on job 9001?\"",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
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
      console.log('[InventoryAssistant] raw response from askAI:', raw);
      // Base44 SDK may return the body directly, or wrapped in { data, status }.
      const result = raw?.data ?? raw;
      console.log('[InventoryAssistant] unwrapped result:', result);

      if (result?.error) {
        throw new Error(result.error);
      }

      const replyText =
        typeof result?.reply === 'string' && result.reply.length > 0
          ? result.reply
          : `(no reply — raw response: ${JSON.stringify(raw).slice(0, 300)})`;

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: replyText, actions: result?.actionsTaken },
      ]);

      // If the AI performed any writes, invalidate the main caches so the
      // rest of the app reflects the change without a manual refresh.
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
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
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
          <div className="h-12 px-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-700/50 bg-gradient-to-r from-[#87c71a]/10 to-transparent">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#87c71a]" />
              <span className="font-semibold text-slate-800 dark:text-white text-sm">
                Inventory Assistant
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

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
          </div>

          <div className="p-3 border-t border-slate-100 dark:border-slate-700/50 flex gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about inventory, assign rolls…"
              disabled={loading}
              className="flex-1 text-sm"
            />
            <Button
              onClick={send}
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
