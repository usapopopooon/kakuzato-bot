import {
  ChannelType,
  EmbedBuilder,
  GuildDefaultMessageNotifications,
  GuildExplicitContentFilter,
  GuildMFALevel,
  GuildVerificationLevel,
  OverwriteType,
  PermissionsBitField,
  type AnyThreadChannel,
  type Attachment,
  type Guild,
  type GuildBasedChannel,
  type GuildEmoji,
  type GuildMember,
  type Invite,
  type Message,
  type PartialGuildMember,
  type PartialMessage,
  type PermissionsString,
  type ReadonlyCollection,
  type Role,
  type Snowflake,
  type User,
  type VoiceState
} from 'discord.js'

export type EventLogType =
  | 'message_delete'
  | 'message_edit'
  | 'message_purge'
  | 'member_join'
  | 'member_leave'
  | 'member_kick'
  | 'member_ban'
  | 'member_unban'
  | 'member_timeout'
  | 'role_change'
  | 'nickname_change'
  | 'channel_create'
  | 'channel_delete'
  | 'channel_update'
  | 'role_create'
  | 'role_delete'
  | 'role_update'
  | 'voice_state'
  | 'invite_create'
  | 'invite_delete'
  | 'thread_create'
  | 'thread_delete'
  | 'thread_update'
  | 'server_update'
  | 'emoji_update'

export type EventLogAuditDetails = {
  actorId?: string
  reason?: string | null
}

export type MemberJoinInviteDetails =
  | {
      type: 'invite'
      code: string
      inviterId?: string
      inviterTotalUses?: number
    }
  | {
      type: 'vanity'
      code?: string | null
      uses?: number
    }

const colors: Record<EventLogType, number> = {
  message_delete: 0xe74c3c,
  message_edit: 0xe67e22,
  message_purge: 0xe74c3c,
  member_join: 0x2ecc71,
  member_leave: 0xe74c3c,
  member_kick: 0xe67e22,
  member_ban: 0xe74c3c,
  member_unban: 0x2ecc71,
  member_timeout: 0xf1c40f,
  role_change: 0xe67e22,
  nickname_change: 0x3498db,
  channel_create: 0x2ecc71,
  channel_delete: 0xe74c3c,
  channel_update: 0xe67e22,
  role_create: 0x2ecc71,
  role_delete: 0xe74c3c,
  role_update: 0xe67e22,
  voice_state: 0x3498db,
  invite_create: 0x2ecc71,
  invite_delete: 0xe74c3c,
  thread_create: 0x2ecc71,
  thread_delete: 0xe74c3c,
  thread_update: 0xe67e22,
  server_update: 0xe67e22,
  emoji_update: 0xe67e22
}

const permissionLabels: Partial<Record<PermissionsString, string>> = {
  CreateInstantInvite: '招待を作成',
  KickMembers: 'メンバーをキック',
  BanMembers: 'メンバーをBAN',
  Administrator: '管理者',
  ManageChannels: 'チャンネル管理',
  ManageGuild: 'サーバー管理',
  AddReactions: 'リアクションを追加',
  ViewAuditLog: '監査ログを表示',
  PrioritySpeaker: '優先スピーカー',
  Stream: '配信',
  ViewChannel: 'チャンネルを見る',
  SendMessages: 'メッセージを送信',
  SendTTSMessages: 'TTSメッセージを送信',
  ManageMessages: 'メッセージ管理',
  EmbedLinks: '埋め込みリンク',
  AttachFiles: 'ファイル添付',
  ReadMessageHistory: 'メッセージ履歴を読む',
  MentionEveryone: '@everyone/@here',
  UseExternalEmojis: '外部絵文字を使用',
  ViewGuildInsights: 'サーバーインサイトを表示',
  Connect: 'ボイス接続',
  Speak: '発言',
  MuteMembers: 'メンバーをミュート',
  DeafenMembers: 'メンバーのスピーカーをミュート',
  MoveMembers: 'メンバーを移動',
  UseVAD: '音声検出を使用',
  ChangeNickname: 'ニックネーム変更',
  ManageNicknames: 'ニックネーム管理',
  ManageRoles: 'ロール管理',
  ManageWebhooks: 'Webhook管理',
  ManageEmojisAndStickers: '絵文字とスタンプ管理',
  ManageGuildExpressions: '絵文字/スタンプ/サウンド管理',
  UseApplicationCommands: 'アプリコマンドを使用',
  RequestToSpeak: 'スピーカー参加をリクエスト',
  ManageEvents: 'イベント管理',
  ManageThreads: 'スレッド管理',
  CreatePublicThreads: '公開スレッド作成',
  CreatePrivateThreads: 'プライベートスレッド作成',
  UseExternalStickers: '外部スタンプを使用',
  SendMessagesInThreads: 'スレッドでメッセージ送信',
  UseEmbeddedActivities: 'アクティビティを使用',
  ModerateMembers: 'メンバーをタイムアウト',
  ViewCreatorMonetizationAnalytics: '収益化分析を表示',
  UseSoundboard: 'サウンドボードを使用',
  CreateGuildExpressions: '絵文字/スタンプ/サウンド作成',
  CreateEvents: 'イベント作成',
  UseExternalSounds: '外部サウンドを使用',
  SendVoiceMessages: 'ボイスメッセージ送信',
  SetVoiceChannelStatus: 'ボイスチャンネルステータス設定',
  SendPolls: '投票を送信',
  UseExternalApps: '外部アプリを使用',
  PinMessages: 'メッセージをピン留め',
  BypassSlowmode: '低速モードを無視'
}

const verificationLevelLabels: Record<number, string> = {
  [GuildVerificationLevel.None]: 'なし',
  [GuildVerificationLevel.Low]: '低 (メール認証)',
  [GuildVerificationLevel.Medium]: '中 (登録後5分以上)',
  [GuildVerificationLevel.High]: '高 (参加後10分以上)',
  [GuildVerificationLevel.VeryHigh]: '最高 (電話番号認証)'
}

const defaultNotificationLabels: Record<number, string> = {
  [GuildDefaultMessageNotifications.AllMessages]: 'すべてのメッセージ',
  [GuildDefaultMessageNotifications.OnlyMentions]: 'メンションのみ'
}

const explicitContentFilterLabels: Record<number, string> = {
  [GuildExplicitContentFilter.Disabled]: '無効',
  [GuildExplicitContentFilter.MembersWithoutRoles]: 'ロールなしメンバーのみ',
  [GuildExplicitContentFilter.AllMembers]: '全メンバー'
}

const mfaLevelLabels: Record<number, string> = {
  [GuildMFALevel.None]: 'なし',
  [GuildMFALevel.Elevated]: '管理操作に2FA必須'
}

export function createLogEmbed(title: string, type: EventLogType): EmbedBuilder {
  const now = new Date()
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(colors[type])
    .setTimestamp(now)
    .setFooter({ text: `記録時刻: ${formatJst(now)}` })
}

export function createMessageDeletedEmbed(
  message: Message | PartialMessage,
  audit?: EventLogAuditDetails
): EmbedBuilder {
  const embed = createLogEmbed('メッセージ削除', 'message_delete')
  const attachments = getMessageAttachments(message)

  embed.addFields(
    { name: '投稿者', value: formatUser(message.author), inline: true },
    { name: 'チャンネル', value: formatChannel(message.channel), inline: true },
    { name: 'メッセージID', value: inlineCode(message.id), inline: true },
    {
      name: '投稿日時',
      value: formatJstTimestamp(message.createdTimestamp),
      inline: true
    },
    {
      name: '本文',
      value: formatCodeBlock(message.content, '(本文なし / 取得不可)'),
      inline: false
    }
  )
  addAuditFields(embed, audit, { actorLabel: '削除した人', showUnknown: true })
  addAttachmentFields(embed, attachments)

  if (message.author?.displayAvatarURL()) {
    embed.setThumbnail(message.author.displayAvatarURL())
  }

  const firstImage = attachments.find(isImageAttachment)
  if (firstImage) {
    embed.setImage(firstImage.url)
  }

  return embed
}

export function createMessagesPurgedEmbed(
  messages: ReadonlyCollection<Snowflake, Message<true> | PartialMessage<true>>,
  channel: { id: string; guild: Guild; toString(): string },
  audit?: EventLogAuditDetails
): EmbedBuilder {
  const authors = Array.from(
    new Set(
      messages
        .map((message) => message.author?.tag)
        .filter((author): author is string => Boolean(author))
    )
  )
  const ids = messages.map((message) => message.id)
  const createdTimestamps = messages
    .map((message) => message.createdTimestamp)
    .filter((timestamp) => timestamp > 0)
  const embed = createLogEmbed('メッセージ一括削除', 'message_purge')

  embed.addFields(
    { name: 'チャンネル', value: formatChannel(channel), inline: true },
    { name: '削除数', value: String(messages.size), inline: true },
    {
      name: '投稿者',
      value: authors.length > 0 ? truncateContent(authors.join(', ')) : '不明',
      inline: false
    },
    {
      name: 'メッセージID',
      value: truncateContent(ids.map(inlineCode).join(', ')),
      inline: false
    }
  )

  if (createdTimestamps.length > 0) {
    embed.addFields({
      name: '投稿日時範囲',
      value: `${formatJstTimestamp(Math.min(...createdTimestamps))} - ${formatJstTimestamp(
        Math.max(...createdTimestamps)
      )}`,
      inline: false
    })
  }

  addAuditFields(embed, audit, { actorLabel: '削除した人', showUnknown: true })

  return embed
}

export function createMessageEditedEmbed(
  before: Message | PartialMessage,
  after: Message | PartialMessage
): EmbedBuilder | undefined {
  const beforeAttachments = getMessageAttachments(before)
  const afterAttachments = getMessageAttachments(after)
  const attachmentChanges = formatAttachmentChanges(beforeAttachments, afterAttachments)

  if (before.content === after.content && !attachmentChanges) {
    return undefined
  }

  const embed = createLogEmbed('メッセージ編集', 'message_edit')
  embed.addFields(
    { name: '投稿者', value: formatUser(after.author), inline: true },
    { name: 'チャンネル', value: formatChannel(after.channel), inline: true },
    { name: 'メッセージID', value: inlineCode(after.id), inline: true },
    { name: '投稿日時', value: formatJstTimestamp(after.createdTimestamp), inline: true },
    {
      name: '編集日時',
      value: formatJstTimestamp(after.editedTimestamp ?? Date.now()),
      inline: true
    },
    {
      name: '編集前',
      value: formatCodeBlock(before.content, '(本文なし / 取得不可)'),
      inline: false
    },
    {
      name: '編集後',
      value: formatCodeBlock(after.content, '(本文なし / 取得不可)'),
      inline: false
    }
  )

  const urlChanges = formatSetChanges(
    extractUrls(before.content ?? ''),
    extractUrls(after.content ?? '')
  )
  if (urlChanges) {
    embed.addFields({ name: 'URL変更', value: truncateContent(urlChanges), inline: false })
  }

  const mentionChanges = formatSetChanges(
    extractUserMentions(before.content ?? ''),
    extractUserMentions(after.content ?? '')
  )
  if (mentionChanges) {
    embed.addFields({
      name: 'メンション変更',
      value: truncateContent(mentionChanges),
      inline: false
    })
  }

  if (attachmentChanges) {
    embed.addFields({ name: '添付ファイル変更', value: attachmentChanges, inline: false })
  }

  if (after.url) {
    embed.addFields({ name: 'ジャンプ', value: `[メッセージを開く](${after.url})`, inline: false })
  }

  if (after.author?.displayAvatarURL()) {
    embed.setThumbnail(after.author.displayAvatarURL())
  }

  return embed
}

export function createMemberJoinedEmbed(
  member: GuildMember,
  inviteDetails?: MemberJoinInviteDetails
): EmbedBuilder {
  const accountAgeDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000)
  const embed = createLogEmbed('メンバー参加', 'member_join')

  embed.addFields(
    { name: 'ユーザー', value: formatUser(member.user), inline: true },
    {
      name: 'アカウント作成',
      value: formatJstTimestamp(member.user.createdTimestamp),
      inline: true
    },
    { name: 'アカウント年齢', value: `${accountAgeDays}日`, inline: true },
    {
      name: '参加日時',
      value: formatJstTimestamp(member.joinedTimestamp ?? Date.now()),
      inline: true
    },
    { name: '現在のメンバー数', value: String(member.guild.memberCount), inline: true }
  )
  addMemberJoinInviteFields(embed, inviteDetails)
  embed.setThumbnail(member.displayAvatarURL())

  return embed
}

function addMemberJoinInviteFields(
  embed: EmbedBuilder,
  inviteDetails: MemberJoinInviteDetails | undefined
): void {
  if (!inviteDetails) {
    return
  }

  if (inviteDetails.type === 'vanity') {
    embed.addFields({
      name: '参加元',
      value: inviteDetails.code ? `Vanity URL (${inlineCode(inviteDetails.code)})` : 'Vanity URL',
      inline: true
    })

    if (typeof inviteDetails.uses === 'number') {
      embed.addFields({
        name: 'Vanity URL使用回数',
        value: String(inviteDetails.uses),
        inline: true
      })
    }
    return
  }

  embed.addFields({ name: '招待コード', value: inlineCode(inviteDetails.code), inline: true })
  embed.addFields({
    name: '招待作成者',
    value: inviteDetails.inviterId
      ? `<@${inviteDetails.inviterId}>\nID: ${inlineCode(inviteDetails.inviterId)}`
      : '不明',
    inline: true
  })

  if (typeof inviteDetails.inviterTotalUses === 'number') {
    embed.addFields({
      name: '作成者の招待使用回数',
      value: String(inviteDetails.inviterTotalUses),
      inline: true
    })
  }
}

export function createMemberLeftEmbed(member: GuildMember | PartialGuildMember): EmbedBuilder {
  const roles = member.roles.cache
    .filter((role) => role.id !== member.guild.id)
    .map((role) => `${role.toString()} (${role.name})`)
    .join(', ')
  const embed = createLogEmbed('メンバー退出', 'member_leave')

  embed.addFields(
    { name: 'ユーザー', value: formatUser(member.user), inline: true },
    {
      name: '参加日時',
      value: member.joinedTimestamp ? formatJstTimestamp(member.joinedTimestamp) : '不明',
      inline: true
    },
    { name: '保持していたロール', value: truncateContent(roles || 'なし'), inline: false }
  )
  embed.setThumbnail(member.displayAvatarURL())

  return embed
}

export function createMemberKickedEmbed(
  member: GuildMember | PartialGuildMember,
  audit?: EventLogAuditDetails
): EmbedBuilder {
  const embed = createLogEmbed('メンバーKick', 'member_kick')

  embed.addFields({ name: '対象ユーザー', value: formatUser(member.user), inline: true })
  addAuditFields(embed, audit, { actorLabel: '実行者', showUnknown: true })
  embed.setThumbnail(member.displayAvatarURL())

  return embed
}

export function createMemberBanEmbed(
  user: User,
  audit?: EventLogAuditDetails,
  fallbackReason?: string | null
): EmbedBuilder {
  const embed = createLogEmbed('メンバーBAN', 'member_ban')
  embed.addFields({ name: '対象ユーザー', value: formatUser(user), inline: true })
  addAuditFields(embed, mergeAuditReason(audit, fallbackReason), {
    actorLabel: '実行者',
    showUnknown: true
  })
  embed.setThumbnail(user.displayAvatarURL())
  return embed
}

export function createMemberTimeoutEmbed(
  member: GuildMember,
  audit?: EventLogAuditDetails
): EmbedBuilder | undefined {
  if (!member.communicationDisabledUntilTimestamp) {
    return undefined
  }

  const embed = createLogEmbed('メンバータイムアウト', 'member_timeout')
  embed.addFields(
    { name: '対象ユーザー', value: formatUser(member.user), inline: true },
    {
      name: '期限',
      value: formatJstTimestamp(member.communicationDisabledUntilTimestamp),
      inline: true
    }
  )
  addAuditFields(embed, audit, { actorLabel: '実行者', showUnknown: true })
  embed.setThumbnail(member.displayAvatarURL())

  return embed
}

export function createMemberTimeoutRemovedEmbed(
  member: GuildMember,
  audit?: EventLogAuditDetails
): EmbedBuilder {
  const embed = createLogEmbed('タイムアウト解除', 'member_timeout')
  embed.addFields({ name: '対象ユーザー', value: formatUser(member.user), inline: true })
  addAuditFields(embed, audit, { actorLabel: '実行者', showUnknown: true })
  embed.setThumbnail(member.displayAvatarURL())

  return embed
}

export function createMemberRolesChangedEmbed(
  before: GuildMember | PartialGuildMember,
  after: GuildMember,
  audit?: EventLogAuditDetails
): EmbedBuilder | undefined {
  if (!('roles' in before)) {
    return undefined
  }

  const beforeRoleIds = new Set(before.roles.cache.keys())
  const afterRoleIds = new Set(after.roles.cache.keys())
  const added = after.roles.cache.filter(
    (role) => !beforeRoleIds.has(role.id) && role.id !== after.guild.id
  )
  const removed = before.roles.cache.filter(
    (role) => !afterRoleIds.has(role.id) && role.id !== after.guild.id
  )

  if (added.size === 0 && removed.size === 0) {
    return undefined
  }

  const changes = [
    ...added.map((role) => `+ ${role.toString()} (${role.name}) ID: ${role.id}`),
    ...removed.map((role) => `- ${role.toString()} (${role.name}) ID: ${role.id}`)
  ]
  const embed = createLogEmbed('メンバーロール変更', 'role_change')

  embed.addFields(
    { name: '対象ユーザー', value: formatUser(after.user), inline: true },
    { name: '変更内容', value: truncateContent(changes.join('\n')), inline: false }
  )
  addAuditFields(embed, audit, { actorLabel: '実行者', showUnknown: true })
  embed.setThumbnail(after.displayAvatarURL())

  return embed
}

export function createMemberNicknameChangedEmbed(
  before: GuildMember | PartialGuildMember,
  after: GuildMember,
  audit?: EventLogAuditDetails
): EmbedBuilder | undefined {
  if (!('nickname' in before) || before.nickname === after.nickname) {
    return undefined
  }

  const embed = createLogEmbed('ニックネーム変更', 'nickname_change')
  embed.addFields(
    { name: '対象ユーザー', value: formatUser(after.user), inline: true },
    { name: '変更前', value: before.nickname ?? '(なし)', inline: true },
    { name: '変更後', value: after.nickname ?? '(なし)', inline: true }
  )
  addAuditFields(embed, audit, { actorLabel: '実行者' })
  embed.setThumbnail(after.displayAvatarURL())

  return embed
}

export function createMemberUnbanEmbed(user: User, audit?: EventLogAuditDetails): EmbedBuilder {
  const embed = createLogEmbed('BAN解除', 'member_unban')
  embed.addFields({ name: '対象ユーザー', value: formatUser(user), inline: true })
  addAuditFields(embed, audit, { actorLabel: '実行者', showUnknown: true })
  embed.setThumbnail(user.displayAvatarURL())
  return embed
}

export function createChannelEmbed(
  title: string,
  type: Extract<EventLogType, 'channel_create' | 'channel_delete' | 'channel_update'>,
  channel: GuildBasedChannel,
  audit?: EventLogAuditDetails
): EmbedBuilder {
  const embed = createLogEmbed(title, type).addFields(
    { name: 'チャンネル', value: formatChannel(channel), inline: true },
    { name: '種別', value: formatChannelType(channel.type), inline: true },
    { name: '作成日時', value: formatJstTimestamp(channel.createdTimestamp), inline: true }
  )

  const topic = getStringProp(channel, 'topic')
  if (topic) {
    embed.addFields({ name: 'トピック', value: formatCodeBlock(topic, '(なし)'), inline: false })
  }

  addAuditFields(embed, audit, { actorLabel: '実行者', showUnknown: true })

  return embed
}

export function createChannelUpdatedEmbed(
  before: GuildBasedChannel,
  after: GuildBasedChannel,
  audit?: EventLogAuditDetails
): EmbedBuilder | undefined {
  const changes: string[] = []

  pushChange(changes, '名前', before.name, after.name)
  pushChange(changes, 'トピック', getStringProp(before, 'topic'), getStringProp(after, 'topic'))
  pushChange(
    changes,
    '低速モード',
    formatSeconds(getNumberProp(before, 'rateLimitPerUser') ?? 0),
    formatSeconds(getNumberProp(after, 'rateLimitPerUser') ?? 0)
  )
  pushChange(
    changes,
    'NSFW',
    formatBoolean(getBooleanProp(before, 'nsfw') ?? false),
    formatBoolean(getBooleanProp(after, 'nsfw') ?? false)
  )
  pushChange(changes, 'カテゴリ', before.parent?.name ?? '(なし)', after.parent?.name ?? '(なし)')
  pushChange(
    changes,
    'Bitrate',
    formatBitrate(getNumberProp(before, 'bitrate')),
    formatBitrate(getNumberProp(after, 'bitrate'))
  )
  pushChange(
    changes,
    '人数上限',
    formatUserLimit(getNumberProp(before, 'userLimit')),
    formatUserLimit(getNumberProp(after, 'userLimit'))
  )

  const beforeOverwrites = formatPermissionOverwrites(before)
  const afterOverwrites = formatPermissionOverwrites(after)
  const overwriteChanged = beforeOverwrites !== afterOverwrites
  if (overwriteChanged) {
    changes.push('**権限上書き:** 変更あり')
  }

  if (changes.length === 0) {
    return undefined
  }

  const embed = createLogEmbed('チャンネル更新', 'channel_update').addFields(
    { name: 'チャンネル', value: formatChannel(after), inline: true },
    { name: '種別', value: formatChannelType(after.type), inline: true },
    { name: '変更内容', value: truncateContent(changes.join('\n')), inline: false }
  )

  if (overwriteChanged && afterOverwrites) {
    embed.addFields({
      name: '権限上書き (変更後)',
      value: truncateContent(afterOverwrites),
      inline: false
    })
  }

  addAuditFields(embed, audit, { actorLabel: '実行者', showUnknown: true })

  return embed
}

export function createRoleEmbed(
  title: string,
  type: Extract<EventLogType, 'role_create' | 'role_delete' | 'role_update'>,
  role: Role,
  audit?: EventLogAuditDetails
): EmbedBuilder {
  const embed = createLogEmbed(title, type).addFields(
    {
      name: 'ロール',
      value: `${role.toString()} (${role.name})\nID: ${inlineCode(role.id)}`,
      inline: true
    },
    { name: '色', value: role.hexColor, inline: true },
    { name: '作成日時', value: formatJstTimestamp(role.createdTimestamp), inline: true },
    {
      name: '設定',
      value: `表示分離: ${formatBoolean(role.hoist)} / メンション可能: ${formatBoolean(role.mentionable)}`,
      inline: false
    },
    {
      name: '権限',
      value: truncateContent(formatPermissionBitfield(role.permissions.bitfield)),
      inline: false
    }
  )
  addAuditFields(embed, audit, { actorLabel: '実行者', showUnknown: true })
  return embed
}

export function createRoleUpdatedEmbed(
  before: Role,
  after: Role,
  audit?: EventLogAuditDetails
): EmbedBuilder | undefined {
  const changes: string[] = []

  pushChange(changes, '名前', before.name, after.name)
  pushChange(changes, '色', before.hexColor, after.hexColor)
  pushChange(changes, '表示分離', formatBoolean(before.hoist), formatBoolean(after.hoist))
  pushChange(
    changes,
    'メンション可能',
    formatBoolean(before.mentionable),
    formatBoolean(after.mentionable)
  )
  pushPermissionChange(changes, before.permissions.bitfield, after.permissions.bitfield)

  if (changes.length === 0) {
    return undefined
  }

  const embed = createLogEmbed('ロール更新', 'role_update').addFields(
    {
      name: 'ロール',
      value: `${after.toString()} (${after.name})\nID: ${inlineCode(after.id)}`,
      inline: true
    },
    { name: '変更内容', value: truncateContent(changes.join('\n')), inline: false }
  )
  addAuditFields(embed, audit, { actorLabel: '実行者', showUnknown: true })

  return embed
}

export function createVoiceStateEmbed(
  before: VoiceState,
  after: VoiceState
): EmbedBuilder | undefined {
  if (before.channelId === after.channelId) {
    return undefined
  }

  const member = after.member ?? before.member

  if (!member || member.user.bot) {
    return undefined
  }

  if (!before.channel && after.channel) {
    return createLogEmbed('ボイス参加', 'voice_state').addFields(
      { name: 'ユーザー', value: formatUser(member.user), inline: true },
      { name: '参加先', value: formatChannel(after.channel), inline: true },
      { name: '現在人数', value: String(after.channel.members.size), inline: true }
    )
  }

  if (before.channel && !after.channel) {
    return createLogEmbed('ボイス退出', 'voice_state').addFields(
      { name: 'ユーザー', value: formatUser(member.user), inline: true },
      { name: '退出元', value: formatChannel(before.channel), inline: true },
      { name: '現在人数', value: String(before.channel.members.size), inline: true }
    )
  }

  if (before.channel && after.channel) {
    return createLogEmbed('ボイス移動', 'voice_state').addFields(
      { name: 'ユーザー', value: formatUser(member.user), inline: true },
      { name: '移動元', value: formatChannel(before.channel), inline: true },
      { name: '移動先', value: formatChannel(after.channel), inline: true }
    )
  }

  return undefined
}

export function createInviteCreatedEmbed(invite: Invite): EmbedBuilder {
  const embed = createLogEmbed('招待作成', 'invite_create')
  embed.addFields(
    { name: 'コード', value: inlineCode(invite.code), inline: true },
    { name: 'URL', value: invite.url, inline: false }
  )

  if (invite.inviter) {
    embed.addFields({ name: '作成者', value: formatUser(invite.inviter), inline: true })
  }

  if (invite.channel) {
    embed.addFields({ name: 'チャンネル', value: formatChannel(invite.channel), inline: true })
  }

  embed.addFields(
    {
      name: '作成日時',
      value: invite.createdTimestamp ? formatJstTimestamp(invite.createdTimestamp) : '不明',
      inline: true
    },
    {
      name: '有効期限',
      value: invite.expiresTimestamp ? formatJstTimestamp(invite.expiresTimestamp) : '無期限',
      inline: true
    },
    {
      name: '最大使用回数',
      value: invite.maxUses ? String(invite.maxUses) : '無制限',
      inline: true
    },
    {
      name: '現在の使用回数',
      value: invite.uses === null ? '不明' : String(invite.uses),
      inline: true
    },
    { name: '一時メンバー', value: formatBoolean(invite.temporary ?? false), inline: true }
  )

  return embed
}

export function createInviteDeletedEmbed(
  invite: Invite,
  audit?: EventLogAuditDetails
): EmbedBuilder {
  const embed = createLogEmbed('招待削除', 'invite_delete')
  embed.addFields({ name: 'コード', value: inlineCode(invite.code), inline: true })

  if (invite.channel) {
    embed.addFields({ name: 'チャンネル', value: formatChannel(invite.channel), inline: true })
  }

  embed.addFields({
    name: 'URL',
    value: invite.url,
    inline: false
  })
  addAuditFields(embed, audit, { actorLabel: '実行者', showUnknown: true })

  return embed
}

export function createThreadEmbed(
  title: string,
  type: Extract<EventLogType, 'thread_create' | 'thread_delete'>,
  thread: AnyThreadChannel,
  audit?: EventLogAuditDetails
): EmbedBuilder {
  const embed = createLogEmbed(title, type).addFields(
    { name: 'スレッド', value: formatChannel(thread), inline: true },
    {
      name: '親チャンネル',
      value: thread.parent ? formatChannel(thread.parent) : '不明',
      inline: true
    },
    { name: '作成日時', value: formatJstTimestamp(thread.createdTimestamp), inline: true },
    { name: 'アーカイブ', value: formatBoolean(thread.archived ?? false), inline: true },
    { name: 'ロック', value: formatBoolean(thread.locked ?? false), inline: true }
  )

  if (thread.ownerId) {
    embed.addFields({
      name: '作成者',
      value: `<@${thread.ownerId}>\nID: ${inlineCode(thread.ownerId)}`,
      inline: true
    })
  }

  addAuditFields(embed, audit, { actorLabel: '実行者', showUnknown: type === 'thread_delete' })

  return embed
}

export function createThreadUpdatedEmbed(
  before: AnyThreadChannel,
  after: AnyThreadChannel,
  audit?: EventLogAuditDetails
): EmbedBuilder | undefined {
  const changes: string[] = []

  pushChange(changes, '名前', before.name, after.name)
  pushChange(
    changes,
    'アーカイブ',
    formatBoolean(before.archived ?? false),
    formatBoolean(after.archived ?? false)
  )
  pushChange(
    changes,
    'ロック',
    formatBoolean(before.locked ?? false),
    formatBoolean(after.locked ?? false)
  )
  pushChange(
    changes,
    '低速モード',
    formatSeconds(before.rateLimitPerUser ?? 0),
    formatSeconds(after.rateLimitPerUser ?? 0)
  )
  pushChange(changes, '自動アーカイブ', before.autoArchiveDuration, after.autoArchiveDuration)

  if (changes.length === 0) {
    return undefined
  }

  const embed = createLogEmbed('スレッド更新', 'thread_update').addFields(
    { name: 'スレッド', value: formatChannel(after), inline: true },
    { name: '変更内容', value: truncateContent(changes.join('\n')), inline: false }
  )
  addAuditFields(embed, audit, { actorLabel: '実行者', showUnknown: true })

  return embed
}

export function createGuildUpdatedEmbed(
  before: Guild,
  after: Guild,
  audit?: EventLogAuditDetails
): EmbedBuilder | undefined {
  const changes: string[] = []

  pushChange(changes, '名前', before.name, after.name)
  pushChange(changes, '説明', before.description, after.description)
  pushChange(
    changes,
    '認証レベル',
    formatEnumLabel(verificationLevelLabels, before.verificationLevel),
    formatEnumLabel(verificationLevelLabels, after.verificationLevel)
  )
  pushChange(
    changes,
    '通知設定',
    formatEnumLabel(defaultNotificationLabels, before.defaultMessageNotifications),
    formatEnumLabel(defaultNotificationLabels, after.defaultMessageNotifications)
  )
  pushChange(
    changes,
    'コンテンツフィルター',
    formatEnumLabel(explicitContentFilterLabels, before.explicitContentFilter),
    formatEnumLabel(explicitContentFilterLabels, after.explicitContentFilter)
  )
  pushChange(
    changes,
    'MFAレベル',
    formatEnumLabel(mfaLevelLabels, before.mfaLevel),
    formatEnumLabel(mfaLevelLabels, after.mfaLevel)
  )
  pushChange(changes, '優先ロケール', before.preferredLocale, after.preferredLocale)
  pushChange(changes, 'AFKチャンネル', before.afkChannel?.name, after.afkChannel?.name)
  pushChange(changes, 'システムチャンネル', before.systemChannel?.name, after.systemChannel?.name)
  pushChange(changes, 'ルールチャンネル', before.rulesChannel?.name, after.rulesChannel?.name)
  pushChange(
    changes,
    '公開アップデートチャンネル',
    before.publicUpdatesChannel?.name,
    after.publicUpdatesChannel?.name
  )

  if (before.icon !== after.icon) {
    changes.push('**アイコン:** 変更あり')
  }
  if (before.banner !== after.banner) {
    changes.push('**バナー:** 変更あり')
  }

  if (changes.length === 0) {
    return undefined
  }

  const embed = createLogEmbed('サーバー設定更新', 'server_update').addFields(
    { name: 'サーバー', value: `${after.name}\nID: ${inlineCode(after.id)}`, inline: true },
    { name: '変更内容', value: truncateContent(changes.join('\n')), inline: false }
  )
  addAuditFields(embed, audit, { actorLabel: '実行者', showUnknown: true })

  return embed
}

export function createEmojiEmbed(
  title: string,
  emoji: GuildEmoji,
  details?: string,
  audit?: EventLogAuditDetails
): EmbedBuilder {
  const embed = createLogEmbed(title, 'emoji_update').addFields(
    {
      name: '絵文字',
      value: `${emoji.toString()} (\`:${emoji.name}:\`)\nID: ${inlineCode(emoji.id)}`,
      inline: true
    },
    { name: '作成日時', value: formatJstTimestamp(emoji.createdTimestamp), inline: true },
    {
      name: '設定',
      value: `アニメーション: ${formatBoolean(emoji.animated)} / 管理対象: ${formatBoolean(emoji.managed)}`,
      inline: false
    }
  )

  if (details) {
    embed.addFields({ name: '変更内容', value: truncateContent(details), inline: false })
  }

  addAuditFields(embed, audit, { actorLabel: '実行者', showUnknown: true })

  const imageUrl = emoji.imageURL()
  if (imageUrl) {
    embed.setThumbnail(imageUrl)
  }

  return embed
}

function addAuditFields(
  embed: EmbedBuilder,
  audit: EventLogAuditDetails | undefined,
  options: { actorLabel: string; showUnknown?: boolean }
): void {
  if (audit?.actorId) {
    embed.addFields({
      name: options.actorLabel,
      value: `<@${audit.actorId}>\nID: ${inlineCode(audit.actorId)}`,
      inline: true
    })
  } else if (options.showUnknown) {
    embed.addFields({
      name: options.actorLabel,
      value: '不明 (Audit Log 取得不可)',
      inline: true
    })
  }

  embed.addFields({
    name: '理由',
    value: formatCodeBlock(audit?.reason, 'なし / 取得不可', 900),
    inline: false
  })
}

function addAttachmentFields(embed: EmbedBuilder, attachments: Attachment[]): void {
  if (attachments.length === 0) {
    return
  }

  embed.addFields(
    {
      name: '添付ファイル',
      value: truncateContent(attachments.map(formatAttachmentLine).join('\n')),
      inline: false
    },
    {
      name: '添付メタデータ',
      value: truncateContent(attachments.map(formatAttachmentMetadata).join('\n')),
      inline: false
    }
  )
}

function getMessageAttachments(message: Message | PartialMessage): Attachment[] {
  return Array.from(message.attachments?.values() ?? [])
}

function formatAttachmentChanges(before: Attachment[], after: Attachment[]): string | undefined {
  const beforeUrls = new Set(before.map((attachment) => attachment.url))
  const afterUrls = new Set(after.map((attachment) => attachment.url))
  const added = after.filter((attachment) => !beforeUrls.has(attachment.url))
  const removed = before.filter((attachment) => !afterUrls.has(attachment.url))
  const lines = [
    ...added.map((attachment) => `+ ${formatAttachmentLine(attachment)}`),
    ...removed.map((attachment) => `- ${formatAttachmentLine(attachment)}`)
  ]

  return lines.length > 0 ? truncateContent(lines.join('\n')) : undefined
}

function formatAttachmentLine(attachment: Attachment): string {
  return `[${escapeLinkLabel(attachment.name)}](${attachment.url}) (${formatBytes(attachment.size)})`
}

function formatAttachmentMetadata(attachment: Attachment): string {
  const dimensions =
    attachment.width && attachment.height ? `, ${attachment.width}x${attachment.height}` : ''
  return `${attachment.name}: ID=${attachment.id}, type=${attachment.contentType ?? 'unknown'}, size=${formatBytes(
    attachment.size
  )}${dimensions}`
}

function formatUser(user: User | null | undefined): string {
  if (!user) {
    return '不明'
  }

  return `${user.toString()} (${user.tag})\nID: ${inlineCode(user.id)}`
}

function formatChannel(channel: { id?: string; toString(): string } | null): string {
  if (!channel?.id) {
    return '不明'
  }

  return `${channel.toString()}\nID: ${inlineCode(channel.id)}`
}

function formatChannelType(type: ChannelType): string {
  const labels: Partial<Record<ChannelType, string>> = {
    [ChannelType.GuildText]: 'テキスト',
    [ChannelType.GuildAnnouncement]: 'アナウンス',
    [ChannelType.GuildVoice]: 'ボイス',
    [ChannelType.GuildStageVoice]: 'ステージ',
    [ChannelType.GuildCategory]: 'カテゴリ',
    [ChannelType.GuildForum]: 'フォーラム',
    [ChannelType.GuildMedia]: 'メディア'
  }

  return labels[type] ?? `不明 (${type})`
}

export function formatJst(date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  const year = jst.getUTCFullYear()
  const month = pad2(jst.getUTCMonth() + 1)
  const day = pad2(jst.getUTCDate())
  const hour = pad2(jst.getUTCHours())
  const minute = pad2(jst.getUTCMinutes())
  const second = pad2(jst.getUTCSeconds())
  return `${year}/${month}/${day} ${hour}:${minute}:${second} JST`
}

function formatJstTimestamp(timestamp: number | null | undefined): string {
  if (!timestamp) {
    return '不明'
  }

  const unix = Math.floor(timestamp / 1000)
  return `${formatJst(new Date(timestamp))} (<t:${unix}:R>)`
}

function formatCodeBlock(
  value: string | null | undefined,
  fallback: string,
  maxLength = 1_000
): string {
  const content = textOrFallback(value, fallback).replaceAll('```', '` ` `')
  return `\`\`\`text\n${truncateContent(content, maxLength)}\n\`\`\``
}

function inlineCode(value: string): string {
  return `\`${value.replaceAll('`', '')}\``
}

function pushChange(changes: string[], label: string, before: unknown, after: unknown): void {
  const beforeText = formatChangeValue(before)
  const afterText = formatChangeValue(after)

  if (beforeText !== afterText) {
    changes.push(`**${label}:** ${beforeText} -> ${afterText}`)
  }
}

function pushPermissionChange(changes: string[], before: unknown, after: unknown): void {
  const beforeBits = toPermissionBitfield(before)
  const afterBits = toPermissionBitfield(after)

  if (beforeBits === undefined || afterBits === undefined) {
    pushChange(changes, '権限', formatPermissionBitfield(before), formatPermissionBitfield(after))
    return
  }

  if (beforeBits === afterBits) {
    return
  }

  const added = afterBits & ~beforeBits
  const removed = beforeBits & ~afterBits
  const lines: string[] = []

  if (added !== 0n) {
    lines.push(`+ ${formatPermissionBitfield(added)}`)
  }
  if (removed !== 0n) {
    lines.push(`- ${formatPermissionBitfield(removed)}`)
  }

  changes.push(`**権限:**\n${lines.join('\n')}`)
}

function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '(なし)'
  }

  if (typeof value === 'boolean') {
    return formatBoolean(value)
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (value instanceof Date) {
    return formatJst(value)
  }

  return JSON.stringify(value)
}

function formatPermissionBitfield(value: unknown): string {
  const bitfield = toPermissionBitfield(value)

  if (bitfield === undefined) {
    return '不明'
  }
  if (bitfield === 0n) {
    return 'なし'
  }

  const permissions = new PermissionsBitField(bitfield).toArray()

  if (permissions.length === 0) {
    return `不明な権限 (bitfield: ${inlineCode(bitfield.toString())})`
  }

  return permissions.map(formatPermissionName).join(', ')
}

function toPermissionBitfield(value: unknown): bigint | undefined {
  if (typeof value === 'bigint') {
    return value
  }

  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return BigInt(value)
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return BigInt(value)
  }

  if (typeof value === 'object' && value !== null && 'bitfield' in value) {
    return toPermissionBitfield((value as { bitfield?: unknown }).bitfield)
  }

  return undefined
}

function formatPermissionName(permission: PermissionsString): string {
  return permissionLabels[permission] ?? permission
}

function formatEnumLabel(labels: Record<number, string>, value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '(なし)'
  }

  return labels[value] ?? `不明 (${value})`
}

function mergeAuditReason(
  audit: EventLogAuditDetails | undefined,
  fallbackReason: string | null | undefined
): EventLogAuditDetails | undefined {
  if (!audit && !fallbackReason) {
    return audit
  }

  return {
    ...audit,
    reason: audit?.reason ?? fallbackReason
  }
}

function formatSetChanges(before: Set<string>, after: Set<string>): string | undefined {
  const added = [...after].filter((value) => !before.has(value))
  const removed = [...before].filter((value) => !after.has(value))
  const lines = [...added.map((value) => `+ ${value}`), ...removed.map((value) => `- ${value}`)]

  return lines.length > 0 ? lines.join('\n') : undefined
}

function extractUrls(content: string): Set<string> {
  return new Set(content.match(/https?:\/\/\S+/g) ?? [])
}

function extractUserMentions(content: string): Set<string> {
  return new Set(content.match(/<@!?\d+>/g) ?? [])
}

function isImageAttachment(attachment: Attachment): boolean {
  const contentType = attachment.contentType?.toLowerCase()

  if (contentType?.startsWith('image/')) {
    return true
  }

  return /\.(png|jpe?g|gif|webp|bmp|tiff|svg)$/i.test(attachment.name)
}

type PermissionOverwriteData = {
  id?: string
  type?: number
  allow?: { bitfield?: unknown }
  deny?: { bitfield?: unknown }
}

type CacheLike<T> = {
  get(id: string): T | undefined
}

function formatPermissionOverwrites(channel: object): string | undefined {
  const cache = (channel as { permissionOverwrites?: { cache?: Map<string, unknown> } })
    .permissionOverwrites?.cache

  if (!cache || cache.size === 0) {
    return undefined
  }

  return [...cache.values()]
    .map((overwrite) => {
      const data = overwrite as PermissionOverwriteData
      return `- 対象: ${formatPermissionOverwriteTarget(channel, data)} / 許可: ${formatPermissionBitfield(
        data.allow
      )} / 拒否: ${formatPermissionBitfield(data.deny)}`
    })
    .join('\n')
}

function formatPermissionOverwriteTarget(
  channel: object,
  overwrite: PermissionOverwriteData
): string {
  if (!overwrite.id) {
    return '不明'
  }

  const guild = (
    channel as {
      guild?: {
        roles?: { cache?: CacheLike<Role> }
        members?: { cache?: CacheLike<GuildMember> }
      }
    }
  ).guild

  if (overwrite.type === OverwriteType.Role) {
    const role = guild?.roles?.cache?.get(overwrite.id)
    return role
      ? `${role.toString()} (${role.name}, ロール, ID: ${inlineCode(overwrite.id)})`
      : `<@&${overwrite.id}> (ロール, ID: ${inlineCode(overwrite.id)})`
  }

  if (overwrite.type === OverwriteType.Member) {
    const member = guild?.members?.cache?.get(overwrite.id)
    return member?.user
      ? `${member.user.toString()} (${member.user.tag}, メンバー, ID: ${inlineCode(overwrite.id)})`
      : `<@${overwrite.id}> (メンバー, ID: ${inlineCode(overwrite.id)})`
  }

  return `${inlineCode(overwrite.id)} (${formatOverwriteType(overwrite.type)})`
}

function formatOverwriteType(type: number | undefined): string {
  if (type === OverwriteType.Role) {
    return 'ロール'
  }
  if (type === OverwriteType.Member) {
    return 'メンバー'
  }

  return type === undefined ? '種別不明' : `種別不明 (${type})`
}

function formatBoolean(value: boolean): string {
  return value ? 'はい' : 'いいえ'
}

function formatSeconds(seconds: number): string {
  return `${seconds}s`
}

function formatBitrate(bitrate: number | null | undefined): string {
  if (!bitrate) {
    return '(なし)'
  }

  return `${Math.round(bitrate / 1000)} kbps`
}

function formatUserLimit(limit: number | null | undefined): string {
  if (limit === null || limit === undefined) {
    return '(なし)'
  }

  return limit === 0 ? '無制限' : `${limit}人`
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KiB`
  }

  return `${bytes} B`
}

function escapeLinkLabel(value: string): string {
  return value.replaceAll('[', '\\[').replaceAll(']', '\\]')
}

function getStringProp(source: object, key: string): string | undefined {
  const value = (source as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

function getNumberProp(source: object, key: string): number | undefined {
  const value = (source as Record<string, unknown>)[key]
  return typeof value === 'number' ? value : undefined
}

function getBooleanProp(source: object, key: string): boolean | undefined {
  const value = (source as Record<string, unknown>)[key]
  return typeof value === 'boolean' ? value : undefined
}

function textOrFallback(value: string | null | undefined, fallback: string): string {
  return value && value.length > 0 ? value : fallback
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

export function truncateContent(content: string, maxLength = 1_024): string {
  if (content.length <= maxLength) {
    return content
  }

  return `${content.slice(0, maxLength - 3)}...`
}
