import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  createJoinBannerTextLayout,
  estimateTextWidth,
  JoinBannerService,
  type JoinBannerInput
} from "./joinBannerService";

const sampleOutputDir = "/tmp/kakuzato-bot-layout-samples";

async function createService(): Promise<JoinBannerService> {
  const avatar = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: "#f2a6d6"
    }
  })
    .png()
    .toBuffer();

  return new JoinBannerService({
    templatePath: path.resolve("static/img/join-banner-template.png"),
    fetchImpl: () => Promise.resolve(new Response(new Uint8Array(avatar)))
  });
}

describe("JoinBannerService", () => {
  it("renders a welcome banner with the template dimensions", async () => {
    const service = await createService();

    const output = await service.create({
      displayName: "Alice & Bob <Test>",
      username: "alice",
      guildName: "Kakuzato",
      memberCount: 42,
      avatarUrl: "https://example.test/avatar.png"
    });
    const metadata = await sharp(output).metadata();

    expect(output.toString("ascii", 1, 4)).toBe("PNG");
    expect(metadata.width).toBe(1100);
    expect(metadata.height).toBe(500);
  });

  it("keeps text rows separated and inside their max widths", () => {
    const layout = createJoinBannerTextLayout(
      {
        displayName: "まるもじ Guest With A Very Very Long Name",
        username: "guest",
        guildName: "Kakuzato Server With A Long Guild Name",
        memberCount: 12345
      },
      1100,
      500,
      Math.round(500 * 0.5),
      Math.round(500 * 0.1)
    );

    expect(layout.footer.y - layout.headline.y).toBeGreaterThanOrEqual(
      Math.round(layout.headline.fontSize * 1.15)
    );
    expect(estimateTextWidth(layout.headline.text, layout.headline.fontSize)).toBeLessThanOrEqual(
      layout.headline.maxWidth
    );
    expect(layout.footer.y).toBeLessThan(500 - 35);
  });

  it("falls back to a generated avatar when avatar fetching times out", async () => {
    const service = new JoinBannerService({
      avatarFetchTimeoutMs: 1,
      templatePath: path.resolve("static/img/join-banner-template.png"),
      fetchImpl: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        })
    });

    const output = await service.create({
      displayName: "Timeout Guest",
      username: "timeout",
      guildName: "Kakuzato",
      memberCount: 42,
      avatarUrl: "https://example.test/slow-avatar.png"
    });
    const metadata = await sharp(output).metadata();

    expect(metadata.width).toBe(1100);
    expect(metadata.height).toBe(500);
  });

  it.each([
    {
      fileName: "short-name.png",
      input: {
        displayName: "Mii",
        username: "mii",
        guildName: "Kakuzato",
        memberCount: 42,
        avatarUrl: "https://example.test/avatar.png"
      }
    },
    {
      fileName: "japanese-name.png",
      input: {
        displayName: "まるもじ Guest",
        username: "guest",
        guildName: "Kakuzato Server",
        memberCount: 42,
        avatarUrl: "https://example.test/avatar.png"
      }
    },
    {
      fileName: "long-name.png",
      input: {
        displayName: "Very Very Long Display Name かわいい",
        username: "long-name",
        guildName: "Kakuzato Server With A Long Name",
        memberCount: 12345,
        avatarUrl: "https://example.test/avatar.png"
      }
    }
  ] satisfies { fileName: string; input: JoinBannerInput }[])(
    "writes a review sample for $fileName",
    async ({ fileName, input }) => {
      const service = await createService();
      const output = await service.create(input);
      const metadata = await sharp(output).metadata();

      await mkdir(sampleOutputDir, { recursive: true });
      await writeFile(path.join(sampleOutputDir, fileName), output);

      expect(metadata.width).toBe(1100);
      expect(metadata.height).toBe(500);
    }
  );
});
