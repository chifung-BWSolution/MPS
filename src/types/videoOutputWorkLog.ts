export type VideoWorkLogType = 'editing' | 'color' | 'subtitle' | 'shoot' | 'other';

export interface VideoOutputWorkLog {
  id: string;
  videoOutputId: string;
  staffId: string;
  staffName?: string;
  workDate: string;
  hours: number;
  workType: VideoWorkLogType;
  notes?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type VideoWorkLogDraft = {
  id?: string;
  staffId: string;
  staffName?: string;
  workDate: string;
  hours: number;
  workType: VideoWorkLogType;
  notes?: string;
};

export const VIDEO_WORK_LOG_TYPE_LABELS: Record<VideoWorkLogType, string> = {
  editing: '剪輯',
  color: '調色',
  subtitle: '字幕',
  shoot: '拍攝',
  other: '其他',
};
