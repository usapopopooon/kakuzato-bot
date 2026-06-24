import { ChannelType, OverwriteType, PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  createChannelUpdatedEmbed,
  createMessageDeletedEmbed,
  createRoleEmbed,
  createRoleUpdatedEmbed,
  formatJst,
  truncateContent
} from "./eventLogEmbeds";

describe("eventLogEmbeds", () => {
  it("truncates long field content to Discord embed limits", () => {
    const truncated = truncateContent("a".repeat(1_100));

    expect(truncated).toHaveLength(1_024);
    expect(truncated.endsWith("...")).toBe(true);
  });

  it("uses a fallback when deleted message content is unavailable", () => {
    const embed = createMessageDeletedEmbed({
      author: null,
      channel: { id: "channel-1", toString: () => "<#channel-1>" },
      content: "",
      createdTimestamp: 0,
      id: "message-1"
    } as never);
    const json = embed.toJSON();

    expect(json.fields?.find((field) => field.name === "本文")?.value).toContain(
      "(本文なし / 取得不可)"
    );
    expect(json.footer?.text).toContain("記録時刻:");
    expect(json.footer?.text).toContain("JST");
  });

  it("formats timestamps in JST", () => {
    expect(formatJst(new Date("2026-06-23T15:04:05.000Z"))).toBe("2026/06/24 00:04:05 JST");
  });

  it("formats role permission bitfields as readable permission names", () => {
    const bitfield = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages;
    const embed = createRoleEmbed(
      "ロール作成",
      "role_create",
      createRoleFixture({ permissionsBitfield: bitfield }) as never
    );
    const json = embed.toJSON();
    const permissionField = json.fields?.find((field) => field.name === "権限");

    expect(permissionField?.value).toContain("チャンネルを見る");
    expect(permissionField?.value).toContain("メッセージを送信");
    expect(permissionField?.value).not.toContain(bitfield.toString());
  });

  it("formats role permission changes as added and removed permission names", () => {
    const before = createRoleFixture({
      permissionsBitfield: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ManageMessages
    });
    const after = createRoleFixture({
      permissionsBitfield: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages
    });
    const embed = createRoleUpdatedEmbed(before as never, after as never);
    const changeField = embed?.toJSON().fields?.find((field) => field.name === "変更内容");

    expect(changeField?.value).toContain("+ メッセージを送信");
    expect(changeField?.value).toContain("- メッセージ管理");
    expect(changeField?.value).not.toContain(PermissionFlagsBits.SendMessages.toString());
    expect(changeField?.value).not.toContain(PermissionFlagsBits.ManageMessages.toString());
  });

  it("formats permission overwrite targets and permission names", () => {
    const role = createRoleFixture({ id: "role-1", name: "Moderator" });
    const before = createChannelFixture(role, 0n);
    const after = createChannelFixture(role, PermissionFlagsBits.SendMessages);
    const embed = createChannelUpdatedEmbed(before as never, after as never);
    const overwriteField = embed
      ?.toJSON()
      .fields?.find((field) => field.name === "権限上書き (変更後)");

    expect(overwriteField?.value).toContain("<@&role-1> (Moderator, ロール, ID: `role-1`)");
    expect(overwriteField?.value).toContain("許可: メッセージを送信");
    expect(overwriteField?.value).toContain("拒否: なし");
    expect(overwriteField?.value).not.toContain(PermissionFlagsBits.SendMessages.toString());
  });
});

function createRoleFixture(options: { id?: string; name?: string; permissionsBitfield?: bigint } = {}) {
  const id = options.id ?? "role-1";
  const name = options.name ?? "Moderator";

  return {
    id,
    name,
    hexColor: "#5865f2",
    createdTimestamp: Date.parse("2026-06-23T15:04:05.000Z"),
    hoist: false,
    mentionable: false,
    permissions: { bitfield: options.permissionsBitfield ?? PermissionFlagsBits.ViewChannel },
    toString: () => `<@&${id}>`
  };
}

function createChannelFixture(role: ReturnType<typeof createRoleFixture>, allow: bigint) {
  return {
    id: "channel-1",
    name: "general",
    type: ChannelType.GuildText,
    parent: null,
    guild: {
      roles: {
        cache: new Map([[role.id, role]])
      },
      members: {
        cache: new Map()
      }
    },
    permissionOverwrites: {
      cache: new Map([
        [
          role.id,
          {
            id: role.id,
            type: OverwriteType.Role,
            allow: { bitfield: allow },
            deny: { bitfield: 0n }
          }
        ]
      ])
    },
    toString: () => "<#channel-1>"
  };
}
