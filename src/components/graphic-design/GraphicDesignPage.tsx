import { GraphicDesignModule } from './GraphicDesignModule';

export function GraphicDesignPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[32px] font-bold tracking-tight">平面設計</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          管理各平台平面設計製作及成果追蹤。
        </p>
      </div>
      <GraphicDesignModule />
    </div>
  );
}
