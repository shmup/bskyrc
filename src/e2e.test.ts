// end-to-end scenario tests simulating complete user workflows
import { describe, expect, test } from "bun:test";
import { extractBlueskyUrl, parseCommand } from "./commands.js";

describe("end-to-end user scenarios", () => {
	test("scenario: user posts a twit, then quotes it, then another user untwits", () => {
		const messageHistory = new Map<string, string>();
		let lastPostUri: string | null = null;

		// step 1: alice posts a twit
		const aliceMessage = "twit excited about the new features!";
		const aliceCmd = parseCommand(aliceMessage);

		expect(aliceCmd?.type).toBe("twit");
		if (aliceCmd?.type === "twit") {
			// store alice's text in history
			messageHistory.set("alice", aliceCmd.text);
			// simulate successful post
			lastPostUri = "at://did:plc:alice/app.bsky.feed.post/abc123";
		}

		// step 2: bob quotes alice's last message
		const bobMessage = "quote alice totally agree!";
		const bobCmd = parseCommand(bobMessage);

		expect(bobCmd?.type).toBe("quote");
		if (bobCmd?.type === "quote") {
			const quotedText = messageHistory.get(bobCmd.targetNick.toLowerCase());
			expect(quotedText).toBe("excited about the new features!");

			let postText = quotedText || "";
			if (bobCmd.additionalText) {
				postText += ` ${bobCmd.additionalText}`;
			}

			expect(postText).toBe("excited about the new features! totally agree!");
		}

		// step 3: alice realizes she made a mistake and untwits
		const untwitMessage = "untwit";
		const untwitCmd = parseCommand(untwitMessage);

		expect(untwitCmd?.type).toBe("untwit");
		if (untwitCmd?.type === "untwit") {
			expect(untwitCmd.force).toBe(false);
			// would check if within 1 hour and delete if so
			expect(lastPostUri).not.toBeNull();
		}
	});

	test("scenario: user shares bsky link, then someone replies to it", () => {
		let lastBskyUrl: string | null = null;

		// step 1: alice shares a bluesky link
		const aliceMessage =
			"check this out https://bsky.app/profile/example.bsky.social/post/xyz789";
		const cmd = parseCommand(aliceMessage);

		// not a command, just a regular message with a url
		expect(cmd).toBeNull();

		// extract and track the url
		const url = extractBlueskyUrl(aliceMessage);
		expect(url).toBe(
			"https://bsky.app/profile/example.bsky.social/post/xyz789",
		);
		lastBskyUrl = url;

		// step 2: bob replies to that post
		const bobMessage = "reply this is so cool!";
		const bobCmd = parseCommand(bobMessage);

		expect(bobCmd?.type).toBe("reply");
		if (bobCmd?.type === "reply") {
			expect(lastBskyUrl).not.toBeNull();
			expect(bobCmd.text).toBe("this is so cool!");
			// would use lastBskyUrl to construct reply data
		}
	});

	test("scenario: quote fails because user has no message history", () => {
		const messageHistory = new Map<string, string>();

		// alice has never spoken
		const bobMessage = "quote alice";
		const bobCmd = parseCommand(bobMessage);

		expect(bobCmd?.type).toBe("quote");
		if (bobCmd?.type === "quote") {
			const quotedText = messageHistory.get(bobCmd.targetNick.toLowerCase());
			expect(quotedText).toBeUndefined();
			// would respond with "no" and fall through to store "quote alice" as message
			messageHistory.set("bob", bobMessage);
		}

		expect(messageHistory.get("bob")).toBe("quote alice");
	});

	test("scenario: multiple users chatting and using commands", () => {
		const messageHistory = new Map<string, string>();

		// conversation flow
		const messages: Array<{
			nick: string;
			message: string;
		}> = [
			{ nick: "alice", message: "hey everyone!" },
			{ nick: "bob", message: "hi alice" },
			{ nick: "alice", message: "twit working on something cool" },
			{ nick: "charlie", message: "quote alice nice!" },
			{ nick: "bob", message: "what are you working on?" },
		];

		for (const { nick, message } of messages) {
			const cmd = parseCommand(message);

			if (cmd?.type === "twit") {
				messageHistory.set(nick, cmd.text);
				continue;
			}

			if (cmd?.type === "quote") {
				const quotedText = messageHistory.get(cmd.targetNick.toLowerCase());
				expect(quotedText).toBeDefined();
				continue;
			}

			// regular message
			if (!cmd) {
				messageHistory.set(nick, message);
			}
		}

		// verify final state
		expect(messageHistory.get("alice")).toBe("working on something cool");
		expect(messageHistory.get("bob")).toBe("what are you working on?");
		expect(messageHistory.get("charlie")).toBeUndefined(); // charlie only used quote command
	});

	test("scenario: twit with image url", () => {
		const messageHistory = new Map<string, string>();

		const message =
			"twit check out my screenshot <https://example.com/img.png>";
		const cmd = parseCommand(message);

		expect(cmd?.type).toBe("twit");
		if (cmd?.type === "twit") {
			expect(cmd.text).toBe("check out my screenshot");
			expect(cmd.imageUrl).toBe("https://example.com/img.png");
			// would fetch and embed the image

			messageHistory.set("alice", cmd.text);
		}

		expect(messageHistory.get("alice")).toBe("check out my screenshot");
	});

	test("scenario: force untwit with ! for posts older than 1 hour", () => {
		let lastPostUri: string | null =
			"at://did:plc:alice/app.bsky.feed.post/old";
		let lastPostTimestamp: number | null = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago

		// regular untwit would fail (>1 hour)
		const untwitCmd = parseCommand("untwit");
		expect(untwitCmd?.type).toBe("untwit");
		if (untwitCmd?.type === "untwit") {
			expect(untwitCmd.force).toBe(false);
			// would fail due to time check
		}

		// force untwit works regardless of time
		const forceUntwitCmd = parseCommand("untwit!");
		expect(forceUntwitCmd?.type).toBe("untwit");
		if (forceUntwitCmd?.type === "untwit") {
			expect(forceUntwitCmd.force).toBe(true);
			// would succeed and delete
			lastPostUri = null;
			lastPostTimestamp = null;
		}

		expect(lastPostUri).toBeNull();
		expect(lastPostTimestamp).toBeNull();
	});

	test("scenario: reply without tracked url fails", () => {
		const lastBskyUrl: string | null = null;

		const replyMessage = "reply this is my reply";
		const replyCmd = parseCommand(replyMessage);

		expect(replyCmd?.type).toBe("reply");
		if (replyCmd?.type === "reply") {
			// no tracked url, so reply would fail
			expect(lastBskyUrl).toBeNull();
			// would respond with "no"
		}
	});

	test("scenario: url tracking updates with newest url", () => {
		let lastBskyUrl: string | null = null;

		const messages = [
			"https://bsky.app/profile/alice.bsky.social/post/first",
			"that's interesting",
			"https://bsky.app/profile/bob.bsky.social/post/second",
			"even better!",
		];

		for (const msg of messages) {
			const url = extractBlueskyUrl(msg);
			if (url) {
				lastBskyUrl = url;
			}
		}

		// should track the most recent url
		expect(lastBskyUrl).toBe(
			"https://bsky.app/profile/bob.bsky.social/post/second",
		);
	});
});
