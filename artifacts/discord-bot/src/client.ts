import {
  Client, Collection, GatewayIntentBits, Partials, Message
} from 'discord.js';

export interface BotCommand {
  name: string;
  description: string;
  category: string;
  aliases?: string[];
  usage?: string;
  execute(message: Message, args: string[]): Promise<any>;
}

export class BotClient extends Client {
  commands: Collection<string, BotCommand> = new Collection();
  aliases: Collection<string, string> = new Collection();
}

export function createClient(): BotClient {
  const client = new BotClient({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildBans,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildModeration,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
  });
  return client;
}
