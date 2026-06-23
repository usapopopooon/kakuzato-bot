export type WelcomeMessageInput = {
  userId: string;
  username: string;
  displayName: string;
  guildName: string;
  memberCount: number;
};

const placeholders = {
  mention: (input: WelcomeMessageInput) => `<@${input.userId}>`,
  username: (input: WelcomeMessageInput) => input.username,
  displayName: (input: WelcomeMessageInput) => input.displayName,
  guildName: (input: WelcomeMessageInput) => input.guildName,
  memberCount: (input: WelcomeMessageInput) => input.memberCount.toString()
} as const;

export function renderWelcomeMessage(template: string, input: WelcomeMessageInput): string {
  return template.replace(
    /\{(mention|username|displayName|guildName|memberCount)\}/g,
    (_, key: keyof typeof placeholders) => {
      return placeholders[key](input);
    }
  );
}
