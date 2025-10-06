// integration tests for message handling logic
import { describe, expect, test } from "bun:test";
import {
	extractBlueskyUrl,
	parseCommand,
	parseQuoteCommand,
} from "./commands.js";

describe("message history integration", () => {
	test("stores messages in history for later quoting", () => {
		const messageHistory = new Map<string, string>();

		// simulate receiving messages from different users
		messageHistory.set("alice", "I love typescript");
		messageHistory.set("bob", "bun is amazing");

		// simulate quote command
		const quoteCmd = parseQuoteCommand("quote alice");
		expect(quoteCmd).not.toBeNull();

		if (quoteCmd) {
			const quotedMessage = messageHistory.get(quoteCmd.targetNick);
			expect(quotedMessage).toBe("I love typescript");
		}
	});

	test("quote command is case insensitive for nick lookup", () => {
		const messageHistory = new Map<string, string>();

		// store with lowercase (as the bot does)
		messageHistory.set("alice", "hello world");

		// quote with different case
		const quoteCmd = parseQuoteCommand("quote ALICE");
		expect(quoteCmd).not.toBeNull();

		if (quoteCmd) {
			const quotedMessage = messageHistory.get(
				quoteCmd.targetNick.toLowerCase(),
			);
			expect(quotedMessage).toBe("hello world");
		}
	});

	test("twit command text gets stored in history, not the command itself", () => {
		const messageHistory = new Map<string, string>();

		// simulate twit command from alice
		const twitCmd = parseCommand("twit hello world");
		if (twitCmd?.type === "twit") {
			// bot stores the text being posted, not the command
			messageHistory.set("alice", twitCmd.text);
		}

		expect(messageHistory.get("alice")).toBe("hello world");
	});

	test("non-command messages get stored as-is", () => {
		const messageHistory = new Map<string, string>();

		const message = "just a regular chat message";
		const cmd = parseCommand(message);

		// not a command, so store as regular message
		if (!cmd) {
			messageHistory.set("bob", message);
		}

		expect(messageHistory.get("bob")).toBe(message);
	});

	test("failed quote falls through to message storage", () => {
		const messageHistory = new Map<string, string>();

		// quote command for non-existent user should fail
		const quoteCmd = parseQuoteCommand("quote charlie");
		expect(quoteCmd).not.toBeNull();

		if (quoteCmd) {
			const quotedMessage = messageHistory.get(
				quoteCmd.targetNick.toLowerCase(),
			);
			// charlie has no message history
			expect(quotedMessage).toBeUndefined();

			// the message "quote charlie" itself would be stored if quote fails
			messageHistory.set("alice", "quote charlie");
			expect(messageHistory.get("alice")).toBe("quote charlie");
		}
	});
});

describe("bluesky url tracking integration", () => {
	test("tracks last bluesky url from messages", () => {
		let lastBskyUrl: string | null = null;

		// simulate messages
		const messages = [
			"hey check this out",
			"https://bsky.app/profile/alice.bsky.social/post/abc123",
			"that's cool",
		];

		for (const msg of messages) {
			const url = extractBlueskyUrl(msg);
			if (url) {
				lastBskyUrl = url;
			}
		}

		expect(lastBskyUrl).toBe(
			"https://bsky.app/profile/alice.bsky.social/post/abc123",
		);
	});

	test("updates last url when new one appears", () => {
		let lastBskyUrl: string | null = null;

		const messages = [
			"https://bsky.app/profile/alice.bsky.social/post/abc123",
			"some other message",
			"https://bsky.app/profile/bob.bsky.social/post/xyz789",
		];

		for (const msg of messages) {
			const url = extractBlueskyUrl(msg);
			if (url) {
				lastBskyUrl = url;
			}
		}

		// should be the most recent url
		expect(lastBskyUrl).toBe(
			"https://bsky.app/profile/bob.bsky.social/post/xyz789",
		);
	});

	test("reply command requires a tracked url", () => {
		let lastBskyUrl: string | null = null;

		const replyCmd = parseCommand("reply this is my reply");
		expect(replyCmd?.type).toBe("reply");

		// without a tracked url, reply should fail
		expect(lastBskyUrl).toBeNull();

		// after tracking a url
		lastBskyUrl = "https://bsky.app/profile/alice.bsky.social/post/abc123";
		expect(lastBskyUrl).not.toBeNull();
	});
});

describe("command priority integration", () => {
	test("commands are processed in specific order", () => {
		const messageHistory = new Map<string, string>();

		// simulate a message that doesn't match any command pattern
		const message = "just chatting about stuff";

		// parseCommand will try twit first, then quote, then reply, then untwit
		const cmd = parseCommand(message);

		// since message doesn't match any command pattern, it should be null
		expect(cmd).toBeNull();

		// which means it would be stored as a regular message
		messageHistory.set("alice", message);
		expect(messageHistory.get("alice")).toBe(message);
	});

	test("valid command prevents message from being stored as regular message", () => {
		const messageHistory = new Map<string, string>();

		const message = "twit hello world";
		const cmd = parseCommand(message);

		if (cmd?.type === "twit") {
			// store the text being posted, not the command
			messageHistory.set("alice", cmd.text);
			// return early, don't store "twit hello world"
		} else {
			messageHistory.set("alice", message);
		}

		// should store just the text
		expect(messageHistory.get("alice")).toBe("hello world");
	});
});

describe("quote with additional text integration", () => {
	test("combines quoted message with additional text", () => {
		const messageHistory = new Map<string, string>();
		messageHistory.set("bob", "I think TypeScript is great");

		const quoteCmd = parseQuoteCommand("quote bob lol so true");
		expect(quoteCmd).not.toBeNull();

		if (quoteCmd) {
			const quotedMessage = messageHistory.get(
				quoteCmd.targetNick.toLowerCase(),
			);
			let postText = quotedMessage || "";

			if (quoteCmd.additionalText) {
				postText += ` ${quoteCmd.additionalText}`;
			}

			expect(postText).toBe("I think TypeScript is great lol so true");
		}
	});
});
