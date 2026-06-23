import {
  MessageFlags,
  PermissionFlagsBits,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type ModalBuilder,
  type ModalSubmitInteraction
} from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { StickyMessageService } from "../services/stickyMessageService";
import {
  createStickyMessageCommand,
  createStickyMessageModalSubmitHandler,
  createStickyModalCustomId,
  normalizeStickyMessageInput,
  parseStickyColor,
  parseStickyModalCustomId
} from "./stickyMessageCommand";

const textContentInputId = "sticky-message-content";
const embedTitleInputId = "sticky-embed-title";
const embedColorInputId = "sticky-embed-color";
const embedDescriptionInputId = "sticky-embed-description";

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

  it("opens a text area modal for text sticky messages", async () => {
    const service = {
      setText: vi.fn()
    };
    const channel = { id: "channel-1", send: vi.fn() };
    const showModal = vi.fn<(modal: ModalBuilder) => Promise<void>>().mockResolvedValue(undefined);
    const command = createStickyMessageCommand(service as unknown as StickyMessageService);

    await command.execute({
      inCachedGuild: () => true,
      guildId: "guild-1",
      guild: {
        channels: {
          fetch: vi.fn().mockResolvedValue(channel)
        }
      },
      memberPermissions: createAdminPermissions(),
      options: {
        getSubcommand: () => "text",
        getChannel: () => ({ id: "channel-1" }),
        getInteger: () => 10
      },
      showModal
    } as unknown as ChatInputCommandInteraction);

    expect(service.setText).not.toHaveBeenCalled();
    expect(showModal).toHaveBeenCalledOnce();
    expect(showModal.mock.calls[0]?.[0].toJSON()).toMatchObject({
      custom_id: createStickyModalCustomId("text", "channel-1", 10),
      title: "stickyテキストを設定",
      components: [
        {
          components: [
            {
              custom_id: textContentInputId,
              label: "固定表示する本文",
              max_length: 2_000,
              required: true,
              style: TextInputStyle.Paragraph
            }
          ]
        }
      ]
    });
  });

  it("opens a modal with embed fields for embed sticky messages", async () => {
    const service = {
      setEmbed: vi.fn()
    };
    const channel = { id: "channel-1", send: vi.fn() };
    const showModal = vi.fn<(modal: ModalBuilder) => Promise<void>>().mockResolvedValue(undefined);
    const command = createStickyMessageCommand(service as unknown as StickyMessageService);

    await command.execute({
      inCachedGuild: () => true,
      guildId: "guild-1",
      guild: {
        channels: {
          fetch: vi.fn().mockResolvedValue(channel)
        }
      },
      memberPermissions: createAdminPermissions(),
      options: {
        getSubcommand: () => "embed",
        getChannel: () => ({ id: "channel-1" }),
        getInteger: () => 5
      },
      showModal
    } as unknown as ChatInputCommandInteraction);

    expect(service.setEmbed).not.toHaveBeenCalled();
    expect(showModal).toHaveBeenCalledOnce();
    expect(showModal.mock.calls[0]?.[0].toJSON()).toMatchObject({
      custom_id: createStickyModalCustomId("embed", "channel-1", 5),
      title: "sticky Embedを設定",
      components: [
        { components: [{ custom_id: embedTitleInputId, style: TextInputStyle.Short }] },
        { components: [{ custom_id: embedColorInputId, style: TextInputStyle.Short }] },
        {
          components: [{ custom_id: embedDescriptionInputId, style: TextInputStyle.Paragraph }]
        }
      ]
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
      memberPermissions: createAdminPermissions(),
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

describe("sticky modal submit", () => {
  it("stores multiline text sticky content from the modal", async () => {
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
    const handler = createStickyMessageModalSubmitHandler(
      service as unknown as StickyMessageService
    );

    await handler.execute(
      createModalSubmitInteraction({
        channel,
        customId: createStickyModalCustomId("text", "channel-1", 10),
        fields: {
          [textContentInputId]: "1行目\n2行目"
        },
        reply
      })
    );

    expect(service.setText).toHaveBeenCalledWith("guild-1", channel, "1行目\n2行目", 10);
    expect(reply).toHaveBeenCalledWith({
      content: "stickyメッセージを <#channel-1> に設定しました。種類: テキスト / 遅延: 10秒",
      flags: MessageFlags.Ephemeral
    });
  });

  it("stores embed sticky fields from the modal", async () => {
    const service = {
      setEmbed: vi.fn().mockResolvedValue({
        guildId: "guild-1",
        channelId: "channel-1",
        messageId: "message-1",
        messageType: "embed",
        title: "案内",
        description: "1行目\n2行目",
        color: 0x3366ff,
        delaySeconds: 5,
        updatedAt: new Date().toISOString()
      })
    };
    const channel = { id: "channel-1", send: vi.fn() };
    const reply = vi.fn();
    const handler = createStickyMessageModalSubmitHandler(
      service as unknown as StickyMessageService
    );

    await handler.execute(
      createModalSubmitInteraction({
        channel,
        customId: createStickyModalCustomId("embed", "channel-1", 5),
        fields: {
          [embedTitleInputId]: " 案内 ",
          [embedColorInputId]: "3366FF",
          [embedDescriptionInputId]: "1行目\n2行目"
        },
        reply
      })
    );

    expect(service.setEmbed).toHaveBeenCalledWith("guild-1", channel, {
      title: "案内",
      description: "1行目\n2行目",
      color: 0x3366ff,
      delaySeconds: 5
    });
    expect(reply).toHaveBeenCalledWith({
      content: "stickyメッセージを <#channel-1> に設定しました。種類: Embed / 遅延: 5秒",
      flags: MessageFlags.Ephemeral
    });
  });

  it("rejects invalid embed color values from the modal", async () => {
    const service = {
      setEmbed: vi.fn()
    };
    const channel = { id: "channel-1", send: vi.fn() };
    const reply = vi.fn();
    const handler = createStickyMessageModalSubmitHandler(
      service as unknown as StickyMessageService
    );

    await handler.execute(
      createModalSubmitInteraction({
        channel,
        customId: createStickyModalCustomId("embed", "channel-1", 5),
        fields: {
          [embedTitleInputId]: "",
          [embedColorInputId]: "not-a-color",
          [embedDescriptionInputId]: "sticky details"
        },
        reply
      })
    );

    expect(service.setEmbed).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      content: "色の形式が不正です。`FF0000`、`#00FF00`、`0x3366FF` のように指定してください。",
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

describe("sticky modal custom IDs", () => {
  it("serializes and parses modal payloads", () => {
    const customId = createStickyModalCustomId("embed", "channel-1", 10);

    expect(parseStickyModalCustomId(customId)).toEqual({
      mode: "embed",
      channelId: "channel-1",
      delaySeconds: 10
    });
  });

  it("rejects unrelated modal IDs", () => {
    expect(parseStickyModalCustomId("welcome:channel-1")).toBeUndefined();
  });
});

describe("normalizeStickyMessageInput", () => {
  it("trims surrounding whitespace and normalizes newline forms", () => {
    expect(normalizeStickyMessageInput("  1行目\\n2行目\\r\\n3行目\r4行目  ")).toBe(
      "1行目\n2行目\n3行目\n4行目"
    );
  });
});

function createAdminPermissions(): { has(permission: bigint): boolean } {
  return {
    has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
  };
}

function createModalSubmitInteraction(options: {
  channel: { id: string; send: ReturnType<typeof vi.fn> };
  customId: string;
  fields: Record<string, string>;
  reply: ReturnType<typeof vi.fn>;
}): ModalSubmitInteraction {
  const fields = new Map(
    Object.entries(options.fields).map(([customId, value]) => [customId, { value }])
  );

  return {
    customId: options.customId,
    fields: {
      fields,
      getTextInputValue: (customId: string) => options.fields[customId] ?? ""
    },
    guildId: "guild-1",
    guild: {
      channels: {
        fetch: vi.fn().mockResolvedValue(options.channel)
      }
    },
    inCachedGuild: () => true,
    memberPermissions: createAdminPermissions(),
    reply: options.reply
  } as unknown as ModalSubmitInteraction;
}
