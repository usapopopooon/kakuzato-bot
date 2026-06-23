import { ActivityType } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { AppLogger } from "../../../platform/logger/logger";
import type { BotActivityRepository } from "../repositories/botActivityRepository";
import { BotActivityService } from "./botActivityService";

describe("BotActivityService", () => {
  it("applies the stored activity to the Discord client", async () => {
    const repository = {
      get: vi.fn().mockResolvedValue({
        activityName: "サーバーを管理中。",
        updatedAt: new Date().toISOString()
      })
    };
    const logger = { info: vi.fn() };
    const client = {
      user: {
        setActivity: vi.fn()
      }
    };
    const service = new BotActivityService(
      repository as unknown as BotActivityRepository,
      logger as unknown as AppLogger
    );

    await expect(service.applyToClient(client)).resolves.toMatchObject({
      activityName: "サーバーを管理中。"
    });

    expect(client.user.setActivity).toHaveBeenCalledWith("サーバーを管理中。", {
      type: ActivityType.Playing
    });
  });
});
