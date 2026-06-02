import { EmbedBuilder } from 'discord.js';
import { BotCommand } from '../client.js';
import { fetchGif, fetchAdultGif, fetchJoke } from '../utils/helpers.js';
import { COLORS, BOT_FOOTER } from '../utils/embeds.js';
import { hasNsfwAccess } from '../database.js';
import { BOT_OWNER_ID } from '../utils/permissions.js';

// ── PER-GUILD TRUTH/DARE TRACKING (anti-repeat) ──────────────────────────────
const truthIndex  = new Map<string, number>();
const dareIndex   = new Map<string, number>();

// Fisher-Yates shuffle
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const shuffledTruths  = new Map<string, string[]>();
const shuffledDares   = new Map<string, string[]>();

const TRUTHS = [
  'What is your biggest fear?',
  'Have you ever lied to your best friend?',
  'What is the most embarrassing thing you have done in public?',
  'Have you ever had a crush on someone in this server?',
  'What is your most embarrassing childhood memory?',
  'What is the biggest lie you have ever told?',
  'Have you ever cheated on a test or exam?',
  'What is your biggest insecurity?',
  'Have you ever stolen something?',
  'What is your most unpopular opinion?',
  'What is the last thing you searched online?',
  'Who do you have a secret crush on?',
  'What is the most childish thing you still do?',
  'What is your most embarrassing moment this year?',
  'Have you ever blamed someone else for something you did?',
  'What is the worst thing you have ever said to someone?',
  'Have you ever been in a fight? What happened?',
  'What is the strangest dream you have had?',
  'What habit do you have that you are most ashamed of?',
  'What is the meanest thing you have ever done?',
  'Have you ever ghosted someone? Why?',
  'What is your guilty pleasure?',
  'Who was your first crush and what happened?',
  'Have you ever been caught doing something embarrassing?',
  'What is the most embarrassing song you know all the words to?',
  'What do you consider your worst quality?',
  "Have you ever talked behind someone's back in this server?",
  'What is your biggest regret?',
  'Have you ever said "I love you" and not meant it?',
  'What is the pettiest thing you have ever done?',
  'If someone in this chat confessed feelings for you, what would you do?',
  'What is the most trouble you have ever been in?',
  'What is a secret you have never told anyone?',
  'Have you ever had feelings for someone and not told them?',
  'What is the most embarrassing photo on your phone right now?',
  'Have you ever done something just to impress someone?',
  'What is a lie you tell yourself regularly?',
  'What is the most desperate thing you have done for attention?',
  'If you could change one decision in your life, what would it be?',
  'What is the worst date you have ever been on?',
  'Have you ever faked sick to get out of something?',
  'What is the most embarrassing nickname you have ever had?',
  'Have you ever walked into the wrong bathroom?',
  'What is the weirdest food combination you enjoy?',
  'Have you ever sent a message to the wrong person? What did it say?',
  'What is the most awkward situation you have ever been in?',
  'What would your parents be most disappointed about if they found out?',
  "Have you ever pretended to like someone's gift?",
  'What is the biggest thing you have lied about to your parents?',
  'What is one thing you hope people never find out about you?',
];

const DARES = [
  'Send a voice message singing a song for 10 seconds.',
  'Change your nickname to something embarrassing for 1 hour.',
  'DM the 3rd person in your friend list "I love you" and screenshot it.',
  'Post your most embarrassing photo in this chat.',
  'Do 20 push-ups right now and send proof.',
  'Speak in a different accent for the next 5 minutes.',
  'Talk in third person for the next 10 minutes.',
  'Imitate a famous person until someone in the chat guesses who it is.',
  'Share your last 3 search history items.',
  'Send a selfie with your silliest face.',
  'Type a paragraph with your eyes closed.',
  'Send a voice message doing your best impression of a cartoon character.',
  'Write a heartfelt love poem to a random member in this server.',
  'Change your profile picture to something embarrassing for 24 hours.',
  'Send a voice message where you roast yourself.',
  'Tell everyone here the most embarrassing song on your playlist.',
  'Do your best robot dance and send a video.',
  'Text your most recent contact "I need to confess something" and show the reply.',
  'Spend the next 5 messages ending every sentence with "and that\'s on period".',
  'Send a voice message talking like you are in a dramatic movie trailer.',
  'Say something nice about every person who has spoken in this chat today.',
  'Share the most embarrassing photo in your camera roll from 2 years ago.',
  'Write a haiku about your most embarrassing moment.',
  'Call someone in your contacts and say "I know what you did" then hang up.',
  'Send a voice message in slow motion (speaking very slowly).',
  'Post your last text message screenshot (censor names if needed).',
  'Describe your day using only emoji, no words.',
  'Describe the last movie you watched as if it were the greatest film ever.',
  'Type with your nose for the next 2 messages.',
  'Set "brb getting therapy" as your status for 30 minutes.',
  'Write a love letter to your favourite food and read it aloud.',
  'Send a voice message with an extremely dramatic weather forecast.',
  'Summarise your entire personality in exactly 3 emojis.',
  'Pretend to be a medieval knight explaining modern technology.',
  'Record yourself saying "I am the greatest" 5 times with increasing confidence.',
  'Go to another channel, say "I have an announcement" and then say nothing.',
  'Reply to the next 5 messages with a different animal noise.',
  'Write a motivational speech to your pet (or imaginary pet) and share it.',
  'Explain gravity as if you were a 5-year-old.',
  'Do a 30-second stand-up comedy act about your day.',
  'Change your profile pic to a potato for 1 hour.',
  'Say the alphabet backwards — share voice message.',
  'Compliment every member who has chatted today.',
  'Share the weirdest thing that has ever happened to you.',
  'Attempt to beatbox for 15 seconds on voice message.',
  'Describe your current mood using only song titles.',
  'Send a voice message laughing for 10 seconds straight.',
  'For 5 minutes, end every message with "...or am I?"',
  'Share the most cringe thing you wrote online 3+ years ago.',
  'DM someone "congrats on the win!" and see how they respond.',
];

function getNextTruth(guildId: string): string {
  if (!shuffledTruths.has(guildId)) shuffledTruths.set(guildId, shuffle(TRUTHS));
  const arr = shuffledTruths.get(guildId)!;
  let idx = truthIndex.get(guildId) ?? 0;
  if (idx >= arr.length) {
    shuffledTruths.set(guildId, shuffle(TRUTHS));
    idx = 0;
  }
  const q = shuffledTruths.get(guildId)![idx];
  truthIndex.set(guildId, idx + 1);
  return q;
}

function getNextDare(guildId: string): string {
  if (!shuffledDares.has(guildId)) shuffledDares.set(guildId, shuffle(DARES));
  const arr = shuffledDares.get(guildId)!;
  let idx = dareIndex.get(guildId) ?? 0;
  if (idx >= arr.length) {
    shuffledDares.set(guildId, shuffle(DARES));
    idx = 0;
  }
  const q = shuffledDares.get(guildId)![idx];
  dareIndex.set(guildId, idx + 1);
  return q;
}

// ── GIF COMMANDS ─────────────────────────────────────────────────────────────
const gifCommands = [
  { name: 'kiss',      emoji: '💋', description: 'Kiss someone',              color: 0xFF69B4, nsfwGated: false },
  { name: 'hug',       emoji: '🤗', description: 'Hug someone',               color: 0xFFB347, nsfwGated: false },
  { name: 'slap',      emoji: '👋', description: 'Slap someone',              color: 0xFF6347, nsfwGated: false },
  { name: 'pat',       emoji: '👐', description: 'Pat someone',               color: 0xFFD700, nsfwGated: false },
  { name: 'highfive',  emoji: '🖐️', description: 'High five someone',         color: 0x00FF7F, nsfwGated: false },
  { name: 'wave',      emoji: '👋', description: 'Wave at someone',           color: 0x87CEEB, nsfwGated: false },
  { name: 'stare',     emoji: '👀', description: 'Stare at someone',          color: 0x9B59B6, nsfwGated: false },
  { name: 'cry',       emoji: '😭', description: 'Cry',                       color: 0x4169E1, nsfwGated: false },
  { name: 'happy',     emoji: '😄', description: 'Show happiness',            color: 0xFFD700, nsfwGated: false },
  { name: 'sad',       emoji: '😢', description: 'Show sadness',              color: 0x4169E1, nsfwGated: false },
  { name: 'angry',     emoji: '😡', description: 'Show anger',                color: 0xFF0000, nsfwGated: false },
  { name: 'funny',     emoji: '😂', description: 'Be funny / laugh',          color: 0xFFD700, nsfwGated: false },
  { name: 'kick',      emoji: '🦵', description: 'Kick someone',              color: 0xFF4500, nsfwGated: false },
  { name: 'kill',      emoji: '💀', description: 'Kill someone (animated)',   color: 0x8B0000, nsfwGated: false },
  { name: 'punch',     emoji: '👊', description: 'Punch someone',             color: 0xFF4500, nsfwGated: false },
  { name: 'hit',       emoji: '💥', description: 'Hit someone',               color: 0xFF6B35, nsfwGated: false },
  { name: 'wink',      emoji: '😉', description: 'Wink at someone',           color: 0xFFD700, nsfwGated: false },
  { name: 'blush',     emoji: '😊', description: 'Blush',                     color: 0xFF69B4, nsfwGated: false },
  { name: 'bite',      emoji: '😬', description: 'Bite someone',              color: 0xFF6347, nsfwGated: false },
  { name: 'bonk',      emoji: '🔨', description: 'Bonk someone',              color: 0xFF8C00, nsfwGated: false },
  { name: 'poke',      emoji: '👉', description: 'Poke someone',              color: 0xFFD700, nsfwGated: false },
  { name: 'cuddle',    emoji: '🤝', description: 'Cuddle with someone',       color: 0xFFB6C1, nsfwGated: false },
  { name: 'dance',     emoji: '💃', description: 'Dance!',                    color: 0xFF73FA, nsfwGated: false },
  { name: 'baka',      emoji: '🙄', description: 'Call someone baka',         color: 0xFF4500, nsfwGated: false },
  { name: 'yeet',      emoji: '🌀', description: 'Yeet someone',              color: 0x5865F2, nsfwGated: false },
  { name: 'nom',       emoji: '🍽️', description: 'Nom on something',          color: 0xFFA500, nsfwGated: false },
  { name: 'pout',      emoji: '😤', description: 'Pout',                      color: 0xFF6B6B, nsfwGated: false },
  // NSFW-gated
  { name: 'fuck',      emoji: '🔞', description: 'NSFW — requires NSFW access', color: 0xFF1493, nsfwGated: true },
  { name: 'sex',       emoji: '❤️‍🔥', description: 'NSFW — requires NSFW access', color: 0xFF1493, nsfwGated: true },
  { name: 'sexwith',   emoji: '❤️‍🔥', description: 'NSFW — requires NSFW access', color: 0xFF1493, nsfwGated: true },
  { name: 'trap',      emoji: '🏳️‍⚧️', description: 'NSFW — requires NSFW access', color: 0xFF73FA, nsfwGated: true },
];

function makeGifCommand(cmd: typeof gifCommands[0]): BotCommand {
  return {
    name: cmd.name,
    description: cmd.description,
    category: cmd.nsfwGated ? 'NSFW' : 'Fun',
    usage: `${cmd.name} [@user]`,
    async execute(message, args) {
      if (cmd.nsfwGated) {
        if (!hasNsfwAccess(message.author.id, BOT_OWNER_ID))
          return message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.error)
            .setTitle('❌ NSFW Access Required')
            .setDescription('This command requires NSFW access. Ask the bot owner with `!givensfw`.')
            .setFooter(BOT_FOOTER).setTimestamp()] });
        const ch = message.channel as any;
        if (!ch.nsfw && message.guild)
          return message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.error)
            .setTitle('❌ NSFW Channel Required')
            .setDescription('This command can only be used in an **NSFW**-marked channel.')
            .setFooter(BOT_FOOTER).setTimestamp()] });
      }

      const target = message.mentions.users.first();
      const gifUrl = cmd.nsfwGated
        ? await fetchAdultGif(cmd.name)
        : await fetchGif(cmd.name);

      const title = target
        ? `${cmd.emoji} ${message.author.username} ${cmd.name}s ${target.username}`
        : `${cmd.emoji} ${message.author.username} ${cmd.name}s`;

      const embed = new EmbedBuilder()
        .setColor(cmd.color as any)
        .setTitle(title)
        .setFooter(BOT_FOOTER)
        .setTimestamp();
      if (gifUrl) embed.setImage(gifUrl);
      else embed.setDescription('*(GIF unavailable right now — APIs may be temporarily down, try again in a moment)*');
      await message.reply({ embeds: [embed] });
    }
  };
}

const funCommands: BotCommand[] = [
  ...gifCommands.map(makeGifCommand),

  // ── SHIP ──────────────────────────────────────────────────────────────────
  {
    name: 'ship',
    description: 'Ship two users together',
    category: 'Fun',
    usage: 'ship <@user1> [@user2]',
    async execute(message) {
      const user1 = message.mentions.users.first() ?? message.author;
      const user2 = message.mentions.users.at(1) ?? message.author;
      const percent = Math.floor(Math.abs(parseInt(user1.id.slice(-4), 16) ^ parseInt(user2.id.slice(-4), 16)) % 101);
      const bar = '█'.repeat(Math.floor(percent / 10)) + '░'.repeat(10 - Math.floor(percent / 10));
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('💘 Ship Results!')
        .setDescription(`**${user1.username}** ❤️ **${user2.username}**\n\n\`${bar}\` **${percent}%**\n\n${percent >= 80 ? '💞 Perfect match!' : percent >= 50 ? '💕 Pretty good!' : percent >= 30 ? '💔 Could be better...' : '💀 Terrible match!'}`)
        .setFooter(BOT_FOOTER)
        .setTimestamp()] });
    }
  },

  // ── JOKE ──────────────────────────────────────────────────────────────────
  {
    name: 'joke',
    description: 'Get a random joke',
    category: 'Fun',
    usage: 'joke',
    async execute(message) {
      const joke = await fetchJoke();
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.fun)
        .setTitle('😂 Random Joke')
        .setDescription(joke)
        .setFooter(BOT_FOOTER)
        .setTimestamp()] });
    }
  },

  // ── TRUTH ─────────────────────────────────────────────────────────────────
  {
    name: 'truth',
    description: 'Get a random truth question — never repeats until all are used!',
    category: 'Fun',
    usage: 'truth',
    async execute(message) {
      const q = getNextTruth(message.guild!.id);
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(0x00CED1)
        .setTitle('🤔 Truth')
        .setDescription(`> ${q}`)
        .setFooter({ text: '🤖 Made by ogpsychopath1 • Cycles through all questions before repeating' })
        .setTimestamp()] });
    }
  },

  // ── DARE ──────────────────────────────────────────────────────────────────
  {
    name: 'dare',
    description: 'Get a random dare — never repeats until all are used!',
    category: 'Fun',
    usage: 'dare',
    async execute(message) {
      const d = getNextDare(message.guild!.id);
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(0xFF4500)
        .setTitle('🎯 Dare')
        .setDescription(`> ${d}`)
        .setFooter({ text: '🤖 Made by ogpsychopath1 • Cycles through all dares before repeating' })
        .setTimestamp()] });
    }
  },

  // ── TRUTH OR DARE ─────────────────────────────────────────────────────────
  {
    name: 'tod',
    description: 'Truth or Dare — random pick',
    category: 'Fun',
    aliases: ['truthordare'],
    usage: 'tod',
    async execute(message) {
      const isTruth = Math.random() < 0.5;
      const content = isTruth ? getNextTruth(message.guild!.id) : getNextDare(message.guild!.id);
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(isTruth ? 0x00CED1 : 0xFF4500)
        .setTitle(isTruth ? '🤔 Truth' : '🎯 Dare')
        .setDescription(`> ${content}`)
        .setFooter({ text: '🤖 Made by ogpsychopath1 • Cycles through all questions before repeating' })
        .setTimestamp()] });
    }
  },

  // ── ROCK PAPER SCISSORS ───────────────────────────────────────────────────
  {
    name: 'rps',
    description: 'Play rock paper scissors',
    category: 'Fun',
    aliases: ['rockpaperscissors'],
    usage: 'rps <rock|paper|scissors>',
    async execute(message, args) {
      const choices = ['rock', 'paper', 'scissors'] as const;
      const emojis: Record<string, string> = { rock: '🪨', paper: '📄', scissors: '✂️' };
      const userChoice = args[0]?.toLowerCase();
      if (!choices.includes(userChoice as any))
        return message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.error)
          .setTitle('❌ Invalid').setDescription('Choose **rock**, **paper**, or **scissors**.')
          .setFooter(BOT_FOOTER).setTimestamp()] });
      const botChoice = choices[Math.floor(Math.random() * 3)];
      let result = '';
      if (userChoice === botChoice) result = "It's a tie! 🤝";
      else if ((userChoice === 'rock' && botChoice === 'scissors') || (userChoice === 'paper' && botChoice === 'rock') || (userChoice === 'scissors' && botChoice === 'paper')) result = 'You win! 🎉';
      else result = 'I win! 😈';
      await message.reply({ embeds: [new EmbedBuilder().setColor(0x9B59B6).setTitle('🎮 Rock Paper Scissors')
        .addFields(
          { name: 'Your Choice', value: `${emojis[userChoice!]} ${userChoice}`, inline: true },
          { name: 'My Choice', value: `${emojis[botChoice]} ${botChoice}`, inline: true },
          { name: 'Result', value: result })
        .setFooter(BOT_FOOTER).setTimestamp()] });
    }
  },

  // ── 8BALL ─────────────────────────────────────────────────────────────────
  {
    name: '8ball',
    description: 'Ask the magic 8-ball a question',
    category: 'Fun',
    usage: '8ball <question>',
    async execute(message, args) {
      if (!args.length) return message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.error)
        .setTitle('❌ Ask a question!').setFooter(BOT_FOOTER).setTimestamp()] });
      const responses = [
        'It is certain.', 'It is decidedly so.', 'Without a doubt.', 'Yes, definitely.',
        'You may rely on it.', 'As I see it, yes.', 'Most likely.', 'Outlook good.',
        'Yes.', 'Signs point to yes.', 'Reply hazy, try again.', 'Ask again later.',
        'Better not tell you now.', 'Cannot predict now.', 'Concentrate and ask again.',
        "Don't count on it.", 'My reply is no.', 'My sources say no.',
        'Outlook not so good.', 'Very doubtful.',
      ];
      await message.reply({ embeds: [new EmbedBuilder().setColor(0x1a0530).setTitle('🎱 Magic 8-Ball')
        .addFields({ name: '❓ Question', value: args.join(' ') }, { name: '🎱 Answer', value: responses[Math.floor(Math.random() * responses.length)] })
        .setFooter(BOT_FOOTER).setTimestamp()] });
    }
  },
];

export default funCommands;
