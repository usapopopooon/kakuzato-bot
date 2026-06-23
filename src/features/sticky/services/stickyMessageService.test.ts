import type { Message } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { AppLogger } from "../../../platform/logger/logger";
import type { StickyMessageRepository } from "../repositories/stickyMessageRepository";
import { StickyMessageService, createStickyEmbed } from "./stickyMessageService";

function createLogger(): AppLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  } as unknown as AppLogger;
}

describe("StickyMessageService", () => {
  it("ignores messages sent by itself", async () => {
    const repository = {
      get: vi.fn()
    };
    const service = new StickyMessageService(
      repository as unknown as StickyMessageRepository,
      createLogger()
    );
    const message = {
      guild: { id: "guild-1" },
      author: { id: "bot-1" },
      client: { user: { id: "bot-1" } },
      channel: { id: "channel-1" }
    } as unknown as Message;

    await service.handleMessage(message);

    expect(repository.get).not.toHaveBeenCalled();
  });

  it("posts a new text sticky and stores the posted message id", async () => {
    const deleteOld = vi.fn().mockResolvedValue(undefined);
    const repository = {
      get: vi.fn().mockResolvedValue({
        guildId: "guild-1",
        channelId: "channel-1",
        messageId: "old-message",
        messageType: "text",
        title: "",
        description: "old",
        delaySeconds: 5,
        updatedAt: new Date().toISOString()
      }),
      set: vi.fn().mockImplementation((config) =>
        Promise.resolve({
          ...config,
          updatedAt: new Date().toISOString()
        })
      )
    };
    const channel = {
      id: "channel-1",
      messages: {
        fetch: vi.fn().mockResolvedValue({ delete: deleteOld })
      },
      send: vi.fn().mockResolvedValue({ id: "new-message" })
    };
    const service = new StickyMessageService(
      repository as unknown as StickyMessageRepository,
      createLogger()
    );

    await expect(service.setText("guild-1", channel, "sticky text", 5)).resolves.toMatchObject({
      messageId: "new-message",
      description: "sticky text",
      messageType: "text"
    });

    expect(deleteOld).toHaveBeenCalled();
    expect(channel.send).toHaveBeenCalledWith({ content: "sticky text" });
    expect(repository.set).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: "guild-1",
        channelId: "channel-1",
        messageId: "new-message",
        messageType: "text",
        description: "sticky text"
      })
    );
  });

  it("cancels a pending repost before replacing a sticky message", async () => {
    const timer = { unref: vi.fn() } as unknown as NodeJS.Timeout;
    const setTimer = vi.fn().mockReturnValue(timer);
    const clearTimer = vi.fn();
    const deleteOld = vi.fn().mockResolvedValue(undefined);
    const repository = {
      get: vi
        .fn()
        .mockResolvedValueOnce({
          guildId: "guild-1",
          channelId: "channel-1",
          messageId: "old-message",
          messageType: "text",
          title: "",
          description: "old",
          delaySeconds: 5,
          updatedAt: new Date().toISOString()
        })
        .mockResolvedValueOnce({
          guildId: "guild-1",
          channelId: "channel-1",
          messageId: "old-message",
          messageType: "text",
          title: "",
          description: "old",
          delaySeconds: 5,
          updatedAt: new Date().toISOString()
        }),
      set: vi.fn().mockImplementation((config) =>
        Promise.resolve({
          ...config,
          updatedAt: new Date().toISOString()
        })
      )
    };
    const channel = {
      id: "channel-1",
      messages: {
        fetch: vi.fn().mockResolvedValue({ delete: deleteOld })
      },
      send: vi.fn().mockResolvedValue({ id: "new-message" })
    };
    const service = new StickyMessageService(
      repository as unknown as StickyMessageRepository,
      createLogger(),
      { clearTimer, setTimer }
    );
    const message = {
      guild: { id: "guild-1" },
      author: { id: "user-1" },
      client: { user: { id: "bot-1" } },
      channel
    } as unknown as Message;

    await service.handleMessage(message);
    await service.setText("guild-1", channel, "fresh sticky", 5);

    expect(setTimer).toHaveBeenCalledTimes(1);
    expect(clearTimer).toHaveBeenCalledWith(timer);
  });

  it("deletes the newly posted message when storing the sticky config fails", async () => {
    const deletePosted = vi.fn().mockResolvedValue(undefined);
    const repository = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockRejectedValue(new Error("disk full"))
    };
    const channel = {
      id: "channel-1",
      send: vi.fn().mockResolvedValue({ id: "new-message", delete: deletePosted })
    };
    const service = new StickyMessageService(
      repository as unknown as StickyMessageRepository,
      createLogger()
    );

    await expect(service.setText("guild-1", channel, "sticky text", 5)).rejects.toThrow(
      "disk full"
    );

    expect(deletePosted).toHaveBeenCalledTimes(1);
  });

  it("keeps the sticky channel cache after deleting a guild", async () => {
    const repository = {
      list: vi
        .fn()
        .mockResolvedValueOnce([
          {
            guildId: "guild-1",
            channelId: "channel-1",
            messageId: "message-1",
            messageType: "text",
            title: "",
            description: "old",
            delaySeconds: 5,
            updatedAt: new Date().toISOString()
          },
          {
            guildId: "guild-2",
            channelId: "channel-2",
            messageId: "message-2",
            messageType: "text",
            title: "",
            description: "remaining",
            delaySeconds: 5,
            updatedAt: new Date().toISOString()
          }
        ])
        .mockResolvedValueOnce([
          {
            guildId: "guild-2",
            channelId: "channel-2",
            messageId: "message-2",
            messageType: "text",
            title: "",
            description: "remaining",
            delaySeconds: 5,
            updatedAt: new Date().toISOString()
          }
        ]),
      deleteByGuild: vi.fn().mockResolvedValue(1),
      get: vi.fn()
    };
    const service = new StickyMessageService(
      repository as unknown as StickyMessageRepository,
      createLogger()
    );
    const message = {
      guild: { id: "guild-1" },
      author: { id: "user-1" },
      client: { user: { id: "bot-1" } },
      channel: { id: "channel-1" }
    } as unknown as Message;

    await service.loadConfiguredChannels();
    await expect(service.deleteByGuild("guild-1")).resolves.toBe(1);
    await service.handleMessage(message);

    expect(repository.list).toHaveBeenCalledTimes(2);
    expect(repository.get).not.toHaveBeenCalled();
  });

  it("reposts sticky messages at the latest position", async () => {
    const deleteOld = vi.fn().mockResolvedValue(undefined);
    const repository = {
      get: vi.fn().mockResolvedValue({
        guildId: "guild-1",
        channelId: "channel-1",
        messageId: "old-message",
        messageType: "embed",
        title: "Rules",
        description: "Read this first.",
        color: 0xff0000,
        delaySeconds: 5,
        updatedAt: new Date().toISOString()
      }),
      updateMessage: vi.fn().mockResolvedValue(undefined)
    };
    const channel = {
      id: "channel-1",
      messages: {
        fetch: vi.fn().mockResolvedValue({ delete: deleteOld })
      },
      send: vi.fn().mockResolvedValue({ id: "new-message" })
    };
    const service = new StickyMessageService(
      repository as unknown as StickyMessageRepository,
      createLogger()
    );

    await expect(service.repost(channel)).resolves.toBe(true);

    expect(deleteOld).toHaveBeenCalled();
    expect(channel.send).toHaveBeenCalledWith({
      embeds: [expect.anything()]
    });
    expect(repository.updateMessage).toHaveBeenCalledWith(
      "channel-1",
      "new-message",
      expect.any(String)
    );
  });

  it("reposts when the previous sticky message has already been deleted", async () => {
    const repository = {
      get: vi.fn().mockResolvedValue({
        guildId: "guild-1",
        channelId: "channel-1",
        messageId: "old-message",
        messageType: "text",
        title: "",
        description: "sticky text",
        delaySeconds: 5,
        updatedAt: new Date().toISOString()
      }),
      delete: vi.fn().mockResolvedValue(undefined),
      updateMessage: vi.fn().mockResolvedValue(undefined)
    };
    const channel = {
      id: "channel-1",
      messages: {
        fetch: vi
          .fn()
          .mockRejectedValue(Object.assign(new Error("Unknown Message"), { code: 10008 }))
      },
      send: vi.fn().mockResolvedValue({ id: "new-message" })
    };
    const service = new StickyMessageService(
      repository as unknown as StickyMessageRepository,
      createLogger()
    );

    await expect(service.repost(channel)).resolves.toBe(true);

    expect(channel.send).toHaveBeenCalledWith({ content: "sticky text" });
    expect(repository.updateMessage).toHaveBeenCalledWith(
      "channel-1",
      "new-message",
      expect.any(String)
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it("builds an embed with optional title and default color", () => {
    const embed = createStickyEmbed({
      title: "Info",
      description: "sticky details",
      color: undefined
    });

    expect(embed.toJSON()).toMatchObject({
      title: "Info",
      description: "sticky details",
      color: 0x85e7ad
    });
  });
});
