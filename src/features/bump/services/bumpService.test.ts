import type { Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { disboardBotId, dissokuBotId } from "../bumpServices";
import { BumpService, detectBumpSuccess, type BumpMessageLike } from "./bumpService";

function createMessage(input: BumpMessageLike): BumpMessageLike {
  return input;
}

describe("bump detection", () => {
  it("detects DISBOARD success from embed description", () => {
    const message = createMessage({
      author: { id: disboardBotId },
      embeds: [
        {
          description: "サーバーの表示順をアップしました！"
        }
      ]
    });

    expect(detectBumpSuccess(message)?.key).toBe("DISBOARD");
  });

  it("detects ディス速報 success from embed title", () => {
    const message = createMessage({
      author: { id: dissokuBotId },
      embeds: [
        {
          title: "サーバーをアップしたよ!"
        }
      ]
    });

    expect(detectBumpSuccess(message)?.key).toBe("DISSOKU");
  });

  it("detects ディス速報 success from embed fields", () => {
    const message = createMessage({
      author: { id: dissokuBotId },
      embeds: [
        {
          description: "<@12345>\nコマンド: `/up`",
          fields: [
            {
              name: "アップしました!",
              value: "1時間後にまたupできます"
            }
          ]
        }
      ]
    });

    expect(detectBumpSuccess(message)?.key).toBe("DISSOKU");
  });

  it("detects ディス速報 success from content", () => {
    const message = createMessage({
      author: { id: dissokuBotId },
      content: "CHILLカフェ をアップしたよ!"
    });

    expect(detectBumpSuccess(message)?.key).toBe("DISSOKU");
  });

  it("does not detect failure messages", () => {
    const message = createMessage({
      author: { id: dissokuBotId },
      embeds: [
        {
          fields: [
            {
              name: "失敗しました...",
              value: "間隔をあけてください"
            }
          ]
        }
      ]
    });

    expect(detectBumpSuccess(message)).toBeUndefined();
  });
});

describe("BumpService reminders", () => {
  it("keeps a claimed reminder scheduled for retry when sending fails", async () => {
    const now = new Date("2026-06-24T12:00:00.000Z");
    const reminder = {
      id: 1,
      guildId: "guild-1",
      channelId: "channel-1",
      serviceKey: "DISBOARD",
      remindAt: now.toISOString(),
      isEnabled: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    const repository = {
      getDueReminders: vi.fn().mockResolvedValue([reminder]),
      claimDueReminder: vi.fn().mockResolvedValue(true),
      clearReminder: vi.fn()
    };
    const logger = {
      warn: vi.fn()
    };
    const channel = {
      id: "channel-1",
      send: vi.fn().mockRejectedValue(new Error("send failed"))
    };
    const client = {
      channels: {
        cache: new Map([["channel-1", channel]]),
        fetch: vi.fn()
      }
    } as unknown as Client;
    const service = new BumpService(repository as never, logger as never);

    await service.sendDueReminders(client, now);

    expect(repository.claimDueReminder).toHaveBeenCalledWith(
      1,
      now,
      new Date("2026-06-24T12:01:00.000Z")
    );
    expect(repository.clearReminder).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: "guild-1",
        channelId: "channel-1",
        serviceKey: "DISBOARD",
        retryAt: "2026-06-24T12:01:00.000Z"
      }),
      "Failed to send bump reminder; it will be retried"
    );
  });
});
