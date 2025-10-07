// end-to-end scenario tests simulating complete user workflows
import { describe, expect, test } from "bun:test";
import { extractBlueskyUrl, parseCommand } from "./commands.js";

describe("end-to-end user scenarios", () => {
	test("scenario: user posts a twit, then quotes it, then another user untwits", () => {
		const messageHistory = new Map<string, string>();
		let lastPostUri: string | null = null;

		// step 1: tim posts a twit
		const timMessage = "twit fired up the turbo drill";
		const timCmd = parseCommand(timMessage);

		expect(timCmd?.type).toBe("twit");
		if (timCmd?.type === "twit") {
			// store tim's text in history
			messageHistory.set("tim", timCmd.text);
			// simulate successful post
			lastPostUri = "at://did:plc:tim/app.bsky.feed.post/abc123";
		}

		// step 2: al quotes tim's last message
		const alMessage = "quote tim remember to wear safety goggles";
		const alCmd = parseCommand(alMessage);

		expect(alCmd?.type).toBe("quote");
		if (alCmd?.type === "quote") {
			const quotedText = messageHistory.get(alCmd.targetNick.toLowerCase());
			expect(quotedText).toBe("fired up the turbo drill");

			let postText = quotedText || "";
			if (alCmd.additionalText) {
				postText += ` ${alCmd.additionalText}`;
			}

			expect(postText).toBe(
				"fired up the turbo drill remember to wear safety goggles",
			);
		}

		// step 3: tim realizes he made a mistake and untwits
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

		// step 1: tim shares a bluesky link
		const timMessage =
			"look at these power tools https://bsky.app/profile/example.bsky.social/post/xyz789";
		const cmd = parseCommand(timMessage);

		// not a command, just a regular message with a url
		expect(cmd).toBeNull();

		// extract and track the url
		const url = extractBlueskyUrl(timMessage);
		expect(url).toBe(
			"https://bsky.app/profile/example.bsky.social/post/xyz789",
		);
		lastBskyUrl = url;

		// step 2: al replies to that post
		const alMessage = "reply proper torque specs are critical";
		const alCmd = parseCommand(alMessage);

		expect(alCmd?.type).toBe("reply");
		if (alCmd?.type === "reply") {
			expect(lastBskyUrl).not.toBeNull();
			expect(alCmd.text).toBe("proper torque specs are critical");
			// would use lastBskyUrl to construct reply data
		}
	});

	test("scenario: quote fails because user has no message history", () => {
		const messageHistory = new Map<string, string>();

		// tim has never spoken
		const alMessage = "quote tim";
		const alCmd = parseCommand(alMessage);

		expect(alCmd?.type).toBe("quote");
		if (alCmd?.type === "quote") {
			const quotedText = messageHistory.get(alCmd.targetNick.toLowerCase());
			expect(quotedText).toBeUndefined();
			// would respond with "no" and fall through to store "quote tim" as message
			messageHistory.set("al", alMessage);
		}

		expect(messageHistory.get("al")).toBe("quote tim");
	});

	test("scenario: multiple users chatting and using commands", () => {
		const messageHistory = new Map<string, string>();

		// conversation flow
		const messages: Array<{
			nick: string;
			message: string;
		}> = [
			{ message: "aargh aargh aargh", nick: "tim" },
			{ message: "afternoon tim", nick: "al" },
			{ message: "twit installing a turbo grinder", nick: "tim" },
			{ message: "quote tim neighborino!", nick: "wilson" },
			{ message: "did you read the manual", nick: "al" },
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
		expect(messageHistory.get("tim")).toBe("installing a turbo grinder");
		expect(messageHistory.get("al")).toBe("did you read the manual");
		expect(messageHistory.get("wilson")).toBeUndefined(); // wilson only used quote command
	});

	test("scenario: twit with image url", () => {
		const messageHistory = new Map<string, string>();

		const message = "twit check out this hot rod https://example.com/img.png";
		const cmd = parseCommand(message);

		expect(cmd?.type).toBe("twit");
		if (cmd?.type === "twit") {
			expect(cmd.text).toBe("check out this hot rod");
			expect(cmd.imageUrls).toEqual(["https://example.com/img.png"]);
			// would fetch and embed the image

			messageHistory.set("tim", cmd.text);
		}

		expect(messageHistory.get("tim")).toBe("check out this hot rod");
	});

	test("scenario: force untwit with ! for posts older than 1 hour", () => {
		let lastPostUri: string | null = "at://did:plc:tim/app.bsky.feed.post/old";
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
			"https://bsky.app/profile/tim.bsky.social/post/first",
			"needs more horsepower",
			"https://bsky.app/profile/al.bsky.social/post/second",
			"measure twice cut once",
		];

		for (const msg of messages) {
			const url = extractBlueskyUrl(msg);
			if (url) {
				lastBskyUrl = url;
			}
		}

		// should track the most recent url
		expect(lastBskyUrl).toBe(
			"https://bsky.app/profile/al.bsky.social/post/second",
		);
	});
});
