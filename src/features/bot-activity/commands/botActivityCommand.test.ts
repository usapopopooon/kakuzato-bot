import { MessageFlags, PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { defaultBotActivityName } from "../repositories/botActivityRepository";
import type { BotActivityService } from "../services/botActivityService";
import { createBotActivityCommand } from "./botActivityCommand";

describe("activity command", () => {
  it("rejects non-admin users before changing config", async () => {
    const service = {
      setName: vi.fn()
    };
    const reply = vi.fn();
    const command = createBotActivityCommand(service as unknown as BotActivityService);

    await command.execute({
      inCachedGuild: () => true,
      memberPermissions: { has: () => false },
      reply
    } as unknown as ChatInputCommandInteraction);

    expect(service.setName).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      content: "このコマンドは管理者のみ実行できます。",
      flags: MessageFlags.Ephemeral
    });
  });

  it("stores and applies the selected activity name", async () => {
    const service = {
      setName: vi.fn().mockResolvedValue({
        activityName: "サーバーを見守り中。",
        updatedAt: new Date().toISOString()
      }),
      applyToClient: vi.fn().mockResolvedValue(undefined)
    };
    const client = { user: { setActivity: vi.fn() } };
    const reply = vi.fn();
    const command = createBotActivityCommand(service as unknown as BotActivityService);

    await command.execute({
      inCachedGuild: () => true,
      client,
      memberPermissions: {
        has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
      },
      options: {
        getSubcommand: () => "set",
        getString: () => "サーバーを見守り中。"
      },
      reply
    } as unknown as ChatInputCommandInteraction);

    expect(service.setName).toHaveBeenCalledWith("サーバーを見守り中。");
    expect(service.applyToClient).toHaveBeenCalledWith(client, "サーバーを見守り中。");
    expect(reply).toHaveBeenCalledWith({
      content: "Botのプレイ中表示を「サーバーを見守り中。」に設定しました。",
      flags: MessageFlags.Ephemeral
    });
  });

  it("resets and applies the default activity name", async () => {
    const service = {
      reset: vi.fn().mockResolvedValue({
        activityName: defaultBotActivityName,
        updatedAt: new Date().toISOString()
      }),
      applyToClient: vi.fn().mockResolvedValue(undefined)
    };
    const client = { user: { setActivity: vi.fn() } };
    const reply = vi.fn();
    const command = createBotActivityCommand(service as unknown as BotActivityService);

    await command.execute({
      inCachedGuild: () => true,
      client,
      memberPermissions: {
        has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
      },
      options: {
        getSubcommand: () => "reset"
      },
      reply
    } as unknown as ChatInputCommandInteraction);

    expect(service.reset).toHaveBeenCalled();
    expect(service.applyToClient).toHaveBeenCalledWith(client, defaultBotActivityName);
    expect(reply).toHaveBeenCalledWith({
      content: `Botのプレイ中表示をデフォルトの「${defaultBotActivityName}」に戻しました。`,
      flags: MessageFlags.Ephemeral
    });
  });

  it("shows the current activity name", async () => {
    const service = {
      getConfig: vi.fn().mockResolvedValue({
        activityName: "サーバーを管理中。",
        updatedAt: new Date().toISOString()
      })
    };
    const reply = vi.fn();
    const command = createBotActivityCommand(service as unknown as BotActivityService);

    await command.execute({
      inCachedGuild: () => true,
      memberPermissions: {
        has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
      },
      options: {
        getSubcommand: () => "status"
      },
      reply
    } as unknown as ChatInputCommandInteraction);

    expect(reply).toHaveBeenCalledWith({
      content: "Botのプレイ中表示: サーバーを管理中。",
      flags: MessageFlags.Ephemeral
    });
  });
});
