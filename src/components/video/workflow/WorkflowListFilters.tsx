import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Channel = { id: string; channelCode: string; publicName: string };

type Props = {
  channels: Channel[];
  vchannelFilter: string;
  onVchannelFilterChange: (value: string) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  yearFilter: number;
  onYearFilterChange: (value: number) => void;
  yearOptions: number[];
};

export function WorkflowListFilters({
  channels,
  vchannelFilter,
  onVchannelFilterChange,
  searchQuery,
  onSearchQueryChange,
  yearFilter,
  onYearFilterChange,
  yearOptions,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={String(yearFilter)} onValueChange={value => onYearFilterChange(Number(value))}>
        <SelectTrigger className="h-9 w-[100px] text-[12px]">
          <SelectValue placeholder="年份" />
        </SelectTrigger>
        <SelectContent>
          {yearOptions.map(year => (
            <SelectItem key={year} value={String(year)}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={vchannelFilter} onValueChange={onVchannelFilterChange}>
        <SelectTrigger className="h-9 w-[180px] text-[12px]">
          <SelectValue placeholder="Vchannel" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部 Vchannel</SelectItem>
          {channels.map(ch => (
            <SelectItem key={ch.id} value={ch.id}>
              {ch.channelCode} — {ch.publicName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="relative flex-1 min-w-[180px] max-w-[280px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={e => onSearchQueryChange(e.target.value)}
          placeholder="搜尋主題或 Video Code…"
          className="h-9 pl-9 text-[12px]"
        />
      </div>
    </div>
  );
}
