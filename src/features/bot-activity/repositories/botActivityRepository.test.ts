import { describe, expect, it, vi } from "vitest";
import { BotActivityRepository, defaultBotActivityName } from "./botActivityRepository";

function createRepository() {
  const rows = new Map<string, { id: string; activityName: string; updatedAt: Date }>();
  const botActivityConfig = {
    findUnique: vi.fn(({ where }: { where: { id: string } }) => rows.get(where.id) ?? null),
    upsert: vi.fn(
      ({
        where,
        create,
        update
      }: {
        where: { id: string };
        create: { id: string; activityName: string };
        update: { activityName: string };
      }) => {
        const current = rows.get(where.id);
        const row = {
          id: where.id,
          activityName: current ? update.activityName : create.activityName,
          updatedAt: new Date()
        };
        rows.set(where.id, row);
        return row;
      }
    )
  };

  return {
    repository: new BotActivityRepository({ botActivityConfig } as never),
    botActivityConfig
  };
}

describe("BotActivityRepository", () => {
  it("returns the default activity when no config exists", async () => {
    const { repository } = createRepository();

    await expect(repository.get()).resolves.toMatchObject({
      activityName: defaultBotActivityName
    });
  });

  it("upserts the configured activity name", async () => {
    const { repository, botActivityConfig } = createRepository();

    await expect(repository.setName("サーバーを見守り中。")).resolves.toMatchObject({
      activityName: "サーバーを見守り中。"
    });
    await expect(repository.get()).resolves.toMatchObject({
      activityName: "サーバーを見守り中。"
    });
    expect(botActivityConfig.upsert).toHaveBeenCalledWith({
      where: { id: "global" },
      create: { id: "global", activityName: "サーバーを見守り中。" },
      update: { activityName: "サーバーを見守り中。" }
    });
  });

  it("resets the activity name to the default", async () => {
    const { repository } = createRepository();
    await repository.setName("別の表示");

    await expect(repository.reset()).resolves.toMatchObject({
      activityName: defaultBotActivityName
    });
  });
});
