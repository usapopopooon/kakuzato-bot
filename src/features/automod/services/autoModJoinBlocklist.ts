const defaultTtlMs = 60_000

export class AutoModJoinBlocklist {
  private readonly entries = new Map<string, number>()
  private readonly ttlMs: number

  constructor(ttlMs = defaultTtlMs) {
    this.ttlMs = ttlMs
  }

  markBlocked(guildId: string, userId: string, now = Date.now()): void {
    this.entries.set(createKey(guildId, userId), now + this.ttlMs)
  }

  isBlocked(guildId: string, userId: string, now = Date.now()): boolean {
    const key = createKey(guildId, userId)
    const expiresAt = this.entries.get(key)

    if (!expiresAt) {
      return false
    }

    if (expiresAt <= now) {
      this.entries.delete(key)
      return false
    }

    return true
  }
}

function createKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`
}
