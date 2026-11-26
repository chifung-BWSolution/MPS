import { useState } from 'react';
import { Languages, Megaphone } from 'lucide-react';

import { FeatureTabs, type FeatureTabItem } from '../FeatureTabs';
import { ToneRewriteTool } from '../tone-rewrite/ToneRewriteTool';
import { AdCreativePanel } from './ad/AdCreativePanel';

type CopyStudioTab = 'tone' | 'ad';

const TABS: FeatureTabItem<CopyStudioTab>[] = [
  {
    id: 'ad',
    label: '文案多角度轉寫',
    icon: Megaphone,
    title: '廣告創意切角與 A/B 文案矩陣',
  },
  {
    id: 'tone',
    label: '語氣校對改寫',
    icon: Languages,
    title: '港式語氣校對與社群口語版',
  },
];

/**
 * AI文案工坊外殼：一個入口、兩個子功能。
 * 兩個 panel 都保持 mounted，只用 hidden 切換，所以切 tab 不會清空輸入／結果／已改字。
 * 預設停在「文案多角度轉寫」；服務在首次進入時探測。
 */
export function CopyStudioTool() {
  const [tab, setTab] = useState<CopyStudioTab>('ad');

  return (
    <div className="space-y-4">
      <FeatureTabs<CopyStudioTab>
        items={TABS}
        value={tab}
        onChange={setTab}
        ariaLabel="AI文案工坊子功能"
      />

      <div role="tabpanel" hidden={tab !== 'ad'} aria-label="文案多角度轉寫">
        <AdCreativePanel active={tab === 'ad'} />
      </div>

      <div role="tabpanel" hidden={tab !== 'tone'} aria-label="語氣校對改寫">
        <ToneRewriteTool />
      </div>
    </div>
  );
}
