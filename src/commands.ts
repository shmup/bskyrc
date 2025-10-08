// command parsing and validation logic for irc messages
export type TwitCommand = {
	type: "twit";
	text: string;
	imageUrls?: string[];
};

export type QuoteCommand = {
	type: "quote";
	targetNick: string;
	additionalText?: string;
	imageUrls?: string[];
};

export type ReplyCommand = {
	type: "reply";
	text: string;
	imageUrls?: string[];
};

export type UntwitCommand = {
	type: "untwit";
	force: boolean;
};

export type SupCommand = {
	type: "sup";
	handle: string;
};

export type Command =
	| TwitCommand
	| QuoteCommand
	| ReplyCommand
	| UntwitCommand
	| SupCommand
	| null;

/**
 * helper function to extract image urls from text
 */
function extractImageUrls(text: string): {
	cleanText: string;
	imageUrls?: string[];
} {
	const imageUrlPattern =
		/https?:\/\/\S+\.(jpg|jpeg|png|gif|webp|bmp)(\?\S*)?/gi;
	const imageUrls = text.match(imageUrlPattern);
	const cleanText = text.replace(imageUrlPattern, "").trim();

	return {
		cleanText,
		imageUrls: imageUrls || undefined,
	};
}

/**
 * parse a message to see if it matches the twit command pattern
 */
export function parseTwitCommand(message: string): TwitCommand | null {
	const match = message.match(/^twit\s+(.+)$/i);
	if (!match) return null;

	const fullText = match[1] as string;
	const { cleanText, imageUrls } = extractImageUrls(fullText);

	return {
		imageUrls,
		text: cleanText,
		type: "twit",
	};
}

/**
 * parse a message to see if it matches the quote command pattern
 */
export function parseQuoteCommand(message: string): QuoteCommand | null {
	const match = message.match(/^quote\s+(\S+)(?:\s+(.+))?$/i);
	if (!match) return null;

	const targetNick = match[1] as string;
	const additionalText = match[2];

	// extract images from additional text if present
	let cleanAdditionalText: string | undefined;
	let imageUrls: string[] | undefined;

	if (additionalText) {
		const extracted = extractImageUrls(additionalText.trim());
		cleanAdditionalText = extracted.cleanText || undefined;
		imageUrls = extracted.imageUrls;
	}

	return {
		additionalText: cleanAdditionalText,
		imageUrls,
		targetNick,
		type: "quote",
	};
}

/**
 * parse a message to see if it matches the reply command pattern
 */
export function parseReplyCommand(message: string): ReplyCommand | null {
	const match = message.match(/^reply\s+(.+)$/i);
	if (!match) return null;

	const fullText = match[1] as string;
	const { cleanText, imageUrls } = extractImageUrls(fullText);

	return {
		imageUrls,
		text: cleanText,
		type: "reply",
	};
}

/**
 * parse a message to see if it matches the untwit command pattern
 */
export function parseUntwitCommand(message: string): UntwitCommand | null {
	if (message.match(/^untwit!$/i)) {
		return { force: true, type: "untwit" };
	}
	if (message.match(/^untwit$/i)) {
		return { force: false, type: "untwit" };
	}
	return null;
}

/**
 * parse a message to see if it matches the sup command pattern
 */
export function parseSupCommand(message: string): SupCommand | null {
	const match = message.match(/^sup\s+(\S+)$/i);
	if (!match) return null;

	const handle = match[1] as string;

	return {
		handle,
		type: "sup",
	};
}

/**
 * extract bluesky url from a message if present
 */
export function extractBlueskyUrl(message: string): string | null {
	const match = message.match(
		/https?:\/\/bsky\.app\/profile\/[^/\s]+\/post\/[a-z0-9]+/i,
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
		parseUntwitCommand(message) ||
		parseSupCommand(message)
	);
}
