import { MessageFlags, PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { StickyMessageService } from "../services/stickyMessageService";
import {
  createStickyMessageCommand,
  normalizeStickyMessageInput,
  parseStickyColor
} from "./stickyMessageCommand";

describe("sticky command", () => {
  it("rejects non-admin users before changing config", async () => {
    const service = {
      setText: vi.fn()
    };
    const reply = vi.fn();
    const command = createStickyMessageCommand(service as unknown as StickyMessageService);

    await command.execute({
      inCachedGuild: () => true,
      memberPermissions: { has: () => false },
      reply
    } as unknown as ChatInputCommandInteraction);

    expect(service.setText).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      content: "このコマンドは管理者のみ実行できます。",
      flags: MessageFlags.Ephemeral
    });
  });

  it("stores a text sticky message for the selected channel", async () => {
    const service = {
      setText: vi.fn().mockResolvedValue({
        guildId: "guild-1",
        channelId: "channel-1",
        messageId: "message-1",
        messageType: "text",
        title: "",
        description: "sticky text",
        delaySeconds: 10,
        updatedAt: new Date().toISOString()
      })
    };
    const channel = { id: "channel-1", send: vi.fn() };
    const reply = vi.fn();
    const command = createStickyMessageCommand(service as unknown as StickyMessageService);

    await command.execute({
      inCachedGuild: () => true,
      guildId: "guild-1",
      guild: {
        channels: {
          fetch: vi.fn().mockResolvedValue(channel)
        }
      },
      memberPermissions: {
        has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
      },
      options: {
        getSubcommand: () => "text",
        getChannel: () => ({ id: "channel-1" }),
        getString: (name: string) => (name === "content" ? "sticky text" : null),
        getInteger: () => 10
      },
      reply
    } as unknown as ChatInputCommandInteraction);

    expect(service.setText).toHaveBeenCalledWith("guild-1", channel, "sticky text", 10);
    expect(reply).toHaveBeenCalledWith({
      content: "stickyメッセージを <#channel-1> に設定しました。種類: テキスト / 遅延: 10秒",
      flags: MessageFlags.Ephemeral
    });
  });

  it("converts escaped newlines in text sticky messages", async () => {
    const service = {
      setText: vi.fn().mockResolvedValue({
        guildId: "guild-1",
        channelId: "channel-1",
        messageId: "message-1",
        messageType: "text",
        title: "",
        description: "1行目\n2行目",
        delaySeconds: 10,
        updatedAt: new Date().toISOString()
      })
    };
    const channel = { id: "channel-1", send: vi.fn() };
    const reply = vi.fn();
    const command = createStickyMessageCommand(service as unknown as StickyMessageService);

    await command.execute({
      inCachedGuild: () => true,
      guildId: "guild-1",
      guild: {
        channels: {
          fetch: vi.fn().mockResolvedValue(channel)
        }
      },
      memberPermissions: {
        has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
      },
      options: {
        getSubcommand: () => "text",
        getChannel: () => ({ id: "channel-1" }),
        getString: (name: string) => (name === "content" ? "1行目\\n2行目" : null),
        getInteger: () => 10
      },
      reply
    } as unknown as ChatInputCommandInteraction);

    expect(service.setText).toHaveBeenCalledWith("guild-1", channel, "1行目\n2行目", 10);
  });

  it("converts escaped newlines in embed sticky descriptions", async () => {
    const service = {
      setEmbed: vi.fn().mockResolvedValue({
        guildId: "guild-1",
        channelId: "channel-1",
        messageId: "message-1",
        messageType: "embed",
        title: "",
        description: "1行目\n2行目",
        delaySeconds: 5,
        updatedAt: new Date().toISOString()
      })
    };
    const channel = { id: "channel-1", send: vi.fn() };
    const reply = vi.fn();
    const command = createStickyMessageCommand(service as unknown as StickyMessageService);

    await command.execute({
      inCachedGuild: () => true,
      guildId: "guild-1",
      guild: {
        channels: {
          fetch: vi.fn().mockResolvedValue(channel)
        }
      },
      memberPermissions: {
        has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
      },
      options: {
        getSubcommand: () => "embed",
        getChannel: () => ({ id: "channel-1" }),
        getString: (name: string) => {
          if (name === "description") {
            return "1行目\\n2行目";
          }

          return null;
        },
        getInteger: () => null
      },
      reply
    } as unknown as ChatInputCommandInteraction);

    expect(service.setEmbed).toHaveBeenCalledWith("guild-1", channel, {
      title: "",
      description: "1行目\n2行目",
      color: undefined,
      delaySeconds: 5
    });
  });

  it("rejects invalid embed color values", async () => {
    const service = {
      setEmbed: vi.fn()
    };
    const channel = { id: "channel-1", send: vi.fn() };
    const reply = vi.fn();
    const command = createStickyMessageCommand(service as unknown as StickyMessageService);

    await command.execute({
      inCachedGuild: () => true,
      guildId: "guild-1",
      guild: {
        channels: {
          fetch: vi.fn().mockResolvedValue(channel)
        }
      },
      memberPermissions: {
        has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
      },
      options: {
        getSubcommand: () => "embed",
        getChannel: () => ({ id: "channel-1" }),
        getString: (name: string) => {
          if (name === "description") {
            return "sticky details";
          }

          if (name === "color") {
            return "not-a-color";
          }

          return null;
        },
        getInteger: () => null
      },
      reply
    } as unknown as ChatInputCommandInteraction);

    expect(service.setEmbed).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      content: "色の形式が不正です。`FF0000`、`#00FF00`、`0x3366FF` のように指定してください。",
      flags: MessageFlags.Ephemeral
    });
  });

  it("removes sticky config from the selected channel", async () => {
    const service = {
      remove: vi.fn().mockResolvedValue({
        guildId: "guild-1",
        channelId: "channel-1"
      })
    };
    const channel = { id: "channel-1", send: vi.fn() };
    const reply = vi.fn();
    const command = createStickyMessageCommand(service as unknown as StickyMessageService);

    await command.execute({
      inCachedGuild: () => true,
      guildId: "guild-1",
      guild: {
        channels: {
          fetch: vi.fn().mockResolvedValue(channel)
        }
      },
      memberPermissions: {
        has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
      },
      options: {
        getSubcommand: () => "remove",
        getChannel: () => ({ id: "channel-1" })
      },
      reply
    } as unknown as ChatInputCommandInteraction);

    expect(service.remove).toHaveBeenCalledWith(channel);
    expect(reply).toHaveBeenCalledWith({
      content: "stickyメッセージを <#channel-1> から解除しました。",
      flags: MessageFlags.Ephemeral
    });
  });
});

describe("parseStickyColor", () => {
  it.each([
    ["FF0000", 0xff0000],
    ["#00FF00", 0x00ff00],
    ["0x3366FF", 0x3366ff],
    [null, undefined]
  ])("parses %s", (input, expected) => {
    expect(parseStickyColor(input)).toBe(expected);
  });

  it("rejects invalid colors", () => {
    expect(parseStickyColor("zzzzzz")).toBe("invalid");
  });
});

describe("normalizeStickyMessageInput", () => {
  it("trims surrounding whitespace and normalizes newline forms", () => {
    expect(normalizeStickyMessageInput("  1行目\\n2行目\\r\\n3行目\r4行目  ")).toBe(
      "1行目\n2行目\n3行目\n4行目"
    );
  });
});
