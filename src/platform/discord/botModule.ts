import type {
  Awaitable,
  ChatInputCommandInteraction,
  ClientEvents,
  RESTPostAPIChatInputApplicationCommandsJSONBody
} from "discord.js";

export type DiscordEventHandler<EventName extends keyof ClientEvents> = {
  name: EventName;
  once?: boolean;
  execute: (...args: ClientEvents[EventName]) => Awaitable<void>;
};

export type AnyDiscordEventHandler = {
  name: keyof ClientEvents;
  once?: boolean;
  execute: (...args: never[]) => Awaitable<void>;
};

export type DiscordCommand = {
  data: {
    name: string;
    toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
  };
  execute(interaction: ChatInputCommandInteraction): Awaitable<void>;
};

export type BotModule = {
  name: string;
  events?: AnyDiscordEventHandler[];
  commands?: DiscordCommand[];
};
