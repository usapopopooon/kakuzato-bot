import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultWelcomeMessageContent, WelcomeConfigRepository } from "./welcomeConfigRepository";

const tempDirs: string[] = [];

async function createRepository(): Promise<WelcomeConfigRepository> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kakuzato-welcome-"));
  tempDirs.push(dir);
  return new WelcomeConfigRepository(path.join(dir, "configs.json"));
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("WelcomeConfigRepository", () => {
  it("stores an enabled channel config per guild", async () => {
    const repository = await createRepository();

    const config = await repository.setChannel("guild-1", "channel-1");

    expect(config).toMatchObject({
      guildId: "guild-1",
      channelId: "channel-1",
      enabled: true,
      messageContent: defaultWelcomeMessageContent
    });
    await expect(repository.get("guild-1")).resolves.toMatchObject({
      channelId: "channel-1",
      enabled: true,
      messageContent: defaultWelcomeMessageContent
    });
  });

  it("persists configs across repository instances", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "kakuzato-welcome-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, "configs.json");

    await new WelcomeConfigRepository(filePath).setChannel("guild-1", "channel-1");

    await expect(new WelcomeConfigRepository(filePath).get("guild-1")).resolves.toMatchObject({
      channelId: "channel-1",
      enabled: true,
      messageContent: defaultWelcomeMessageContent
    });
  });

  it("updates the message while preserving the channel config", async () => {
    const repository = await createRepository();
    await repository.setChannel("guild-1", "channel-1");

    await expect(repository.setMessage("guild-1", "ようこそ、{mention}!")).resolves.toMatchObject({
      channelId: "channel-1",
      enabled: true,
      messageContent: "ようこそ、{mention}!"
    });
  });

  it("disables an existing config without removing the channel", async () => {
    const repository = await createRepository();
    await repository.setChannel("guild-1", "channel-1");

    await expect(repository.disable("guild-1")).resolves.toMatchObject({
      channelId: "channel-1",
      enabled: false
    });
    await expect(repository.get("guild-1")).resolves.toMatchObject({
      channelId: "channel-1",
      enabled: false
    });
  });
});
