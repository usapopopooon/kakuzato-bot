import type { Awaitable, ClientEvents } from "discord.js";

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

export type BotModule = {
  name: string;
  events?: AnyDiscordEventHandler[];
};
