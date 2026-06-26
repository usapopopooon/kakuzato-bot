import {
  AuditLogEvent,
  Events,
  Guild,
  type GuildBasedChannel,
  type Invite,
  type Vanity
} from 'discord.js'
import type {
  AnyDiscordEventHandler,
  DiscordEventHandler
} from '../../../platform/discord/botModule'
import {
  createChannelEmbed,
  createChannelUpdatedEmbed,
  createEmojiEmbed,
  createGuildUpdatedEmbed,
  createInviteCreatedEmbed,
  createInviteDeletedEmbed,
  createMemberBanEmbed,
  createMemberJoinedEmbed,
  createMemberKickedEmbed,
  createMemberLeftEmbed,
  createMemberNicknameChangedEmbed,
  createMemberRolesChangedEmbed,
  createMemberTimeoutEmbed,
  createMemberTimeoutRemovedEmbed,
  createMemberUnbanEmbed,
  createMessageDeletedEmbed,
  createMessageEditedEmbed,
  createMessagesPurgedEmbed,
  createRoleEmbed,
  createRoleUpdatedEmbed,
  createThreadEmbed,
  createThreadUpdatedEmbed,
  createVoiceStateEmbed,
  type EventLogAuditDetails,
  type MemberJoinInviteDetails
} from '../services/eventLogEmbeds'
import type { EventLogService } from '../services/eventLogService'

type TargetMatcher = (target: unknown) => boolean
type InviteCacheEntry = {
  code: string
  uses: number
  inviterId?: string
}

export function createEventLogEvents(service: EventLogService): AnyDiscordEventHandler[] {
  const inviteTracker = new InviteTracker()

  return [
    createClientReadyEvent(inviteTracker),
    createGuildCreateEvent(inviteTracker),
    createGuildDeleteEvent(inviteTracker),
    createMessageDeleteEvent(service),
    createMessageUpdateEvent(service),
    createMessageBulkDeleteEvent(service),
    createGuildMemberAddEvent(service, inviteTracker),
    createGuildMemberRemoveEvent(service),
    createGuildMemberUpdateEvent(service),
    createGuildBanAddEvent(service),
    createGuildBanRemoveEvent(service),
    createChannelCreateEvent(service),
    createChannelDeleteEvent(service),
    createChannelUpdateEvent(service),
    createRoleCreateEvent(service),
    createRoleDeleteEvent(service),
    createRoleUpdateEvent(service),
    createVoiceStateUpdateEvent(service),
    createInviteCreateEvent(service, inviteTracker),
    createInviteDeleteEvent(service, inviteTracker),
    createThreadCreateEvent(service),
    createThreadDeleteEvent(service),
    createThreadUpdateEvent(service),
    createGuildUpdateEvent(service),
    createEmojiCreateEvent(service),
    createEmojiDeleteEvent(service),
    createEmojiUpdateEvent(service)
  ]
}

function createClientReadyEvent(
  inviteTracker: InviteTracker
): DiscordEventHandler<typeof Events.ClientReady> {
  return {
    name: Events.ClientReady,
    once: true,
    execute: async (client) => {
      await inviteTracker.cacheGuilds(client.guilds.cache.values())
    }
  }
}

function createGuildCreateEvent(
  inviteTracker: InviteTracker
): DiscordEventHandler<typeof Events.GuildCreate> {
  return {
    name: Events.GuildCreate,
    execute: async (guild) => {
      await inviteTracker.cacheGuildInvites(guild)
    }
  }
}

function createGuildDeleteEvent(
  inviteTracker: InviteTracker
): DiscordEventHandler<typeof Events.GuildDelete> {
  return {
    name: Events.GuildDelete,
    execute: (guild) => {
      inviteTracker.forgetGuild(guild.id)
    }
  }
}

function createMessageDeleteEvent(
  service: EventLogService
): DiscordEventHandler<typeof Events.MessageDelete> {
  return {
    name: Events.MessageDelete,
    execute: async (message) => {
      if (!message.guild || message.author?.bot) {
        return
      }

      const audit = message.author
        ? await findRecentAuditLogEntry(
            message.guild,
            AuditLogEvent.MessageDelete,
            targetHasId(message.author.id)
          )
        : undefined

      await service.send(message.guild, 'message', createMessageDeletedEmbed(message, audit))
    }
  }
}

function createMessageUpdateEvent(
  service: EventLogService
): DiscordEventHandler<typeof Events.MessageUpdate> {
  return {
    name: Events.MessageUpdate,
    execute: async (before, after) => {
      if (!after.guild || after.author?.bot) {
        return
      }

      const embed = createMessageEditedEmbed(before, after)

      if (embed) {
        await service.send(after.guild, 'message', embed)
      }
    }
  }
}

function createMessageBulkDeleteEvent(
  service: EventLogService
): DiscordEventHandler<typeof Events.MessageBulkDelete> {
  return {
    name: Events.MessageBulkDelete,
    execute: async (messages, channel) => {
      const audit = await findRecentAuditLogEntry(
        channel.guild,
        AuditLogEvent.MessageBulkDelete,
        targetHasId(channel.id)
      )

      await service.send(
        channel.guild,
        'message',
        createMessagesPurgedEmbed(messages, channel, audit)
      )
    }
  }
}

function createGuildMemberAddEvent(
  service: EventLogService,
  inviteTracker: InviteTracker
): DiscordEventHandler<typeof Events.GuildMemberAdd> {
  return {
    name: Events.GuildMemberAdd,
    execute: async (member) => {
      if (member.user.bot) {
        return
      }

      const inviteDetails = await inviteTracker.detectUsedInvite(member.guild)

      await service.send(member.guild, 'member', createMemberJoinedEmbed(member, inviteDetails))
    }
  }
}

function createGuildMemberRemoveEvent(
  service: EventLogService
): DiscordEventHandler<typeof Events.GuildMemberRemove> {
  return {
    name: Events.GuildMemberRemove,
    execute: async (member) => {
      if (member.user.bot) {
        return
      }

      const kick = await findRecentAuditLogEntry(
        member.guild,
        AuditLogEvent.MemberKick,
        targetHasId(member.id)
      )

      if (kick) {
        await service.send(member.guild, 'moderation', createMemberKickedEmbed(member, kick))
        return
      }

      await service.send(member.guild, 'member', createMemberLeftEmbed(member))
    }
  }
}

function createGuildMemberUpdateEvent(
  service: EventLogService
): DiscordEventHandler<typeof Events.GuildMemberUpdate> {
  return {
    name: Events.GuildMemberUpdate,
    execute: async (before, after) => {
      if (after.user.bot) {
        return
      }

      const memberAudit = await findRecentAuditLogEntry(
        after.guild,
        AuditLogEvent.MemberUpdate,
        targetHasId(after.id)
      )
      const roleAudit = await findRecentAuditLogEntry(
        after.guild,
        AuditLogEvent.MemberRoleUpdate,
        targetHasId(after.id)
      )
      const timeoutEmbed =
        !before.communicationDisabledUntilTimestamp && after.communicationDisabledUntilTimestamp
          ? createMemberTimeoutEmbed(after, memberAudit)
          : undefined
      const timeoutRemovedEmbed =
        before.communicationDisabledUntilTimestamp && !after.communicationDisabledUntilTimestamp
          ? createMemberTimeoutRemovedEmbed(after, memberAudit)
          : undefined
      const roleEmbed = createMemberRolesChangedEmbed(before, after, roleAudit)
      const nicknameEmbed = createMemberNicknameChangedEmbed(before, after, memberAudit)

      for (const [category, embed] of [
        ['moderation', timeoutEmbed],
        ['moderation', timeoutRemovedEmbed],
        ['member', roleEmbed],
        ['member', nicknameEmbed]
      ] as const) {
        if (embed) {
          await service.send(after.guild, category, embed)
        }
      }
    }
  }
}

function createGuildBanAddEvent(
  service: EventLogService
): DiscordEventHandler<typeof Events.GuildBanAdd> {
  return {
    name: Events.GuildBanAdd,
    execute: async (ban) => {
      if (ban.user.bot) {
        return
      }

      const audit = await findRecentAuditLogEntry(
        ban.guild,
        AuditLogEvent.MemberBanAdd,
        targetHasId(ban.user.id)
      )

      await service.send(ban.guild, 'moderation', createMemberBanEmbed(ban.user, audit, ban.reason))
    }
  }
}

function createGuildBanRemoveEvent(
  service: EventLogService
): DiscordEventHandler<typeof Events.GuildBanRemove> {
  return {
    name: Events.GuildBanRemove,
    execute: async (ban) => {
      if (ban.user.bot) {
        return
      }

      const audit = await findRecentAuditLogEntry(
        ban.guild,
        AuditLogEvent.MemberBanRemove,
        targetHasId(ban.user.id)
      )

      await service.send(ban.guild, 'moderation', createMemberUnbanEmbed(ban.user, audit))
    }
  }
}

function createChannelCreateEvent(
  service: EventLogService
): DiscordEventHandler<typeof Events.ChannelCreate> {
  return {
    name: Events.ChannelCreate,
    execute: async (channel) => {
      const audit = await findRecentAuditLogEntry(
        channel.guild,
        AuditLogEvent.ChannelCreate,
        targetHasId(channel.id)
      )

      await service.send(
        channel.guild,
        'server',
        createChannelEmbed('チャンネル作成', 'channel_create', channel, audit)
      )
    }
  }
}

function createChannelDeleteEvent(
  service: EventLogService
): DiscordEventHandler<typeof Events.ChannelDelete> {
  return {
    name: Events.ChannelDelete,
    execute: async (channel) => {
      if (!isGuildBasedChannel(channel)) {
        return
      }

      const audit = await findRecentAuditLogEntry(
        channel.guild,
        AuditLogEvent.ChannelDelete,
        targetHasId(channel.id)
      )

      await service.send(
        channel.guild,
        'server',
        createChannelEmbed('チャンネル削除', 'channel_delete', channel, audit)
      )
    }
  }
}

function createChannelUpdateEvent(
  service: EventLogService
): DiscordEventHandler<typeof Events.ChannelUpdate> {
  return {
    name: Events.ChannelUpdate,
    execute: async (before, after) => {
      if (!isGuildBasedChannel(before) || !isGuildBasedChannel(after)) {
        return
      }

      const audit = await findRecentAuditLogEntry(
        after.guild,
        AuditLogEvent.ChannelUpdate,
        targetHasId(after.id)
      )
      const embed = createChannelUpdatedEmbed(before, after, audit)

      if (embed) {
        await service.send(after.guild, 'server', embed)
      }
    }
  }
}

function createRoleCreateEvent(
  service: EventLogService
): DiscordEventHandler<typeof Events.GuildRoleCreate> {
  return {
    name: Events.GuildRoleCreate,
    execute: async (role) => {
      const audit = await findRecentAuditLogEntry(
        role.guild,
        AuditLogEvent.RoleCreate,
        targetHasId(role.id)
      )
      await service.send(
        role.guild,
        'server',
        createRoleEmbed('ロール作成', 'role_create', role, audit)
      )
    }
  }
}

function createRoleDeleteEvent(
  service: EventLogService
): DiscordEventHandler<typeof Events.GuildRoleDelete> {
  return {
    name: Events.GuildRoleDelete,
    execute: async (role) => {
      const audit = await findRecentAuditLogEntry(
        role.guild,
        AuditLogEvent.RoleDelete,
        targetHasId(role.id)
      )
      await service.send(
        role.guild,
        'server',
        createRoleEmbed('ロール削除', 'role_delete', role, audit)
      )
    }
  }
}

function createRoleUpdateEvent(
  service: EventLogService
): DiscordEventHandler<typeof Events.GuildRoleUpdate> {
  return {
    name: Events.GuildRoleUpdate,
    execute: async (before, after) => {
      const audit = await findRecentAuditLogEntry(
        after.guild,
        AuditLogEvent.RoleUpdate,
        targetHasId(after.id)
      )
      const embed = createRoleUpdatedEmbed(before, after, audit)

      if (embed) {
        await service.send(after.guild, 'server', embed)
      }
    }
  }
}

function createVoiceStateUpdateEvent(
  service: EventLogService
): DiscordEventHandler<typeof Events.VoiceStateUpdate> {
  return {
    name: Events.VoiceStateUpdate,
    execute: async (before, after) => {
      const embed = createVoiceStateEmbed(before, after)

      if (embed) {
        await service.send(after.guild, 'voice', embed)
      }
    }
  }
}

function createInviteCreateEvent(
  service: EventLogService,
  inviteTracker: InviteTracker
): DiscordEventHandler<typeof Events.InviteCreate> {
  return {
    name: Events.InviteCreate,
    execute: async (invite) => {
      if (!(invite.guild instanceof Guild)) {
        return
      }

      inviteTracker.setInvite(invite.guild, invite)
      await service.send(invite.guild, 'server', createInviteCreatedEmbed(invite))
    }
  }
}

function createInviteDeleteEvent(
  service: EventLogService,
  inviteTracker: InviteTracker
): DiscordEventHandler<typeof Events.InviteDelete> {
  return {
    name: Events.InviteDelete,
    execute: async (invite) => {
      if (!(invite.guild instanceof Guild)) {
        return
      }

      inviteTracker.deleteInvite(invite.guild, invite.code)
      const audit = await findRecentAuditLogEntry(
        invite.guild,
        AuditLogEvent.InviteDelete,
        targetHasCode(invite.code)
      )

      await service.send(invite.guild, 'server', createInviteDeletedEmbed(invite, audit))
    }
  }
}

function createThreadCreateEvent(
  service: EventLogService
): DiscordEventHandler<typeof Events.ThreadCreate> {
  return {
    name: Events.ThreadCreate,
    execute: async (thread) => {
      const audit = await findRecentAuditLogEntry(
        thread.guild,
        AuditLogEvent.ThreadCreate,
        targetHasId(thread.id)
      )

      await service.send(
        thread.guild,
        'server',
        createThreadEmbed('スレッド作成', 'thread_create', thread, audit)
      )
    }
  }
}

function createThreadDeleteEvent(
  service: EventLogService
): DiscordEventHandler<typeof Events.ThreadDelete> {
  return {
    name: Events.ThreadDelete,
    execute: async (thread) => {
      const audit = await findRecentAuditLogEntry(
        thread.guild,
        AuditLogEvent.ThreadDelete,
        targetHasId(thread.id)
      )

      await service.send(
        thread.guild,
        'server',
        createThreadEmbed('スレッド削除', 'thread_delete', thread, audit)
      )
    }
  }
}

function createThreadUpdateEvent(
  service: EventLogService
): DiscordEventHandler<typeof Events.ThreadUpdate> {
  return {
    name: Events.ThreadUpdate,
    execute: async (before, after) => {
      const audit = await findRecentAuditLogEntry(
        after.guild,
        AuditLogEvent.ThreadUpdate,
        targetHasId(after.id)
      )
      const embed = createThreadUpdatedEmbed(before, after, audit)

      if (embed) {
        await service.send(after.guild, 'server', embed)
      }
    }
  }
}

function createGuildUpdateEvent(
  service: EventLogService
): DiscordEventHandler<typeof Events.GuildUpdate> {
  return {
    name: Events.GuildUpdate,
    execute: async (before, after) => {
      const audit = await findRecentAuditLogEntry(
        after,
        AuditLogEvent.GuildUpdate,
        targetHasId(after.id)
      )
      const embed = createGuildUpdatedEmbed(before, after, audit)

      if (embed) {
        await service.send(after, 'server', embed)
      }
    }
  }
}

function createEmojiCreateEvent(
  service: EventLogService
): DiscordEventHandler<typeof Events.GuildEmojiCreate> {
  return {
    name: Events.GuildEmojiCreate,
    execute: async (emoji) => {
      const audit = await findRecentAuditLogEntry(
        emoji.guild,
        AuditLogEvent.EmojiCreate,
        targetHasId(emoji.id)
      )
      await service.send(
        emoji.guild,
        'server',
        createEmojiEmbed('絵文字作成', emoji, undefined, audit)
      )
    }
  }
}

function createEmojiDeleteEvent(
  service: EventLogService
): DiscordEventHandler<typeof Events.GuildEmojiDelete> {
  return {
    name: Events.GuildEmojiDelete,
    execute: async (emoji) => {
      const audit = await findRecentAuditLogEntry(
        emoji.guild,
        AuditLogEvent.EmojiDelete,
        targetHasId(emoji.id)
      )
      await service.send(
        emoji.guild,
        'server',
        createEmojiEmbed('絵文字削除', emoji, undefined, audit)
      )
    }
  }
}

function createEmojiUpdateEvent(
  service: EventLogService
): DiscordEventHandler<typeof Events.GuildEmojiUpdate> {
  return {
    name: Events.GuildEmojiUpdate,
    execute: async (before, after) => {
      const details =
        before.name !== after.name ? `**名前:** ${before.name} -> ${after.name}` : undefined

      if (!details) {
        return
      }

      const audit = await findRecentAuditLogEntry(
        after.guild,
        AuditLogEvent.EmojiUpdate,
        targetHasId(after.id)
      )
      await service.send(
        after.guild,
        'server',
        createEmojiEmbed('絵文字更新', after, details, audit)
      )
    }
  }
}

function isGuildBasedChannel(channel: unknown): channel is GuildBasedChannel {
  return typeof channel === 'object' && channel !== null && 'guild' in channel
}

class InviteTracker {
  private readonly cache = new Map<string, Map<string, InviteCacheEntry>>()

  async cacheGuilds(guilds: Iterable<Guild>): Promise<void> {
    for (const guild of guilds) {
      await this.cacheGuildInvites(guild)
    }
  }

  async cacheGuildInvites(guild: Guild): Promise<void> {
    const invites = await fetchGuildInvites(guild)

    if (invites) {
      this.cache.set(guild.id, createInviteCache(invites.values()))
    }
  }

  forgetGuild(guildId: string): void {
    this.cache.delete(guildId)
  }

  setInvite(guild: Guild, invite: Invite): void {
    const guildCache = this.cache.get(guild.id) ?? new Map<string, InviteCacheEntry>()
    guildCache.set(invite.code, createInviteCacheEntry(invite))
    this.cache.set(guild.id, guildCache)
  }

  deleteInvite(guild: Guild, inviteCode: string): void {
    this.cache.get(guild.id)?.delete(inviteCode)
  }

  async detectUsedInvite(guild: Guild): Promise<MemberJoinInviteDetails | undefined> {
    const oldCache = this.cache.get(guild.id) ?? new Map<string, InviteCacheEntry>()
    const invites = await fetchGuildInvites(guild)

    if (!invites) {
      return undefined
    }

    const newCache = createInviteCache(invites.values())
    const usedInvite =
      findInviteWithIncreasedUses(oldCache, newCache) ??
      findInviteMissingAfterJoin(oldCache, newCache)

    this.cache.set(guild.id, newCache)

    if (!usedInvite) {
      const vanity = await fetchVanityData(guild)

      if (vanity?.code) {
        return { type: 'vanity', code: vanity.code, uses: vanity.uses }
      }

      return undefined
    }

    return {
      type: 'invite',
      code: usedInvite.code,
      inviterId: usedInvite.inviterId,
      inviterTotalUses: calculateInviterTotalUses(usedInvite, newCache)
    }
  }
}

async function fetchGuildInvites(guild: Guild): Promise<ReadonlyMap<string, Invite> | undefined> {
  return guild.invites.fetch({ cache: false }).catch(() => undefined)
}

async function fetchVanityData(guild: Guild): Promise<Vanity | undefined> {
  return guild.fetchVanityData().catch(() => undefined)
}

function createInviteCache(invites: Iterable<Invite>): Map<string, InviteCacheEntry> {
  return new Map(Array.from(invites, (invite) => [invite.code, createInviteCacheEntry(invite)]))
}

function createInviteCacheEntry(invite: Invite): InviteCacheEntry {
  return {
    code: invite.code,
    uses: invite.uses ?? 0,
    inviterId: invite.inviter?.id ?? undefined
  }
}

function findInviteWithIncreasedUses(
  oldCache: ReadonlyMap<string, InviteCacheEntry>,
  newCache: ReadonlyMap<string, InviteCacheEntry>
): InviteCacheEntry | undefined {
  let usedInvite: InviteCacheEntry | undefined
  let largestIncrease = 0

  for (const [code, newInvite] of newCache) {
    const oldInvite = oldCache.get(code)
    const increase = oldInvite ? newInvite.uses - oldInvite.uses : 0

    if (increase > largestIncrease) {
      usedInvite = newInvite
      largestIncrease = increase
    }
  }

  return usedInvite
}

function findInviteMissingAfterJoin(
  oldCache: ReadonlyMap<string, InviteCacheEntry>,
  newCache: ReadonlyMap<string, InviteCacheEntry>
): InviteCacheEntry | undefined {
  for (const [code, oldInvite] of oldCache) {
    if (!newCache.has(code)) {
      return oldInvite
    }
  }

  return undefined
}

function calculateInviterTotalUses(
  usedInvite: InviteCacheEntry,
  newCache: ReadonlyMap<string, InviteCacheEntry>
): number | undefined {
  if (!usedInvite.inviterId) {
    return undefined
  }

  let totalUses = 0
  for (const invite of newCache.values()) {
    if (invite.inviterId === usedInvite.inviterId) {
      totalUses += invite.uses
    }
  }

  if (!newCache.has(usedInvite.code)) {
    totalUses += usedInvite.uses
  }

  return totalUses
}

async function findRecentAuditLogEntry(
  guild: Guild,
  action: AuditLogEvent,
  matcher: TargetMatcher
): Promise<EventLogAuditDetails | undefined> {
  const auditLogs = await guild.fetchAuditLogs({ limit: 8, type: action }).catch(() => undefined)

  if (!auditLogs) {
    return undefined
  }

  const now = Date.now()
  const entry = auditLogs.entries.find(
    (candidate) => matcher(candidate.target) && now - candidate.createdTimestamp < 10_000
  )

  if (!entry) {
    return undefined
  }

  return {
    actorId: entry.executor?.id,
    reason: entry.reason
  }
}

function targetHasId(targetId: string): TargetMatcher {
  return (target) => {
    if (typeof target !== 'object' || target === null || !('id' in target)) {
      return false
    }

    const { id } = target as { id?: unknown }
    return id === targetId
  }
}

function targetHasCode(code: string): TargetMatcher {
  return (target) => {
    if (typeof target !== 'object' || target === null || !('code' in target)) {
      return false
    }

    const { code: targetCode } = target as { code?: unknown }
    return targetCode === code
  }
}
