// Shared fee-reminder settings: shape, defaults and template rendering.
// Read by the admin settings UI (FinanceManager "Automatic reminders" tab)
// and by the server sweep (src/server/feeReminders.ts) that sends them.

export interface FeeReminderSettings {
  enabled: boolean;
  /** Days before the next payment due date to remind: 1, 3, 7, 14 or 30. */
  daysBefore: number;
  /** Also remind everyone owing every Monday. */
  weeklyMonday: boolean;
  channels: { email: boolean; push: boolean; chat: boolean };
  /**
   * The in-chat reminder message. The facility speaks, never the admin:
   * {{facility_name}} is filled in automatically. Other placeholders:
   * {{student_name}}, {{outstanding_balance}}, {{next_payment_due}}.
   */
  chatTemplate: string;
}

export const DEFAULT_FEE_REMINDER_SETTINGS: FeeReminderSettings = {
  enabled: false,
  daysBefore: 7,
  weeklyMonday: false,
  channels: { email: true, push: true, chat: true },
  chatTemplate:
    'Hello {{student_name}}, this is a reminder from {{facility_name}}. Your tuition balance of {{outstanding_balance}} is due by {{next_payment_due}}. Kindly complete your payment so your classes are not interrupted. Thank you.',
};

export const FEE_REMINDER_DAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: '1 day before due' },
  { value: 3, label: '3 days before due' },
  { value: 7, label: '7 days before due' },
  { value: 14, label: '14 days before due' },
  { value: 30, label: '30 days before due' },
];

/** Fill the template placeholders; anything left unfilled is dropped. */
export function renderChatTemplate(template: string, values: Record<string, string>): string {
  let out = String(template || '');
  for (const [key, val] of Object.entries(values)) {
    out = out.split(`{{${key}}}`).join(val);
  }
  return out
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Accept anything a settings document holds and return a clean object. */
export function normalizeFeeReminderSettings(raw: unknown): FeeReminderSettings {
  const d = DEFAULT_FEE_REMINDER_SETTINGS;
  if (!raw || typeof raw !== 'object') return { ...d, channels: { ...d.channels } };
  const v = raw as Record<string, any>;
  const days = Number(v.daysBefore);
  const ch = v.channels && typeof v.channels === 'object' ? (v.channels as Record<string, any>) : {};
  return {
    enabled: v.enabled === true,
    daysBefore: [1, 3, 7, 14, 30].includes(days) ? days : d.daysBefore,
    weeklyMonday: v.weeklyMonday === true,
    channels: {
      email: ch.email !== false,
      push: ch.push !== false,
      chat: ch.chat !== false,
    },
    chatTemplate:
      typeof v.chatTemplate === 'string' && v.chatTemplate.trim() ? v.chatTemplate : d.chatTemplate,
  };
}
