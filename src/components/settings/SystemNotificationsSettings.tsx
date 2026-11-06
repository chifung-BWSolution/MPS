import { useMemo } from 'react';
import { buildSystemNotificationCatalog, type SystemNotificationDoc } from '@/lib/systemNotifications';

function addressText(addresses: readonly string[]): string {
  return addresses.length > 0 ? addresses.join('\n') : '無';
}

function MetaBlock({ label, children }: { label: string; children: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <p className="text-[13px] leading-6 whitespace-pre-wrap text-foreground">{children}</p>
    </div>
  );
}

function NotificationCard({ doc }: { doc: SystemNotificationDoc }) {
  return (
    <article className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6 space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[18px] font-bold">{doc.name}</h2>
        <span className="inline-flex items-center rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
          {doc.kind === 'scheduled' ? '排程' : '手動'}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MetaBlock label="電郵標題">{doc.subject}</MetaBlock>
        <MetaBlock label="頻率">{doc.frequency}</MetaBlock>
        <MetaBlock label="用途">{doc.purpose}</MetaBlock>
        <MetaBlock label="觸發條件">{doc.trigger}</MetaBlock>
        <MetaBlock label="To">{doc.to.addresses.length > 0 ? doc.to.addresses.join('\n') : doc.to.summary}</MetaBlock>
        <MetaBlock label="Cc">{addressText(doc.cc)}</MetaBlock>
        <MetaBlock label="Bcc">{addressText(doc.bcc)}</MetaBlock>
      </div>
      <p className="text-[13px] leading-6 text-muted-foreground">{doc.to.note}</p>

      <div className="space-y-2">
        <div>
          <h3 className="text-[14px] font-bold">範本預覽</h3>
          <p className="text-[12px] text-muted-foreground mt-1">
            預覽主旨：{doc.previewSubject}。以下用固定範例資料套用正式 HTML 範本，正式郵件會代入當日的項目與金額。
          </p>
        </div>
        <iframe
          title={`${doc.name} 電郵範本預覽`}
          sandbox=""
          srcDoc={doc.previewHtml}
          className="w-full h-[720px] rounded-md border border-border/60 bg-white"
        />
      </div>
    </article>
  );
}

export function SystemNotificationsSettings() {
  const docs = useMemo(() => buildSystemNotificationCatalog(), []);
  const scheduled = docs.filter((doc) => doc.kind === 'scheduled').length;
  const manual = docs.length - scheduled;

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted-foreground">
        目前有 {scheduled} 個排程電郵，以及 {manual} 個由同事手動發送的電郵通知。
      </p>
      {docs.map((doc) => (
        <NotificationCard key={doc.id} doc={doc} />
      ))}
    </div>
  );
}
