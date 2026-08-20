import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { invokeAdsCampaignAdvisor } from '@/lib/adsAdvisorApi';
import { getAdsAdvisorSuggestedPrompts } from '@/lib/adsAdvisorPrompts';
import type {
  AdsAdvisorMessage,
  AdsAdvisorSnapshot,
  AdsAdvisorToolCall,
} from '@/types/adsAdvisor';

export type AdsCampaignAdvisorChatProps = {
  snapshot: AdsAdvisorSnapshot | null;
  disabled?: boolean;
  conversationKey: string;
};

type ChatTurn = AdsAdvisorMessage & {
  toolsUsed?: AdsAdvisorToolCall[];
};

const TOOL_LABELS: Record<string, string> = {
  search_campaigns: '搜尋 campaign…',
  get_campaign_metrics: '讀取 campaign 數據…',
  compare_campaigns: '比較 campaign…',
  get_campaigns_by_tag: '依標籤搜尋…',
  get_campaign_breakdowns: '讀取細項（關鍵字／廣告／版位）…',
};

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
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
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 px-4 py-3">
          {messages.length === 0 && !loading ? (
            <div className="space-y-2">
              <p className="text-[13px] text-muted-foreground">可以從這些問題開始：</p>
              <div className="flex flex-col gap-2">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={inputLocked}
                    onClick={() => void send(prompt)}
                    className="rounded-md border border-teal-200 bg-teal-50/70 px-3 py-2 text-left text-[13px] text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className={
                  message.role === 'user'
                    ? 'max-w-[85%] rounded-lg bg-teal-600 px-3 py-2 text-[13px] text-white'
                    : 'max-w-[85%] rounded-lg border border-[rgba(13,26,45,0.08)] bg-slate-50 px-3 py-2 text-[13px] text-slate-800'
                }
              >
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
                {message.role === 'assistant' && message.toolsUsed?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {message.toolsUsed.map((tool, toolIndex) => (
                      <span
                        key={`${tool.name}-${toolIndex}`}
                        className={
                          tool.ok
                            ? 'rounded bg-teal-50 px-1.5 py-0.5 text-[11px] text-teal-700'
                            : 'rounded bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-700'
                        }
                      >
                        {toolLabel(tool.name)}
                      </span>
                    ))}
                  </div>
                ) : null}
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
          <div ref={endRef} />
        </div>
      </ScrollArea>

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
