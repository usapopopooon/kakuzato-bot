import { describe, expect, it } from "vitest";
import { renderWelcomeMessage } from "./welcomeMessage";

describe("renderWelcomeMessage", () => {
  it("replaces welcome placeholders", () => {
    expect(
      renderWelcomeMessage("Welcome {mention} to {guildName}! You are member #{memberCount}.", {
        userId: "123",
        username: "alice",
        displayName: "Alice",
        guildName: "Kakuzato",
        memberCount: 42
      })
    ).toBe("Welcome <@123> to Kakuzato! You are member #42.");
  });
});
