import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ContentErrorBoundaryProps {
  children: ReactNode;
  /** 變更時自動重置（例如路由切換） */
  resetKey?: string;
}

interface ContentErrorBoundaryState {
  error: Error | null;
}

/**
 * 插件級錯誤邊界（PRD §5.2）：
 * 任何一個頁面爆掉都不應該拖垮其他 15 個模組，也不應該白屏。
 */
export class ContentErrorBoundary extends Component<
  ContentErrorBoundaryProps,
  ContentErrorBoundaryState
> {
  state: ContentErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ContentErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[content-automation] page crashed', error, info.componentStack);
  }

  componentDidUpdate(previous: ContentErrorBoundaryProps): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50/60 px-6 py-12 text-center shadow-card">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <AlertTriangle size={22} strokeWidth={1.75} />
        </div>
        <h3 className="mt-4 text-[16px] font-bold text-[#0d1a2d]">這個頁面暫時無法顯示</h3>
        <p className="mx-auto mt-1.5 max-w-lg text-[13px] leading-relaxed text-rose-700/80">
          其他模組與資料不受影響。可以先重新載入；若持續發生，請把下面訊息提供給技術同事。
        </p>
        <pre className="mx-auto mt-4 max-w-xl overflow-x-auto rounded-md bg-white/80 px-3 py-2 text-left text-[11px] leading-relaxed text-rose-700">
          {error.message}
        </pre>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => this.setState({ error: null })}
            className="gap-1.5"
          >
            <RotateCcw size={13} /> 重試
          </Button>
          <Button size="sm" onClick={() => window.location.reload()}>
            重新載入
          </Button>
        </div>
      </div>
    );
  }
}
