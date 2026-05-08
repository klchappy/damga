/**
 * Damga ortak tip tanımları (DB-bağımsız).
 * apps/api ve apps/web bu tipleri kullanır.
 */

export type Plan = 'free' | 'starter' | 'pro' | 'business' | 'enterprise';

export type UserRole = 'employee' | 'manager' | 'admin' | 'owner';

export type AttendanceEventType =
  | 'check_in'
  | 'check_out'
  | 'edit_request'
  | 'manual_entry'
  | 'admin_correction'
  | 'dispute';

export type LeaveType =
  | 'annual'
  | 'sick'
  | 'unpaid'
  | 'maternity'
  | 'paternity'
  | 'compassionate';

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type MoodEmoji = '😄' | '🙂' | '😐' | '😕' | '😫';

export type StatusType =
  | 'running_late'
  | 'on_lunch'
  | 'sick'
  | 'wfh'
  | 'in_focus'
  | 'on_business'
  | 'on_break';

export type AnnouncementCategory = 'info' | 'celebration' | 'warning' | 'urgent';

export type EmployeePageKey =
  | 'home'
  | 'history'
  | 'leaves'
  | 'menu'
  | 'announcements'
  | 'profile'
  | 'mood'
  | 'status';

/**
 * Çalışan rolü için varsayılan açık sayfalar — sade kalsın diye ASGARI küme:
 * - home (giriş/çıkış damgası)
 * - menu (yemek menüsü)
 * - announcements (duyurular)
 * - profile (kendi bilgisi + çıkış)
 *
 * Geçmiş, izin, mood vb. opsiyonel — admin panelinden açılır.
 */
export const DEFAULT_EMPLOYEE_PAGES: EmployeePageKey[] = [
  'home',
  'menu',
  'announcements',
  'profile',
];

export interface OrgSettings {
  logo_url?: string;
  primary_color?: string;
  default_timezone?: string;
  /** Çalışan kendi check-in/out'unu düzelteme talebi açabilir mi */
  allow_self_edit_request?: boolean;
  /** Geofence dışında check-in'e izin var mı (varsayılan: hayır) */
  allow_outside_geofence?: boolean;
  /** Çalışan zorunlu olarak NFC kullansın mı */
  require_nfc?: boolean;
  /** Manuel giriş izinli mi (manager onayıyla) */
  allow_manual_entry?: boolean;
  /** Employee rolünün görebileceği sayfa anahtarları. undefined → DEFAULT_EMPLOYEE_PAGES */
  employee_visible_pages?: EmployeePageKey[];
}

export interface DeviceInfo {
  platform?: 'web' | 'ios' | 'android';
  os_version?: string;
  app_version?: string;
  user_agent?: string;
  model?: string;
}

export interface CheckInResponse {
  event_id: string;
  server_time: string;
  verification_score: number;
  decision: 'auto_approve' | 'flag_for_review' | 'reject';
  flags: string[];
  xp_gained: number;
  new_streak: number;
  level_up?: { from: number; to: number };
}

/** Public API webhook event payload tipleri */
export type WebhookEventType =
  | 'check_in.created'
  | 'check_out.created'
  | 'leave.created'
  | 'leave.approved'
  | 'leave.rejected'
  | 'mood.created'
  | 'announcement.published'
  | 'user.created'
  | 'user.deactivated'
  | 'event.disputed'
  | 'event.edited';
