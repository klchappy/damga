import { pgEnum } from 'drizzle-orm/pg-core';

export const planEnum = pgEnum('plan', [
  'free',
  'starter',
  'pro',
  'business',
  'enterprise',
]);

export const userRoleEnum = pgEnum('user_role', ['employee', 'manager', 'admin', 'owner']);

export const attendanceEventTypeEnum = pgEnum('attendance_event_type', [
  'check_in',
  'check_out',
  'edit_request',
  'manual_entry',
  'admin_correction',
  'dispute',
]);

export const leaveTypeEnum = pgEnum('leave_type', [
  'annual',
  'sick',
  'unpaid',
  'maternity',
  'paternity',
  'compassionate',
]);

export const leaveStatusEnum = pgEnum('leave_status', [
  'pending',
  'approved',
  'rejected',
  'cancelled',
]);

export const statusTypeEnum = pgEnum('status_type', [
  'running_late',
  'on_lunch',
  'sick',
  'wfh',
  'in_focus',
  'on_business',
  'on_break',
]);

export const announcementCategoryEnum = pgEnum('announcement_category', [
  'info',
  'celebration',
  'warning',
  'urgent',
]);
