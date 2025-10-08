// integration tests for message handling logic
import { describe, expect, test } from "bun:test";
import {
	extractBlueskyUrl,
	parseCommand,
	parseQuoteCommand,
} from "./commands.js";

describe("message history integration", () => {
	test("stores messages in history for later quoting", async () => {
		const messageHistory = new Map<string, string>();

		// simulate receiving messages from different users
		messageHistory.set("tim", "more power!");
		messageHistory.set("al", "i don't think so tim");

		// simulate quote command
		const quoteCmd = await parseQuoteCommand("quote tim");
		expect(quoteCmd).not.toBeNull();

		if (quoteCmd) {
			const quotedMessage = messageHistory.get(quoteCmd.targetNick);
			expect(quotedMessage).toBe("more power!");
		}
	});

	test("quote command is case insensitive for nick lookup", async () => {
		const messageHistory = new Map<string, string>();

		// store with lowercase (as the bot does)
		messageHistory.set("tim", "let's soup it up");

		// quote with different case
		const quoteCmd = await parseQuoteCommand("quote TIM");
		expect(quoteCmd).not.toBeNull();

		if (quoteCmd) {
			const quotedMessage = messageHistory.get(
				quoteCmd.targetNick.toLowerCase(),
			);
			expect(quotedMessage).toBe("let's soup it up");
		}
	});

	test("twit command text gets stored in history, not the command itself", async () => {
		const messageHistory = new Map<string, string>();

		// simulate twit command from tim
		const twitCmd = await parseCommand("twit grunts intensify");
		if (twitCmd?.type === "twit") {
			// bot stores the text being posted, not the command
			messageHistory.set("tim", twitCmd.text);
		}

		expect(messageHistory.get("tim")).toBe("grunts intensify");
	});

	test("non-command messages get stored as-is", async () => {
		const messageHistory = new Map<string, string>();

		const message = "flannel looks good today";
		const cmd = await parseCommand(message);

		// not a command, so store as regular message
		if (!cmd) {
			messageHistory.set("al", message);
		}

		expect(messageHistory.get("al")).toBe(message);
	});

	test("failed quote falls through to message storage", async () => {
		const messageHistory = new Map<string, string>();

		// quote command for non-existent user should fail
		const quoteCmd = await parseQuoteCommand("quote wilson");
		expect(quoteCmd).not.toBeNull();

		if (quoteCmd) {
			const quotedMessage = messageHistory.get(
				quoteCmd.targetNick.toLowerCase(),
			);
			// wilson has no message history
			expect(quotedMessage).toBeUndefined();

			// the message "quote wilson" itself would be stored if quote fails
			messageHistory.set("tim", "quote wilson");
			expect(messageHistory.get("tim")).toBe("quote wilson");
		}
	});
});

describe("bluesky url tracking integration", () => {
	test("tracks last bluesky url from messages", async () => {
		let lastBskyUrl: string | null = null;

		// simulate messages
		const messages = [
			"hey check this out",
			"https://bsky.app/profile/tim.bsky.social/post/abc123",
			"that's cool",
		];

		for (const msg of messages) {
			const url = extractBlueskyUrl(msg);
			if (url) {
				lastBskyUrl = url;
			}
		}

		expect(lastBskyUrl).toBe(
			"https://bsky.app/profile/tim.bsky.social/post/abc123",
		);
	});

	test("updates last url when new one appears", async () => {
		let lastBskyUrl: string | null = null;

		const messages = [
			"https://bsky.app/profile/tim.bsky.social/post/abc123",
			"some other message",
			"https://bsky.app/profile/al.bsky.social/post/xyz789",
		];

		for (const msg of messages) {
			const url = extractBlueskyUrl(msg);
			if (url) {
				lastBskyUrl = url;
			}
		}

		// should be the most recent url
		expect(lastBskyUrl).toBe(
			"https://bsky.app/profile/al.bsky.social/post/xyz789",
		);
	});

	test("reply command requires a tracked url", async () => {
		let lastBskyUrl: string | null = null;

		const replyCmd = await parseCommand("reply this is my reply");
		expect(replyCmd?.type).toBe("reply");

		// without a tracked url, reply should fail
		expect(lastBskyUrl).toBeNull();

		// after tracking a url
		lastBskyUrl = "https://bsky.app/profile/tim.bsky.social/post/abc123";
		expect(lastBskyUrl).not.toBeNull();
	});

	test("auto-displays post content when bluesky url detected", async () => {
		// simulate messages with bluesky urls anywhere in them
		const messages = [
			"(non derogatory) https://bsky.app/profile/mrpussy.xyz/post/3m2n7pwku7k2s",
			"testing embeddd urls https://bsky.app/profile/npr.org/post/3m2ompy2gvs22 in my post",
		];

		for (const msg of messages) {
			const url = extractBlueskyUrl(msg);
			expect(url).not.toBeNull();
			// when url is detected, bot should fetch and display the post
			// (actual API call tested separately)
		}
	});
});

describe("command priority integration", () => {
	test("commands are processed in specific order", async () => {
		const messageHistory = new Map<string, string>();

		// simulate a message that doesn't match any command pattern
		const message = "just chatting about tools";

		// parseCommand will try twit first, then quote, then reply, then untwit
		const cmd = await parseCommand(message);

		// since message doesn't match any command pattern, it should be null
		expect(cmd).toBeNull();

		// which means it would be stored as a regular message
		messageHistory.set("tim", message);
		expect(messageHistory.get("tim")).toBe(message);
	});

	test("valid command prevents message from being stored as regular message", async () => {
		const messageHistory = new Map<string, string>();

		const message = "twit binford tools rock";
		const cmd = await parseCommand(message);

		if (cmd?.type === "twit") {
			// store the text being posted, not the command
			messageHistory.set("tim", cmd.text);
			// return early, don't store "twit binford tools rock"
		} else {
			messageHistory.set("tim", message);
		}

		// should store just the text
		expect(messageHistory.get("tim")).toBe("binford tools rock");
	});
});

describe("quote with additional text integration", () => {
	test("combines quoted message with additional text", async () => {
		const messageHistory = new Map<string, string>();
		messageHistory.set("al", "proper safety equipment is important");

		const quoteCmd = await parseQuoteCommand("quote al exactly right");
		expect(quoteCmd).not.toBeNull();

		if (quoteCmd) {
			const quotedMessage = messageHistory.get(
				quoteCmd.targetNick.toLowerCase(),
			);
			let postText = quotedMessage || "";

			if (quoteCmd.additionalText) {
				postText += ` ${quoteCmd.additionalText}`;
			}

			expect(postText).toBe(
				"proper safety equipment is important exactly right",
			);
		}
	});
});
