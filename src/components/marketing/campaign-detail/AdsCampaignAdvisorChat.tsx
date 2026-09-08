import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { invokeAdsCampaignAdvisor } from '@/lib/adsAdvisorApi';
import {
  getAdsAdvisorSuggestedPrompts,
  getUnusedAdsAdvisorPrompts,
} from '@/lib/adsAdvisorPrompts';
import type {
  AdsAdvisorMessage,
  AdsAdvisorSnapshot,
  AdsAdvisorToolCall,
} from '@/types/adsAdvisor';
import { AdvisorMarkdown } from './AdvisorMarkdown';

export type AdsCampaignAdvisorChatProps = {
  snapshot: AdsAdvisorSnapshot | null;
  disabled?: boolean;
  conversationKey: string;
};

type ChatTurn = AdsAdvisorMessage & {
  toolsUsed?: AdsAdvisorToolCall[];
};

function SuggestedPromptList({
  prompts,
  disabled,
  onSelect,
}: {
  prompts: string[];
  disabled: boolean;
  onSelect: (prompt: string) => void;
}) {
  if (prompts.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {prompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(prompt)}
          className="w-full whitespace-normal break-words rounded-md border border-teal-200 bg-teal-50/70 px-3 py-2 text-left text-[13px] leading-relaxed text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function AdsCampaignAdvisorChat({
  snapshot,
  disabled = false,
  conversationKey,
}: AdsCampaignAdvisorChatProps) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationKeyRef = useRef(conversationKey);
  const endRef = useRef<HTMLDivElement>(null);

  conversationKeyRef.current = conversationKey;
  const suggestedPrompts = useMemo(
    () => getAdsAdvisorSuggestedPrompts(snapshot),
    [snapshot],
  );
  const followUpPrompts = useMemo(
    () =>
      getUnusedAdsAdvisorPrompts(
        suggestedPrompts,
        messages.filter((message) => message.role === 'user').map((message) => message.content),
      ),
    [messages, suggestedPrompts],
  );

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setDraft('');
    setError(null);
    setLoading(false);
  }, [conversationKey]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, loading, error]);

  const inputLocked = disabled || !snapshot || loading;
  const canSend = !inputLocked && draft.trim().length > 0;

  async function send(text: string) {
    const content = text.trim();
    if (!content || !snapshot || disabled || loading) return;

    const keyAtStart = conversationKey;
    const userTurn: ChatTurn = { role: 'user', content };
    const history: AdsAdvisorMessage[] = [...messages, userTurn].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setMessages((prev) => [...prev, userTurn]);
    setDraft('');
    setError(null);
    setLoading(true);

    try {
      const response = await invokeAdsCampaignAdvisor(
        { snapshot, messages: history },
        { signal: controller.signal },
      );
      if (conversationKeyRef.current !== keyAtStart) return;

      const assistantTurn: ChatTurn = {
        role: 'assistant',
        content: response.reply,
        toolsUsed: response.toolsUsed,
      };
      setMessages((prev) => [...prev, assistantTurn]);
      setError(response.error ?? null);
    } catch (err) {
      if (isAbortError(err) || conversationKeyRef.current !== keyAtStart) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (conversationKeyRef.current === keyAtStart) {
        setLoading(false);
      }
    }
  }

  function handleSubmit() {
    void send(draft);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="flex min-w-0 flex-col gap-3 px-4 py-3">
          {messages.length === 0 && !loading ? (
            <div className="min-w-0 space-y-2">
              <p className="text-[13px] text-muted-foreground">可以從這些問題開始：</p>
              <SuggestedPromptList
                prompts={suggestedPrompts}
                disabled={inputLocked}
                onSelect={(prompt) => void send(prompt)}
              />
            </div>
          ) : null}

          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={
                message.role === 'user'
                  ? 'flex min-w-0 justify-end'
                  : 'flex min-w-0 justify-start'
              }
            >
              <div
                className={
                  message.role === 'user'
                    ? 'max-w-[85%] rounded-lg bg-teal-600 px-3 py-2 text-[13px] text-white'
                    : 'min-w-0 w-full rounded-lg border border-[rgba(13,26,45,0.08)] bg-slate-50 px-3 py-2 text-[13px] text-slate-800'
                }
              >
                {message.role === 'assistant' ? (
                  <AdvisorMarkdown content={message.content} />
                ) : (
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                )}
              </div>
            </div>
          ))}

          {loading ? (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-lg border border-[rgba(13,26,45,0.08)] bg-slate-50 px-3 py-2 text-[13px] text-muted-foreground">
                <Loader2 size={14} className="animate-spin text-teal-700" />
                正在分析…
              </div>
            </div>
          ) : null}

          {error ? <p className="text-[13px] text-red-600">{error}</p> : null}

          {messages.some((message) => message.role === 'assistant') &&
          followUpPrompts.length > 0 &&
          !loading ? (
            <div className="min-w-0 space-y-2">
              <p className="text-[13px] text-muted-foreground">可以繼續問：</p>
              <SuggestedPromptList
                prompts={followUpPrompts}
                disabled={inputLocked}
                onSelect={(prompt) => void send(prompt)}
              />
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-[rgba(13,26,45,0.08)] px-4 py-3">
        {disabled || !snapshot ? (
          <p className="mb-2 text-[13px] text-muted-foreground">
            {!snapshot ? '尚無 campaign 快照，無法開始對話。' : '目前無法使用 AI 顧問。'}
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSubmit();
              }
            }}
            disabled={inputLocked}
            placeholder="詢問這檔 campaign 的成效或優化建議…"
            rows={2}
            className="min-h-[60px] resize-none text-[13px]"
          />
          <Button
            type="button"
            size="sm"
            disabled={!canSend}
            onClick={handleSubmit}
            className="h-8 shrink-0 bg-teal-600 text-[13px] text-white hover:bg-teal-700"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            送出
          </Button>
        </div>
      </div>
    </div>
  );
}
