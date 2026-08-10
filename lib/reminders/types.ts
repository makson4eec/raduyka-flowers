export const REMINDER_EVENT_TYPES = [
  "birthday",
  "anniversary",
  "holiday",
  "other",
] as const;

export type ReminderEventType = (typeof REMINDER_EVENT_TYPES)[number];

export const REMINDER_NOTIFICATION_OFFSETS = [7, 3, 1, 0] as const;

export type ReminderNotificationOffset =
  (typeof REMINDER_NOTIFICATION_OFFSETS)[number];

export type ReminderInput = {
  title: string;
  personName: string | null;
  eventType: ReminderEventType;
  eventDay: number;
  eventMonth: number;
  /** The original year. The reminder still repeats every year. */
  eventYear: number | null;
  notify7Days: boolean;
  notify3Days: boolean;
  notify1Day: boolean;
  notifySameDay: boolean;
};

export type ReminderPatch = Partial<ReminderInput>;

export type ReminderDto = ReminderInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type ReminderRow = {
  id: string;
  user_id: string;
  title: string;
  person_name: string | null;
  event_type: ReminderEventType;
  event_day: number;
  event_month: number;
  event_year: number | null;
  notify_7_days: boolean;
  notify_3_days: boolean;
  notify_1_day: boolean;
  notify_same_day: boolean;
  created_at: string;
  updated_at: string;
};

export type ReminderMutationRow = Omit<
  ReminderRow,
  "id" | "user_id" | "created_at" | "updated_at"
>;

export type ReminderInsertRow = ReminderMutationRow & {
  user_id: string;
};

export type ReminderSchedule = Pick<
  ReminderInput,
  | "eventDay"
  | "eventMonth"
  | "eventYear"
  | "notify7Days"
  | "notify3Days"
  | "notify1Day"
  | "notifySameDay"
>;
