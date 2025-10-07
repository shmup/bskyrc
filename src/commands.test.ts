// unit tests for command parsing logic
import { describe, expect, test } from "bun:test";
import {
	extractBlueskyUrl,
	parseCommand,
	parseQuoteCommand,
	parseReplyCommand,
	parseTwitCommand,
	parseUntwitCommand,
} from "./commands.js";

describe("parseTwitCommand", () => {
	test("parses simple twit command", () => {
		const result = parseTwitCommand("twit hello world");
		expect(result).toEqual({
			imageUrls: undefined,
			text: "hello world",
			type: "twit",
		});
	});

	test("parses twit command with image url", () => {
		const result = parseTwitCommand(
			"twit check this out https://example.com/image.jpg",
		);
		expect(result).toEqual({
			imageUrls: ["https://example.com/image.jpg"],
			text: "check this out",
			type: "twit",
		});
	});

	test("parses twit command with multiple image urls", () => {
		const result = parseTwitCommand(
			"twit check these https://example.com/a.jpg https://example.com/b.png",
		);
		expect(result).toEqual({
			imageUrls: ["https://example.com/a.jpg", "https://example.com/b.png"],
			text: "check these",
			type: "twit",
		});
	});

	test("supports query strings in image urls", () => {
		const result = parseTwitCommand(
			"twit photo https://example.com/img.jpg?size=large",
		);
		expect(result).toEqual({
			imageUrls: ["https://example.com/img.jpg?size=large"],
			text: "photo",
			type: "twit",
		});
	});

	test("is case insensitive", () => {
		const result = parseTwitCommand("TWIT hello");
		expect(result).toEqual({
			imageUrls: undefined,
			text: "hello",
			type: "twit",
		});
	});

	test("returns null for non-twit messages", () => {
		expect(parseTwitCommand("hello world")).toBeNull();
		expect(parseTwitCommand("quote al")).toBeNull();
		expect(parseTwitCommand("twit")).toBeNull(); // no text
	});
});

describe("parseQuoteCommand", () => {
	test("parses simple quote command", () => {
		const result = parseQuoteCommand("quote al");
		expect(result).toEqual({
			additionalText: undefined,
			imageUrls: undefined,
			targetNick: "al",
			type: "quote",
		});
	});

	test("parses quote command with additional text", () => {
		const result = parseQuoteCommand("quote tim aargh aargh");
		expect(result).toEqual({
			additionalText: "aargh aargh",
			imageUrls: undefined,
			targetNick: "tim",
			type: "quote",
		});
	});

	test("parses quote command with image url", () => {
		const result = parseQuoteCommand("quote al https://example.com/image.jpg");
		expect(result).toEqual({
			additionalText: undefined,
			imageUrls: ["https://example.com/image.jpg"],
			targetNick: "al",
			type: "quote",
		});
	});

	test("parses quote command with text and image url", () => {
		const result = parseQuoteCommand("quote tim yep https://example.com/a.png");
		expect(result).toEqual({
			additionalText: "yep",
			imageUrls: ["https://example.com/a.png"],
			targetNick: "tim",
			type: "quote",
		});
	});

	test("trims additional text", () => {
		const result = parseQuoteCommand("quote al   extra text  ");
		expect(result).toEqual({
			additionalText: "extra text",
			imageUrls: undefined,
			targetNick: "al",
			type: "quote",
		});
	});

	test("is case insensitive", () => {
		const result = parseQuoteCommand("QUOTE al");
		expect(result).toEqual({
			additionalText: undefined,
			imageUrls: undefined,
			targetNick: "al",
			type: "quote",
		});
	});

	test("returns null for non-quote messages", () => {
		expect(parseQuoteCommand("hello world")).toBeNull();
		expect(parseQuoteCommand("twit hello")).toBeNull();
		expect(parseQuoteCommand("quote")).toBeNull(); // no nick
	});
});

describe("parseReplyCommand", () => {
	test("parses reply command", () => {
		const result = parseReplyCommand("reply this is a reply");
		expect(result).toEqual({
			imageUrls: undefined,
			text: "this is a reply",
			type: "reply",
		});
	});

	test("parses reply command with image url", () => {
		const result = parseReplyCommand(
			"reply check this https://example.com/pic.jpeg",
		);
		expect(result).toEqual({
			imageUrls: ["https://example.com/pic.jpeg"],
			text: "check this",
			type: "reply",
		});
	});

	test("trims text", () => {
		const result = parseReplyCommand("reply   some text  ");
		expect(result).toEqual({
			imageUrls: undefined,
			text: "some text",
			type: "reply",
		});
	});

	test("is case insensitive", () => {
		const result = parseReplyCommand("REPLY hello");
		expect(result).toEqual({
			imageUrls: undefined,
			text: "hello",
			type: "reply",
		});
	});

	test("returns null for non-reply messages", () => {
		expect(parseReplyCommand("hello world")).toBeNull();
		expect(parseReplyCommand("reply")).toBeNull(); // no text
	});
});

describe("parseUntwitCommand", () => {
	test("parses untwit command (non-force)", () => {
		const result = parseUntwitCommand("untwit");
		expect(result).toEqual({
			force: false,
			type: "untwit",
		});
	});

	test("parses untwit! command (force)", () => {
		const result = parseUntwitCommand("untwit!");
		expect(result).toEqual({
			force: true,
			type: "untwit",
		});
	});

	test("is case insensitive", () => {
		expect(parseUntwitCommand("UNTWIT")).toEqual({
			force: false,
			type: "untwit",
		});
		expect(parseUntwitCommand("UNTWIT!")).toEqual({
			force: true,
			type: "untwit",
		});
	});

	test("returns null for non-untwit messages", () => {
		expect(parseUntwitCommand("hello world")).toBeNull();
		expect(parseUntwitCommand("untwit something")).toBeNull(); // has extra text
	});
});

describe("extractBlueskyUrl", () => {
	test("extracts bluesky url from message", () => {
		const url = "https://bsky.app/profile/tim.bsky.social/post/3kowrg5ylci2r";
		const result = extractBlueskyUrl(`check this out ${url}`);
		expect(result).toBe(url);
	});

	test("extracts http url (not just https)", () => {
		const url = "http://bsky.app/profile/tim.bsky.social/post/3kowrg5ylci2r";
		const result = extractBlueskyUrl(`check this out ${url}`);
		expect(result).toBe(url);
	});

	test("returns null when no bluesky url present", () => {
		expect(extractBlueskyUrl("hello world")).toBeNull();
		expect(extractBlueskyUrl("https://example.com")).toBeNull();
	});

	test("extracts url from middle of message", () => {
		const message = `before https://bsky.app/profile/al.bsky.social/post/abc123 after`;
		const result = extractBlueskyUrl(message);
		expect(result).toBe("https://bsky.app/profile/al.bsky.social/post/abc123");
	});
});

describe("parseCommand", () => {
	test("returns twit command when message is twit", () => {
		const result = parseCommand("twit hello");
		expect(result?.type).toBe("twit");
	});

	test("returns quote command when message is quote", () => {
		const result = parseCommand("quote al");
		expect(result?.type).toBe("quote");
	});

	test("returns reply command when message is reply", () => {
		const result = parseCommand("reply hello");
		expect(result?.type).toBe("reply");
	});

	test("returns untwit command when message is untwit", () => {
		const result = parseCommand("untwit");
		expect(result?.type).toBe("untwit");
	});

	test("returns null when message is not a command", () => {
		const result = parseCommand("just a regular message");
		expect(result).toBeNull();
	});

	test("prioritizes commands in order: twit, quote, reply, untwit", () => {
		// if a message could match multiple (unlikely but possible), it should return the first match
		expect(parseCommand("twit hello")?.type).toBe("twit");
		expect(parseCommand("quote al")?.type).toBe("quote");
		expect(parseCommand("reply hello")?.type).toBe("reply");
		expect(parseCommand("untwit")?.type).toBe("untwit");
	});
});
