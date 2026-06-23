import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BotActivityRepository, defaultBotActivityName } from "./botActivityRepository";

const tempDirs: string[] = [];

async function createRepository(): Promise<BotActivityRepository> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kakuzato-bot-activity-"));
  tempDirs.push(dir);
  return new BotActivityRepository(path.join(dir, "config.json"));
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("BotActivityRepository", () => {
  it("returns the default activity when no config exists", async () => {
    const repository = await createRepository();

    await expect(repository.get()).resolves.toMatchObject({
      activityName: defaultBotActivityName
    });
  });

  it("persists the configured activity name", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "kakuzato-bot-activity-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, "config.json");

    await new BotActivityRepository(filePath).setName("サーバーを見守り中。");

    await expect(new BotActivityRepository(filePath).get()).resolves.toMatchObject({
      activityName: "サーバーを見守り中。"
    });
  });

  it("resets the activity name to the default", async () => {
    const repository = await createRepository();
    await repository.setName("別の表示");

    await expect(repository.reset()).resolves.toMatchObject({
      activityName: defaultBotActivityName
    });
  });

  it("recovers the write queue after a failed update", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "kakuzato-bot-activity-"));
    tempDirs.push(dir);
    const blockerPath = path.join(dir, "blocked");
    const filePath = path.join(blockerPath, "config.json");
    const repository = new BotActivityRepository(filePath);

    await writeFile(blockerPath, "not a directory", "utf8");
    await expect(repository.setName("失敗する表示")).rejects.toBeInstanceOf(Error);

    await rm(blockerPath, { force: true });
    await expect(repository.setName("復旧した表示")).resolves.toMatchObject({
      activityName: "復旧した表示"
    });
  });
});
