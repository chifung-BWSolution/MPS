import { useParams } from 'react-router-dom';
import { TalentApplicationForm } from '@/components/settings/TalentApplicationForm';

export function TalentInvitePublicPage() {
  const { token } = useParams<{ token: string }>();

  return (
    <div className="min-h-screen bg-[#f5f8fc] py-6 px-4">
      <div className="max-w-[940px] mx-auto">
        <div className="mb-4 text-center">
          <h1 className="text-[18px] font-bold text-[#0d1a2d] tracking-tight">
            藝人面試登記表
          </h1>
          <p className="text-[12px] text-muted-foreground mt-1">
            請完整填寫以下資料，完成後點擊「儲存草稿」即可提交。
          </p>
          {token && (
            <p className="text-[10.5px] text-muted-foreground/70 mt-1">
              填表編號：{token}
            </p>
          )}
        </div>
        <TalentApplicationForm />
      </div>
    </div>
  );
}
