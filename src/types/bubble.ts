/**
 * Bubble.io Data Type Interfaces
 * 
 * These interfaces map to the actual field names returned by Bubble's Data API.
 * Field names use Bubble's naming conventions (spaces, prefixes like O_, N_).
 */

// ============================
// Staff
// ============================

export interface BubbleStaff {
  _id: string;
  'Display Name': string;
  'Full Name'?: string;
  'Position': string;
  'O_User Role': string;
  'O_Status': 'Active' | 'Inactive';
  'O_Status_Text': 'Active' | 'Inactive';
  'Work Email': string;
  'Private Email'?: string;
  'Work Phone'?: number;
  'Private Phone'?: number;
  'O_Base Location'?: string;
  'Birthday'?: string;
  'Entry Date'?: string;
  'Joining Date'?: string;
  'Termination Date'?: string;
  'O_Probation'?: string;
  'AL Quota'?: number;
  'N_BU'?: string; // Business Unit reference ID
  'N_Team'?: string; // Team reference ID
  'N_Team Role'?: string; // Team Role reference ID
  'Profile Pic'?: string;
  'Clock In Face'?: string;
  'Clock In Face amazon ID'?: string;
  'Clock In Face amazon ID 2'?: string;
  'Voov ID'?: number;
  'New Work Phone'?: string;
  'Created By': string;
  'Created Date': string;
  'Modified Date': string;
}

// ============================
// Field name constants for queries
// ============================

export const STAFF_FIELDS = {
  ID: '_id',
  DISPLAY_NAME: 'Display Name',
  FULL_NAME: 'Full Name',
  POSITION: 'Position',
  USER_ROLE: 'O_User Role',
  STATUS: 'O_Status',
  STATUS_TEXT: 'O_Status_Text',
  WORK_EMAIL: 'Work Email',
  PRIVATE_EMAIL: 'Private Email',
  WORK_PHONE: 'Work Phone',
  PRIVATE_PHONE: 'Private Phone',
  BASE_LOCATION: 'O_Base Location',
  BIRTHDAY: 'Birthday',
  ENTRY_DATE: 'Entry Date',
  JOINING_DATE: 'Joining Date',
  TERMINATION_DATE: 'Termination Date',
  PROBATION: 'O_Probation',
  AL_QUOTA: 'AL Quota',
  BUSINESS_UNIT: 'N_BU',
  TEAM: 'N_Team',
  TEAM_ROLE: 'N_Team Role',
  PROFILE_PIC: 'Profile Pic',
  CLOCK_IN_FACE: 'Clock In Face',
  VOOV_ID: 'Voov ID',
  CREATED_BY: 'Created By',
  CREATED_DATE: 'Created Date',
  MODIFIED_DATE: 'Modified Date',
} as const;

// ============================
// Utility type for Bubble CDN URLs
// ============================

/** Bubble CDN URLs typically start with // (protocol-relative) */
export function toBubbleCdnUrl(path?: string): string | undefined {
  if (!path) return undefined;
  // Add https: if protocol-relative
  if (path.startsWith('//')) return `https:${path}`;
  return path;
}
