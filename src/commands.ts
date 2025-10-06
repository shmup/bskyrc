// command parsing and validation logic for irc messages
export type TwitCommand = {
	type: "twit";
	text: string;
	imageUrl?: string;
};

export type QuoteCommand = {
	type: "quote";
	targetNick: string;
	additionalText?: string;
};

export type ReplyCommand = {
	type: "reply";
	text: string;
};

export type UntwitCommand = {
	type: "untwit";
	force: boolean;
};

export type Command =
	| TwitCommand
	| QuoteCommand
	| ReplyCommand
	| UntwitCommand
	| null;

/**
 * parse a message to see if it matches the twit command pattern
 */
export function parseTwitCommand(message: string): TwitCommand | null {
	const match = message.match(/^twit\s+(.+?)(?:\s+<(.+)>)?$/i);
	if (!match) return null;

	const [, text, imageUrl] = match;
	return {
		type: "twit",
		text: text.trim(),
		imageUrl: imageUrl?.trim(),
	};
}

/**
 * parse a message to see if it matches the quote command pattern
 */
export function parseQuoteCommand(message: string): QuoteCommand | null {
	const match = message.match(/^quote\s+(\S+)(?:\s+(.+))?$/i);
	if (!match) return null;

	const [, targetNick, additionalText] = match;
	return {
		type: "quote",
		targetNick,
		additionalText: additionalText?.trim(),
	};
}

/**
 * parse a message to see if it matches the reply command pattern
 */
export function parseReplyCommand(message: string): ReplyCommand | null {
	const match = message.match(/^reply\s+(.+)$/i);
	if (!match) return null;

	const [, text] = match;
	return {
		type: "reply",
		text: text.trim(),
	};
}

/**
 * parse a message to see if it matches the untwit command pattern
 */
export function parseUntwitCommand(message: string): UntwitCommand | null {
	if (message.match(/^untwit!$/i)) {
		return { type: "untwit", force: true };
	}
	if (message.match(/^untwit$/i)) {
		return { type: "untwit", force: false };
	}
	return null;
}

/**
 * extract bluesky url from a message if present
 */
export function extractBlueskyUrl(message: string): string | null {
	const match = message.match(
		/https?:\/\/bsky\.app\/profile\/[^/]+\/post\/[^/\s]+/i,
	);
	return match ? match[0] : null;
}

/**
 * parse any command from a message
 */
export function parseCommand(message: string): Command {
	return (
		parseTwitCommand(message) ||
		parseQuoteCommand(message) ||
		parseReplyCommand(message) ||
		parseUntwitCommand(message)
	);
}
