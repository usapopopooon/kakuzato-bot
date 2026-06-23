import { describe, expect, it } from "vitest";
import { createMessageDeletedEmbed, formatJst, truncateContent } from "./eventLogEmbeds";

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
});
