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
 * check if a url is an image by mime type
 */
async function isImageUrl(url: string): Promise<boolean> {
	try {
		const response = await fetch(url, { method: "HEAD" });
		const contentType = response.headers.get("content-type");
		return contentType?.startsWith("image/") || false;
	} catch {
		return false;
	}
}

/**
 * helper function to extract image urls from text
 */
async function extractImageUrls(text: string): Promise<{
	cleanText: string;
	imageUrls?: string[];
}> {
	// pattern for urls with image file extensions
	const imageExtPattern =
		/https?:\/\/\S+\.(jpg|jpeg|png|gif|webp|bmp)(\?\S*)?/gi;
	// pattern for all urls
	const urlPattern = /https?:\/\/\S+/gi;

	const urlsWithExtensions = text.match(imageExtPattern) || [];
	const allUrls = text.match(urlPattern) || [];

	// urls without image extensions that need mime type checking
	const urlsToCheck = allUrls.filter(
		(url) => !urlsWithExtensions.some((imgUrl) => imgUrl === url),
	);

	// check mime types for urls without extensions
	const mimeChecks = await Promise.all(
		urlsToCheck.map(async (url) => ({
			isImage: await isImageUrl(url),
			url,
		})),
	);

	const urlsWithMimeImages = mimeChecks
		.filter((result) => result.isImage)
		.map((result) => result.url);

	// combine urls with extensions and urls detected via mime type
	const allImageUrls = [...urlsWithExtensions, ...urlsWithMimeImages];

	// remove all image urls from text
	let cleanText = text;
	for (const imageUrl of allImageUrls) {
		cleanText = cleanText.replace(imageUrl, "");
	}
	cleanText = cleanText.trim();

	return {
		cleanText,
		imageUrls: allImageUrls.length > 0 ? allImageUrls : undefined,
	};
}

/**
 * parse a message to see if it matches the twit command pattern
 */
export async function parseTwitCommand(
	message: string,
): Promise<TwitCommand | null> {
	const match = message.match(/^twit\s+(.+)$/i);
	if (!match) return null;

	const fullText = match[1] as string;
	const { cleanText, imageUrls } = await extractImageUrls(fullText);

	return {
		imageUrls,
		text: cleanText,
		type: "twit",
	};
}

/**
 * parse a message to see if it matches the quote command pattern
 */
export async function parseQuoteCommand(
	message: string,
): Promise<QuoteCommand | null> {
	const match = message.match(/^quote\s+(\S+)(?:\s+(.+))?$/i);
	if (!match) return null;

	const targetNick = match[1] as string;
	const additionalText = match[2];

	// extract images from additional text if present
	let cleanAdditionalText: string | undefined;
	let imageUrls: string[] | undefined;

	if (additionalText) {
		const extracted = await extractImageUrls(additionalText.trim());
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
export async function parseReplyCommand(
	message: string,
): Promise<ReplyCommand | null> {
	const match = message.match(/^reply\s+(.+)$/i);
	if (!match) return null;

	const fullText = match[1] as string;
	const { cleanText, imageUrls } = await extractImageUrls(fullText);

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
export async function parseCommand(message: string): Promise<Command> {
	// try each command type in order
	const twitCmd = await parseTwitCommand(message);
	if (twitCmd) return twitCmd;

	const quoteCmd = await parseQuoteCommand(message);
	if (quoteCmd) return quoteCmd;

	const replyCmd = await parseReplyCommand(message);
	if (replyCmd) return replyCmd;

	const untwitCmd = parseUntwitCommand(message);
	if (untwitCmd) return untwitCmd;

	const supCmd = parseSupCommand(message);
	if (supCmd) return supCmd;

	return null;
}
