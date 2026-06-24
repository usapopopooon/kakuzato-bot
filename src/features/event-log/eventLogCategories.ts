export const eventLogCategories = ['message', 'member', 'moderation', 'server', 'voice'] as const

export type EventLogCategory = (typeof eventLogCategories)[number]

export const defaultEventLogCategories: EventLogCategory[] = [...eventLogCategories]

export const eventLogCategoryLabels: Record<EventLogCategory, string> = {
  message: 'メッセージ',
  member: 'メンバー',
  moderation: 'モデレーション',
  server: 'サーバー変更',
  voice: 'ボイス'
}

export function isEventLogCategory(value: string): value is EventLogCategory {
  return (eventLogCategories as readonly string[]).includes(value)
}
