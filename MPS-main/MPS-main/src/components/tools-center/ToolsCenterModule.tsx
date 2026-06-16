import { ToolsModule } from '@/components/tools/ToolsModule';
import { TrainingModule } from '@/components/training/TrainingModule';
import { AiCaptionTool } from './AiCaptionTool';
import { PromptLibrary } from './PromptLibrary';

export function ToolsCenterModule({ subModule }: { subModule?: string }) {
  const getTitle = () => {
    switch (subModule) {
      case 'ai-keyword': return { title: 'AI 關鍵字生成器', subtitle: '一鍵生成 SEO 關鍵字並自動分級。' };
      case 'ai-title': return { title: 'AI SEO標題生成器', subtitle: '根據關鍵字生成優化的 SEO 標題。' };
      case 'ai-caption': return { title: 'AI 圖片說明生成', subtitle: '上傳圖片，自動生成 Alt Text、標題及 SEO 描述。' };
      case 'prompt-library': return { title: 'Prompt 資料庫', subtitle: '儲存、分類及重用 AI 提示詞，支持標籤及公開/私人設定。' };
      case 'templates': return { title: '模板庫', subtitle: '管理報價模板、eDM 模板及工作範本。' };
      case 'training-modules': return { title: '培訓模組', subtitle: '推薦資源、分類篩選及角色對應培訓內容。' };
      case 'training-progress': return { title: '培訓進度追蹤', subtitle: '查看個人培訓進度、完成率及分數記錄。' };
      default: return { title: 'AI 關鍵字生成器', subtitle: '一鍵生成 SEO 關鍵字並自動分級。' };
    }
  };

  const { title, subtitle } = getTitle();

  const renderContent = () => {
    switch (subModule) {
      case 'ai-keyword':
        return <ToolsModule subModule="seo-keyword-ai" />;
      case 'ai-title':
        return <ToolsModule subModule="seo-title-ai" />;
      case 'ai-caption':
        return <AiCaptionTool />;
      case 'prompt-library':
        return <PromptLibrary />;
      case 'templates':
        return <ToolsModule subModule="templates" />;
      case 'training-modules':
        return <TrainingModule subModule="modules" />;
      case 'training-progress':
        return <TrainingModule subModule="progress" />;
      default:
        return <ToolsModule subModule="seo-keyword-ai" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[32px] font-bold tracking-tight">{title}</h1>
        <p className="text-[14px] text-muted-foreground mt-1">{subtitle}</p>
      </div>
      {renderContent()}
    </div>
  );
}
