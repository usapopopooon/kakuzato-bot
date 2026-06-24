import { ActionRowBuilder, ButtonBuilder, ButtonStyle, RoleSelectMenuBuilder } from 'discord.js'
import { getBumpServiceByKey, isBumpServiceKey, type BumpServiceKey } from '../bumpServices'

export const bumpComponentCustomIdPrefix = 'bump:'

type BumpComponentAction = 'toggle' | 'role' | 'role-select' | 'role-reset'

export type BumpComponentPayload = {
  action: BumpComponentAction
  guildId: string
  serviceKey: BumpServiceKey
}

export type BumpMessageComponent =
  | ActionRowBuilder<ButtonBuilder>
  | ActionRowBuilder<RoleSelectMenuBuilder>

export function createBumpNotificationComponents(
  guildId: string,
  serviceKey: BumpServiceKey,
  isEnabled: boolean
): ActionRowBuilder<ButtonBuilder> {
  const service = getBumpServiceByKey(serviceKey)
  const serviceName = service?.name ?? serviceKey

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(createBumpComponentCustomId('toggle', guildId, serviceKey))
      .setLabel(`${serviceName} 通知${isEnabled ? 'OFF' : 'ON'}`)
      .setStyle(isEnabled ? ButtonStyle.Secondary : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(createBumpComponentCustomId('role', guildId, serviceKey))
      .setLabel(`${serviceName} ロール変更`)
      .setStyle(ButtonStyle.Primary)
  )
}

export function createBumpRoleSelectComponents(
  guildId: string,
  serviceKey: BumpServiceKey
): BumpMessageComponent[] {
  return [
    new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(createBumpComponentCustomId('role-select', guildId, serviceKey))
        .setPlaceholder('通知先ロールを選択')
        .setMinValues(1)
        .setMaxValues(1)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(createBumpComponentCustomId('role-reset', guildId, serviceKey))
        .setLabel('デフォルトに戻す')
        .setStyle(ButtonStyle.Secondary)
    )
  ]
}

export function createBumpComponentCustomId(
  action: BumpComponentAction,
  guildId: string,
  serviceKey: BumpServiceKey
): string {
  return `${bumpComponentCustomIdPrefix}${action}:${guildId}:${serviceKey}`
}

export function parseBumpComponentCustomId(customId: string): BumpComponentPayload | undefined {
  if (!customId.startsWith(bumpComponentCustomIdPrefix)) {
    return undefined
  }

  const [action, guildId, serviceKey] = customId
    .slice(bumpComponentCustomIdPrefix.length)
    .split(':')

  if (!isBumpComponentAction(action) || !guildId || !isBumpServiceKey(serviceKey)) {
    return undefined
  }

  return {
    action,
    guildId,
    serviceKey
  }
}

function isBumpComponentAction(action: string | undefined): action is BumpComponentAction {
  return (
    action === 'toggle' || action === 'role' || action === 'role-select' || action === 'role-reset'
  )
}
