import type {
  ModelAssignment,
  ProductionProgress,
  StaffAssignment,
  VideoWorkflowStage,
} from '@/types/videoWorkflow';

export type PrepAssignments = {
  copywriting?: StaffAssignment;
  script?: StaffAssignment;
  model?: ModelAssignment;
  photographer?: StaffAssignment;
  onSiteCrew?: StaffAssignment[];
};

export type VideoOutputWorkflowFields = {
  workflowStage: VideoWorkflowStage;
  prepAssignments: PrepAssignments;
  productionProgress: ProductionProgress;
  locationNotes?: string;
  reviewRejectReason?: string;
  submittedForReviewAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  /** 行政審查是否已通過（通過後才可管理批核） */
  adminReviewPassed?: boolean;
  adminReviewedAt?: string;
  adminReviewedBy?: string;
};
