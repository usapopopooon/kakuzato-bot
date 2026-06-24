import { AutoModActionTaken, AutoModRuleType, type AutoModAction } from '@prisma/client'
import { EmbedBuilder, type Guild, type GuildMember } from 'discord.js'

export type AutoModLogEmbedInput = {
  guild: Pick<Guild, 'name'>
  member: Pick<GuildMember, 'id' | 'displayName' | 'joinedTimestamp'> & {
    user: Pick<GuildMember['user'], 'tag' | 'createdTimestamp' | 'displayAvatarURL' | 'toString'>
  }
  rule: {
    id: number
    ruleType: AutoModRuleType
    action: AutoModAction
    thresholdSeconds?: number
    timeoutDurationSeconds?: number
  }
  actionTaken: AutoModActionTaken
  reason: string
  createdAt?: Date
}

const actionTakenLabels: Record<AutoModActionTaken, string> = {
  [AutoModActionTaken.BANNED]: 'BAN',
  [AutoModActionTaken.KICKED]: 'KICK',
  [AutoModActionTaken.TIMED_OUT]: 'タイムアウト'
}

const ruleTypeLabels: Record<AutoModRuleType, string> = {
  [AutoModRuleType.NO_AVATAR]: 'アバター未設定',
  [AutoModRuleType.ACCOUNT_AGE]: 'アカウント作成期間'
}

const actionColors: Record<AutoModActionTaken, number> = {
  [AutoModActionTaken.BANNED]: 0xe74c3c,
  [AutoModActionTaken.KICKED]: 0xe67e22,
  [AutoModActionTaken.TIMED_OUT]: 0xf1c40f
}

export function createAutoModLogEmbed(input: AutoModLogEmbedInput): EmbedBuilder {
  const createdAt = input.createdAt ?? new Date()
  const embed = new EmbedBuilder()
    .setTitle(`[AutoMod] ${actionTakenLabels[input.actionTaken]} を実行しました`)
    .setColor(actionColors[input.actionTaken])
    .setTimestamp(createdAt)
    .setThumbnail(input.member.user.displayAvatarURL())
    .addFields(
      {
        name: '対象ユーザー',
        value: `${input.member.user.toString()} (${input.member.user.tag})\n表示名: ${
          input.member.displayName
        }\nID: ${inlineCode(input.member.id)}`,
        inline: false
      },
      {
        name: '実行内容',
        value: actionTakenLabels[input.actionTaken],
        inline: true
      },
      {
        name: 'ルール',
        value: `#${input.rule.id} ${ruleTypeLabels[input.rule.ruleType]}`,
        inline: true
      },
      {
        name: '理由',
        value: input.reason,
        inline: false
      },
      {
        name: 'アカウント作成',
        value: formatJstTimestamp(input.member.user.createdTimestamp),
        inline: true
      }
    )
    .setFooter({ text: `サーバー: ${input.guild.name} / 記録時刻: ${formatJst(createdAt)}` })

  if (input.member.joinedTimestamp) {
    embed.addFields({
      name: 'サーバー参加',
      value: formatJstTimestamp(input.member.joinedTimestamp),
      inline: true
    })
  }

  const ruleDetails = formatRuleDetails(input.rule)

  if (ruleDetails) {
    embed.addFields({
      name: 'ルール詳細',
      value: ruleDetails,
      inline: false
    })
  }

  return embed
}

export function formatAutoModRuleType(ruleType: AutoModRuleType): string {
  return ruleTypeLabels[ruleType]
}

export function formatAutoModActionTaken(actionTaken: AutoModActionTaken): string {
  return actionTakenLabels[actionTaken]
}

function formatRuleDetails(rule: AutoModLogEmbedInput['rule']): string | undefined {
  const details: string[] = []

  if (rule.ruleType === AutoModRuleType.ACCOUNT_AGE && rule.thresholdSeconds) {
    details.push(`閾値: ${formatDuration(rule.thresholdSeconds)}`)
  }

  if (rule.action === 'TIMEOUT' && rule.timeoutDurationSeconds) {
    details.push(`タイムアウト時間: ${formatDuration(rule.timeoutDurationSeconds)}`)
  }

  return details.length > 0 ? details.join('\n') : undefined
}

export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}秒`
  }

  const minutes = Math.floor(totalSeconds / 60)

  if (minutes < 60) {
    return `${minutes}分`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}時間${remainingMinutes}分` : `${hours}時間`
  }

  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return remainingHours > 0 ? `${days}日${remainingHours}時間` : `${days}日`
}

function formatJstTimestamp(timestamp: number): string {
  const unix = Math.floor(timestamp / 1000)
  return `${formatJst(new Date(timestamp))} (<t:${unix}:R>)`
}

function formatJst(date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  const year = jst.getUTCFullYear()
  const month = pad2(jst.getUTCMonth() + 1)
  const day = pad2(jst.getUTCDate())
  const hour = pad2(jst.getUTCHours())
  const minute = pad2(jst.getUTCMinutes())
  const second = pad2(jst.getUTCSeconds())
  return `${year}/${month}/${day} ${hour}:${minute}:${second} JST`
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

function inlineCode(value: string): string {
  return `\`${value.replaceAll('`', '')}\``
}
