import { Building2, Link2, Loader2, ScanSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { hostOf } from '@/lib/altUrl.ts';
import type { WebsiteProfileFull } from '@/types/app';

export interface PageAnalyzeFormProps {
  sites: WebsiteProfileFull[];
  sitesLoading: boolean;
  siteId: string;
  onSiteIdChange: (siteId: string) => void;
  url: string;
  onUrlChange: (url: string) => void;
  onAnalyze: () => void;
  analyzing: boolean;
  disabled?: boolean;
}

export function PageAnalyzeForm({
  sites,
  sitesLoading,
  siteId,
  onSiteIdChange,
  url,
  onUrlChange,
  onAnalyze,
  analyzing,
  disabled = false,
}: PageAnalyzeFormProps) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)_auto]">
      <div className="relative">
        <Building2
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground"
        />
        <Select
          value={siteId || undefined}
          onValueChange={onSiteIdChange}
          disabled={disabled || sitesLoading || sites.length === 0 || analyzing}
        >
          <SelectTrigger className="h-9 bg-white pl-9" aria-label="選擇站點">
            <SelectValue placeholder={sitesLoading ? '載入站點…' : '選擇站點'} />
          </SelectTrigger>
          <SelectContent className="z-[120] max-h-[320px]">
            {sites.map((site) => (
              <SelectItem key={site.id} value={site.id}>
                {site.websiteName}
                {site.domainUrl ? ` · ${hostOf(site.domainUrl)}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="relative">
        <Link2
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !analyzing && !disabled) onAnalyze();
          }}
          placeholder={disabled ? 'ALT Pilot 已停用' : 'https://www.example.com/page 或 /page'}
          className="h-9 bg-white pl-9"
          aria-label="頁面 URL"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
        />
      </div>

      <Button
        type="button"
        onClick={onAnalyze}
        disabled={disabled || analyzing || !url.trim()}
        className="h-9 gap-2 bg-[#0D9488] px-4 text-white hover:bg-[#0b8076]"
      >
        {analyzing ? <Loader2 size={15} className="animate-spin" /> : <ScanSearch size={15} />}
        {disabled ? '已停用' : analyzing ? '分析中…' : '分析頁面'}
      </Button>
    </div>
  );
}
