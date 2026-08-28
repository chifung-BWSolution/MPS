import type { Brand, Company } from '@/types/app';
import {
  STAFF_ORG_ALL,
  STAFF_ORG_UNASSIGNED_BRAND,
  STAFF_ORG_UNASSIGNED_COMPANY,
  STAFF_ORG_UNASSIGNED_TEAM,
  brandsForCompany,
  companyOptionValue,
} from '@/components/day-report/staffOrgFilter';

const selectClass = 'px-2.5 py-1.5 border border-border rounded-md text-[12px] bg-white';

type Props = {
  companies: Company[];
  brands: Brand[];
  teamOptions: string[];
  companyId: string;
  brandId: string;
  teamName: string;
  onCompanyChange: (id: string) => void;
  onBrandChange: (id: string) => void;
  onTeamChange: (name: string) => void;
};

export function StaffOrgFilterSelects({
  companies,
  brands,
  teamOptions,
  companyId,
  brandId,
  teamName,
  onCompanyChange,
  onBrandChange,
  onTeamChange,
}: Props) {
  const companyList = companies.filter((c) => c.isActive || companyOptionValue(c) === companyId);
  const brandList = brandsForCompany(
    brands.filter((b) => b.isActive || b.id === brandId),
    companyId,
  );

  return (
    <>
      <select
        value={companyId}
        onChange={(e) => onCompanyChange(e.target.value)}
        className={selectClass}
        aria-label="公司"
      >
        <option value={STAFF_ORG_ALL}>全部公司</option>
        {companyList.map((c) => {
          const value = companyOptionValue(c);
          const label = [c.companyCode, c.companyNameZh || c.companyNameEn].filter(Boolean).join(' · ');
          return (
            <option key={value} value={value}>{label || value}</option>
          );
        })}
        <option value={STAFF_ORG_UNASSIGNED_COMPANY}>未分配公司</option>
      </select>

      <select
        value={brandId}
        onChange={(e) => onBrandChange(e.target.value)}
        className={selectClass}
        aria-label="品牌"
      >
        <option value={STAFF_ORG_ALL}>全部品牌</option>
        {brandList.map((b) => (
          <option key={b.id} value={b.id}>{b.displayName || b.brandCode}</option>
        ))}
        <option value={STAFF_ORG_UNASSIGNED_BRAND}>未分配品牌</option>
      </select>

      <select
        value={teamName}
        onChange={(e) => onTeamChange(e.target.value)}
        className={selectClass}
        aria-label="團隊"
      >
        <option value={STAFF_ORG_ALL}>全部團隊</option>
        {teamOptions.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
        <option value={STAFF_ORG_UNASSIGNED_TEAM}>未分團隊</option>
      </select>
    </>
  );
}
