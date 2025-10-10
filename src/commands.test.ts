// unit tests for command parsing logic
import { describe, expect, mock, test } from "bun:test";
import {
	extractBlueskyUrl,
	parseCommand,
	parseQuoteCommand,
	parseReplyCommand,
	parseSeenCommand,
	parseSupCommand,
	parseTwitCommand,
	parseUntwitCommand,
} from "./commands.js";

describe("parseTwitCommand", () => {
	test("parses simple twit command", async () => {
		const result = await parseTwitCommand("twit hello world");
		expect(result).toEqual({
			imageUrls: undefined,
			text: "hello world",
			type: "twit",
		});
	});

	test("parses twit command with image url", async () => {
		const result = await parseTwitCommand(
			"twit check this out https://example.com/image.jpg",
		);
		expect(result).toEqual({
			imageUrls: ["https://example.com/image.jpg"],
			text: "check this out",
			type: "twit",
		});
	});

	test("parses twit command with multiple image urls", async () => {
		const result = await parseTwitCommand(
			"twit check these https://example.com/a.jpg https://example.com/b.png",
		);
		expect(result).toEqual({
			imageUrls: ["https://example.com/a.jpg", "https://example.com/b.png"],
			text: "check these",
			type: "twit",
		});
	});

	test("supports query strings in image urls", async () => {
		const result = await parseTwitCommand(
			"twit photo https://example.com/img.jpg?size=large",
		);
		expect(result).toEqual({
			imageUrls: ["https://example.com/img.jpg?size=large"],
			text: "photo",
			type: "twit",
		});
	});

	test("is case insensitive", async () => {
		const result = await parseTwitCommand("TWIT hello");
		expect(result).toEqual({
			imageUrls: undefined,
			text: "hello",
			type: "twit",
		});
	});

	test("returns null for non-twit messages", async () => {
		expect(await parseTwitCommand("hello world")).toBeNull();
		expect(await parseTwitCommand("quote al")).toBeNull();
		expect(await parseTwitCommand("twit")).toBeNull(); // no text
	});

	test("detects images by MIME type for URLs without file extensions", async () => {
		// mock fetch to return image content-type for cdn urls
		const originalFetch = globalThis.fetch;
		globalThis.fetch = mock((url: string, options?: RequestInit) => {
			if (
				url === "https://cdn.bsky.app/img/feed_fullsize/plain/example" &&
				options?.method === "HEAD"
			) {
				return Promise.resolve({
					headers: new Headers({ "content-type": "image/jpeg" }),
				} as Response);
			}
			return originalFetch(url, options);
		});

		try {
			const result = await parseTwitCommand(
				"twit check this https://cdn.bsky.app/img/feed_fullsize/plain/example",
			);
			expect(result).toEqual({
				imageUrls: ["https://cdn.bsky.app/img/feed_fullsize/plain/example"],
				text: "check this",
				type: "twit",
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("ignores non-image URLs without file extensions", async () => {
		// mock fetch to return non-image content-type
		const originalFetch = globalThis.fetch;
		globalThis.fetch = mock((url: string, options?: RequestInit) => {
			if (url === "https://example.com/page" && options?.method === "HEAD") {
				return Promise.resolve({
					headers: new Headers({ "content-type": "text/html" }),
				} as Response);
			}
			return originalFetch(url, options);
		});

		try {
			const result = await parseTwitCommand(
				"twit check this https://example.com/page",
			);
			expect(result).toEqual({
				imageUrls: undefined,
				text: "check this https://example.com/page",
				type: "twit",
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

describe("parseQuoteCommand", () => {
	test("parses simple quote command", async () => {
		const result = await parseQuoteCommand("quote al");
		expect(result).toEqual({
			additionalText: undefined,
			imageUrls: undefined,
			targetNick: "al",
			type: "quote",
		});
	});

	test("parses quote command with additional text", async () => {
		const result = await parseQuoteCommand("quote tim aargh aargh");
		expect(result).toEqual({
			additionalText: "aargh aargh",
			imageUrls: undefined,
			targetNick: "tim",
			type: "quote",
		});
	});

	test("parses quote command with image url", async () => {
		const result = await parseQuoteCommand(
			"quote al https://example.com/image.jpg",
		);
		expect(result).toEqual({
			additionalText: undefined,
			imageUrls: ["https://example.com/image.jpg"],
			targetNick: "al",
			type: "quote",
		});
	});

	test("parses quote command with text and image url", async () => {
		const result = await parseQuoteCommand(
			"quote tim yep https://example.com/a.png",
		);
		expect(result).toEqual({
			additionalText: "yep",
			imageUrls: ["https://example.com/a.png"],
			targetNick: "tim",
			type: "quote",
		});
	});

	test("trims additional text", async () => {
		const result = await parseQuoteCommand("quote al   extra text  ");
		expect(result).toEqual({
			additionalText: "extra text",
			imageUrls: undefined,
			targetNick: "al",
			type: "quote",
		});
	});

	test("is case insensitive", async () => {
		const result = await parseQuoteCommand("QUOTE al");
		expect(result).toEqual({
			additionalText: undefined,
			imageUrls: undefined,
			targetNick: "al",
			type: "quote",
		});
	});

	test("returns null for non-quote messages", async () => {
		expect(await parseQuoteCommand("hello world")).toBeNull();
		expect(await parseQuoteCommand("twit hello")).toBeNull();
		expect(await parseQuoteCommand("quote")).toBeNull(); // no nick
	});
});

describe("parseReplyCommand", () => {
	test("parses reply command", async () => {
		const result = await parseReplyCommand("reply this is a reply");
		expect(result).toEqual({
			imageUrls: undefined,
			text: "this is a reply",
			type: "reply",
		});
	});

	test("parses reply command with image url", async () => {
		const result = await parseReplyCommand(
			"reply check this https://example.com/pic.jpeg",
		);
		expect(result).toEqual({
			imageUrls: ["https://example.com/pic.jpeg"],
			text: "check this",
			type: "reply",
		});
	});

	test("trims text", async () => {
		const result = await parseReplyCommand("reply   some text  ");
		expect(result).toEqual({
			imageUrls: undefined,
			text: "some text",
			type: "reply",
		});
	});

	test("is case insensitive", async () => {
		const result = await parseReplyCommand("REPLY hello");
		expect(result).toEqual({
			imageUrls: undefined,
			text: "hello",
			type: "reply",
		});
	});

	test("returns null for non-reply messages", async () => {
		expect(await parseReplyCommand("hello world")).toBeNull();
		expect(await parseReplyCommand("reply")).toBeNull(); // no text
	});
});

describe("parseUntwitCommand", () => {
	test("parses untwit command (non-force)", async () => {
		const result = parseUntwitCommand("untwit");
		expect(result).toEqual({
			force: false,
			type: "untwit",
		});
	});

	test("parses untwit! command (force)", async () => {
		const result = parseUntwitCommand("untwit!");
		expect(result).toEqual({
			force: true,
			type: "untwit",
		});
	});

	test("is case insensitive", async () => {
		expect(parseUntwitCommand("UNTWIT")).toEqual({
			force: false,
			type: "untwit",
		});
		expect(parseUntwitCommand("UNTWIT!")).toEqual({
			force: true,
			type: "untwit",
		});
	});

	test("returns null for non-untwit messages", async () => {
		expect(parseUntwitCommand("hello world")).toBeNull();
		expect(parseUntwitCommand("untwit something")).toBeNull(); // has extra text
	});
});

describe("parseSupCommand", () => {
	test("parses sup command with simple handle", async () => {
		const result = parseSupCommand("sup dril");
		expect(result).toEqual({
			handle: "dril",
			type: "sup",
		});
	});

	test("parses sup command with dotted handle", async () => {
		const result = parseSupCommand("sup smell.flowers");
		expect(result).toEqual({
			handle: "smell.flowers",
			type: "sup",
		});
	});

	test("parses sup command with full bsky.social handle", async () => {
		const result = parseSupCommand("sup dril.bsky.social");
		expect(result).toEqual({
			handle: "dril.bsky.social",
			type: "sup",
		});
	});

	test("is case insensitive", async () => {
		const result = parseSupCommand("SUP dril");
		expect(result).toEqual({
			handle: "dril",
			type: "sup",
		});
	});

	test("returns null for non-sup messages", async () => {
		expect(parseSupCommand("hello world")).toBeNull();
		expect(parseSupCommand("twit hello")).toBeNull();
	});

	test("returns null for sup without handle", async () => {
		expect(parseSupCommand("sup")).toBeNull();
	});
});

describe("parseSeenCommand", () => {
	test("parses basic seen command", () => {
		const result = parseSeenCommand("seen testuser");
		expect(result).toEqual({
			targetNick: "testuser",
			type: "seen",
		});
	});

	test("parses seen command with uppercase", () => {
		const result = parseSeenCommand("SEEN TestUser");
		expect(result).toEqual({
			targetNick: "TestUser",
			type: "seen",
		});
	});

	test("parses seen command with mixed case", () => {
		const result = parseSeenCommand("SeEn CamelCase");
		expect(result).toEqual({
			targetNick: "CamelCase",
			type: "seen",
		});
	});

	test("handles nick with special characters", () => {
		const result = parseSeenCommand("seen user[away]");
		expect(result).toEqual({
			targetNick: "user[away]",
			type: "seen",
		});
	});

	test("handles underscores and dashes in nick", () => {
		const result = parseSeenCommand("seen test_user-123");
		expect(result).toEqual({
			targetNick: "test_user-123",
			type: "seen",
		});
	});

	test("returns null for seen without target", () => {
		expect(parseSeenCommand("seen")).toBeNull();
	});

	test("returns null for seen with only spaces", () => {
		expect(parseSeenCommand("seen  ")).toBeNull();
	});

	test("returns null for non-seen command", () => {
		expect(parseSeenCommand("twit hello")).toBeNull();
	});

	test("returns null for seen with extra words", () => {
		expect(parseSeenCommand("seen user extra words")).toBeNull();
	});
});

describe("extractBlueskyUrl", () => {
	test("extracts bluesky url from message", async () => {
		const url = "https://bsky.app/profile/tim.bsky.social/post/3kowrg5ylci2r";
		const result = extractBlueskyUrl(`check this out ${url}`);
		expect(result).toBe(url);
	});

	test("extracts http url (not just https)", async () => {
		const url = "http://bsky.app/profile/tim.bsky.social/post/3kowrg5ylci2r";
		const result = extractBlueskyUrl(`check this out ${url}`);
		expect(result).toBe(url);
	});

	test("returns null when no bluesky url present", async () => {
		expect(extractBlueskyUrl("hello world")).toBeNull();
		expect(extractBlueskyUrl("https://example.com")).toBeNull();
	});

	test("extracts url from middle of message", async () => {
		const message = `before https://bsky.app/profile/al.bsky.social/post/abc123 after`;
		const result = extractBlueskyUrl(message);
		expect(result).toBe("https://bsky.app/profile/al.bsky.social/post/abc123");
	});

	test("extracts url with parentheses in message", async () => {
		const message =
			"(non derogatory) https://bsky.app/profile/mrpussy.xyz/post/3m2n7pwku7k2s";
		const result = extractBlueskyUrl(message);
		expect(result).toBe(
			"https://bsky.app/profile/mrpussy.xyz/post/3m2n7pwku7k2s",
		);
	});

	test("extracts url with text before and after", async () => {
		const message =
			"testing embeddd urls https://bsky.app/profile/npr.org/post/3m2ompy2gvs22 in my post";
		const result = extractBlueskyUrl(message);
		expect(result).toBe("https://bsky.app/profile/npr.org/post/3m2ompy2gvs22");
	});
});

describe("parseCommand", () => {
	test("returns twit command when message is twit", async () => {
		const result = await parseCommand("twit hello");
		expect(result?.type).toBe("twit");
	});

	test("returns quote command when message is quote", async () => {
		const result = await parseCommand("quote al");
		expect(result?.type).toBe("quote");
	});

	test("returns reply command when message is reply", async () => {
		const result = await parseCommand("reply hello");
		expect(result?.type).toBe("reply");
	});

	test("returns untwit command when message is untwit", async () => {
		const result = await parseCommand("untwit");
		expect(result?.type).toBe("untwit");
	});

	test("returns sup command when message is sup", async () => {
		const result = await parseCommand("sup dril");
		expect(result?.type).toBe("sup");
	});

	test("returns seen command when message is seen", async () => {
		const result = await parseCommand("seen testuser");
		expect(result?.type).toBe("seen");
	});

	test("returns null when message is not a command", async () => {
		const result = await parseCommand("just a regular message");
		expect(result).toBeNull();
	});

	test("prioritizes commands in order: twit, quote, reply, untwit, sup, seen", async () => {
		// if a message could match multiple (unlikely but possible), it should return the first match
		expect((await parseCommand("twit hello"))?.type).toBe("twit");
		expect((await parseCommand("quote al"))?.type).toBe("quote");
		expect((await parseCommand("reply hello"))?.type).toBe("reply");
		expect((await parseCommand("untwit"))?.type).toBe("untwit");
		expect((await parseCommand("sup dril"))?.type).toBe("sup");
		expect((await parseCommand("seen testuser"))?.type).toBe("seen");
	});
});
