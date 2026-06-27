export type BumpServiceKey = 'DISBOARD' | 'DISSOKU'
export type BumpServiceName = 'DISBOARD' | 'ディス速報'

export type BumpServiceDefinition = {
  key: BumpServiceKey
  name: BumpServiceName
  botId: string
  reminderDelayMs: number
  successKeywords: readonly string[]
  failureKeywords: readonly string[]
  checkTitle: boolean
  checkDescription: boolean
  checkFields: boolean
  checkContent: boolean
}

export const disboardBotId = '302050872383242240'
export const dissokuBotId = '761562078095867916'
export const bumpReminderDelayMs = 2 * 60 * 60 * 1_000
export const disboardReminderDelayMs = 5 * 60 * 60 * 1_000
export const bumpReminderCheckIntervalMs = 30 * 1_000

export const bumpServices = [
  {
    key: 'DISBOARD',
    name: 'DISBOARD',
    botId: disboardBotId,
    reminderDelayMs: disboardReminderDelayMs,
    successKeywords: ['表示順をアップ', 'bump done'],
    failureKeywords: ['please wait', 'already bumped', 'できません', '失敗'],
    checkTitle: true,
    checkDescription: true,
    checkFields: true,
    checkContent: true
  },
  {
    key: 'DISSOKU',
    name: 'ディス速報',
    botId: dissokuBotId,
    reminderDelayMs: bumpReminderDelayMs,
    successKeywords: ['アップしたよ', 'アップしました', 'upしました', 'upできます'],
    failureKeywords: ['失敗', 'できません', 'できない', '間隔', '待って'],
    checkTitle: true,
    checkDescription: true,
    checkFields: true,
    checkContent: true
  }
] as const satisfies readonly BumpServiceDefinition[]

export function getBumpServiceByKey(
  serviceKey: string | undefined
): BumpServiceDefinition | undefined {
  return bumpServices.find((service) => service.key === serviceKey)
}

export function getBumpServiceByBotId(botId: string): BumpServiceDefinition | undefined {
  return bumpServices.find((service) => service.botId === botId)
}

export function isBumpServiceKey(value: string | undefined): value is BumpServiceKey {
  return value === 'DISBOARD' || value === 'DISSOKU'
}
