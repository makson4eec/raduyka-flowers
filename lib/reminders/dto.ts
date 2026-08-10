import type {
  ReminderDto,
  ReminderInput,
  ReminderInsertRow,
  ReminderMutationRow,
  ReminderRow,
} from "./types";

export const REMINDER_SELECT_COLUMNS = "id,user_id,title,person_name,event_type,event_day,event_month,event_year,notify_7_days,notify_3_days,notify_1_day,notify_same_day,created_at,updated_at";

export function reminderRowToInput(row: ReminderRow): ReminderInput {
  return {
    title: row.title,
    personName: row.person_name,
    eventType: row.event_type,
    eventDay: row.event_day,
    eventMonth: row.event_month,
    eventYear: row.event_year,
    notify7Days: row.notify_7_days,
    notify3Days: row.notify_3_days,
    notify1Day: row.notify_1_day,
    notifySameDay: row.notify_same_day,
  };
}

export function reminderRowToDto(row: ReminderRow): ReminderDto {
  return {
    id: row.id,
    ...reminderRowToInput(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function reminderInputToMutationRow(
  input: ReminderInput,
): ReminderMutationRow {
  return {
    title: input.title,
    person_name: input.personName,
    event_type: input.eventType,
    event_day: input.eventDay,
    event_month: input.eventMonth,
    event_year: input.eventYear,
    notify_7_days: input.notify7Days,
    notify_3_days: input.notify3Days,
    notify_1_day: input.notify1Day,
    notify_same_day: input.notifySameDay,
  };
}

export function reminderInputToInsertRow(
  input: ReminderInput,
  userId: string,
): ReminderInsertRow {
  return {
    user_id: userId,
    ...reminderInputToMutationRow(input),
  };
}
