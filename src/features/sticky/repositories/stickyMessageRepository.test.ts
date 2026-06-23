import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultStickyDelaySeconds, StickyMessageRepository } from "./stickyMessageRepository";

const tempDirs: string[] = [];

async function createRepository(): Promise<StickyMessageRepository> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kakuzato-sticky-"));
  tempDirs.push(dir);
  return new StickyMessageRepository(path.join(dir, "configs.json"));
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("StickyMessageRepository", () => {
  it("stores a text sticky config per channel", async () => {
    const repository = await createRepository();

    await repository.set({
      guildId: "guild-1",
      channelId: "channel-1",
      messageId: "message-1",
      messageType: "text",
      title: "",
      description: "sticky text",
      delaySeconds: 10,
      lastPostedAt: new Date().toISOString()
    });

    await expect(repository.get("channel-1")).resolves.toMatchObject({
      guildId: "guild-1",
      channelId: "channel-1",
      messageId: "message-1",
      messageType: "text",
      description: "sticky text",
      delaySeconds: 10
    });
  });

  it("normalizes invalid delay to the default", async () => {
    const repository = await createRepository();

    await repository.set({
      guildId: "guild-1",
      channelId: "channel-1",
      messageType: "embed",
      title: "title",
      description: "description",
      delaySeconds: Number.NaN
    });

    await expect(repository.get("channel-1")).resolves.toMatchObject({
      delaySeconds: defaultStickyDelaySeconds
    });
  });

  it("updates the posted message id", async () => {
    const repository = await createRepository();
    await repository.set({
      guildId: "guild-1",
      channelId: "channel-1",
      messageId: "old-message",
      messageType: "text",
      title: "",
      description: "sticky text",
      delaySeconds: 5
    });

    await expect(
      repository.updateMessage("channel-1", "new-message", new Date().toISOString())
    ).resolves.toMatchObject({
      messageId: "new-message"
    });
  });

  it("deletes configs by guild", async () => {
    const repository = await createRepository();
    await repository.set({
      guildId: "guild-1",
      channelId: "channel-1",
      messageType: "text",
      title: "",
      description: "one",
      delaySeconds: 5
    });
    await repository.set({
      guildId: "guild-2",
      channelId: "channel-2",
      messageType: "text",
      title: "",
      description: "two",
      delaySeconds: 5
    });

    await expect(repository.deleteByGuild("guild-1")).resolves.toBe(1);
    await expect(repository.get("channel-1")).resolves.toBeUndefined();
    await expect(repository.get("channel-2")).resolves.toMatchObject({
      guildId: "guild-2"
    });
  });
});
