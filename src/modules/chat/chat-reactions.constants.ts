/** Полный allowlist для PUT /reactions. */
export const CHAT_REACTION_EMOJIS = [
  '👍',
  '👎',
  '❤️',
  '🔥',
  '🥰',
  '😁',
  '😢',
  '😮',
  '😡',
  '🎉',
  '👏',
  '🙏',
  '💯',
  '✨',
  '🤔',
  '😎',
  '💩',
  '🤡',
  '👀',
  '🫡',
] as const;

export type ChatReactionEmoji = (typeof CHAT_REACTION_EMOJIS)[number];

const emojiOrder = new Map<string, number>(
  CHAT_REACTION_EMOJIS.map((emoji, index) => [emoji, index]),
);

export function isAllowedChatReactionEmoji(emoji: string): emoji is ChatReactionEmoji {
  return emojiOrder.has(emoji);
}

export function compareReactionEmojis(a: string, b: string): number {
  return (emojiOrder.get(a) ?? 999) - (emojiOrder.get(b) ?? 999);
}
