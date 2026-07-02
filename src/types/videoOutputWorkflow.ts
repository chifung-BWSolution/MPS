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
};
