/**
 * Damga shared types — DTO'lar (API ↔ UI taşıma).
 * Bu tipler Drizzle row tiplerinden bağımsızdır; UI server-agnostik kalsın diye.
 */

export type Plan = 'free' | 'starter' | 'pro' | 'business' | 'enterprise';
export type UserRole = 'employee' | 'manager' | 'admin' | 'owner';

export interface UserDTO {
  id: string;
  org_id: string | null;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  role: UserRole;
  department?: string | null;
  title?: string | null;
  hired_at?: string | null;
  is_active: boolean;
  current_streak: number;
  longest_streak: number;
  total_xp: number;
  level: number;
  shields: number;
  annual_leave_quota_days: number;
  annual_leave_used_days: number;
  created_at: string;
}

export interface LocationDTO {
  id: string;
  org_id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  timezone: string;
  latitude: number;
  longitude: number;
  geofence_radius_m: number;
  wifi_bssids: string[];
  nfc_tag_ids: string[];
  qr_codes: string[];
  work_hours_start: string;
  work_hours_end: string;
  is_active: boolean;
}

export interface AttendanceEventDTO {
  id: string;
  org_id: string;
  user_id: string;
  type: string;
  client_time: string;
  server_time: string;
  effective_time: string;
  timezone_at_time: string;
  latitude?: number | null;
  longitude?: number | null;
  gps_accuracy_m?: number | null;
  location_id?: string | null;
  distance_from_office_m?: number | null;
  nfc_tag_id?: string | null;
  wifi_bssid?: string | null;
  device_id?: string | null;
  ip_address?: string | null;
  verification_methods: string[];
  verification_score: number;
  evidence_hash: string;
  previous_event_hash?: string | null;
  this_event_hash: string;
  flags: string[];
  app_version?: string | null;
  created_at: string;
  // joined
  user?: { id: string; full_name: string; email: string; avatar_url?: string | null };
  location?: { id: string; name: string };
}

export interface CheckInResultDTO {
  event_id: string;
  server_time: string;
  verification_score: number;
  decision: 'auto_approve' | 'flag_for_review' | 'reject';
  flags: string[];
  xp_gained: number;
  new_streak: number;
  level_up?: { from: number; to: number };
}

export interface LeaveDTO {
  id: string;
  org_id: string;
  user_id: string;
  type: string;
  start_date: string;
  end_date: string;
  half_day: boolean;
  reason?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approved_by?: string | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
  business_days?: string | null;
  created_at: string;
  // joined
  user?: { id: string; full_name: string };
  approver?: { id: string; full_name: string } | null;
}
