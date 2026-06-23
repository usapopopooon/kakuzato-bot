import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { eventLogCategories } from "../eventLogCategories";
import { EventLogConfigRepository } from "./eventLogConfigRepository";

const tempDirs: string[] = [];

async function createRepository(): Promise<EventLogConfigRepository> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kakuzato-event-log-"));
  tempDirs.push(dir);
  return new EventLogConfigRepository(path.join(dir, "configs.json"));
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("EventLogConfigRepository", () => {
  it("stores an enabled channel config per guild", async () => {
    const repository = await createRepository();

    const config = await repository.setChannel("guild-1", "channel-1");

    expect(config).toMatchObject({
      guildId: "guild-1",
      channelId: "channel-1",
      enabled: true,
      enabledCategories: eventLogCategories
    });
    await expect(repository.get("guild-1")).resolves.toMatchObject({
      channelId: "channel-1",
      enabled: true,
      enabledCategories: eventLogCategories
    });
  });

  it("persists configs across repository instances", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "kakuzato-event-log-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, "configs.json");

    await new EventLogConfigRepository(filePath).setChannel("guild-1", "channel-1");

    await expect(new EventLogConfigRepository(filePath).get("guild-1")).resolves.toMatchObject({
      channelId: "channel-1",
      enabled: true,
      enabledCategories: eventLogCategories
    });
  });

  it("toggles a category while preserving the channel config", async () => {
    const repository = await createRepository();
    await repository.setChannel("guild-1", "channel-1");

    await expect(repository.setCategory("guild-1", "voice", false)).resolves.toMatchObject({
      channelId: "channel-1",
      enabledCategories: eventLogCategories.filter((category) => category !== "voice")
    });
    await expect(repository.setCategory("guild-1", "voice", true)).resolves.toMatchObject({
      channelId: "channel-1",
      enabledCategories: eventLogCategories
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
