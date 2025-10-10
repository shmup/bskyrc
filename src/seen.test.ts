// tests for seen tracking and formatting

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import {
	closeDb,
	formatNotSeenMessage,
	formatSeenMessage,
	getSeen,
	type SeenRecord,
	updateSeen,
} from "./seen.js";

// use a test-specific database
const TEST_DB_PATH = "./seen-test.db";
process.env.SEEN_DB_PATH = TEST_DB_PATH;

describe("seen command", () => {
	beforeEach(() => {
		// clean up any existing test database
		if (fs.existsSync(TEST_DB_PATH)) {
			fs.unlinkSync(TEST_DB_PATH);
		}
	});

	afterEach(() => {
		// clean up test database
		closeDb();
		if (fs.existsSync(TEST_DB_PATH)) {
			fs.unlinkSync(TEST_DB_PATH);
		}
	});

	test("updateSeen should store a new user", () => {
		updateSeen("TestUser", "hello world", "#testchannel");

		const result = getSeen("testuser");
		expect(result).not.toBeNull();
		expect(result?.who).toBe("testuser");
		expect(result?.what).toBe("hello world");
		expect(result?.where).toBe("#testchannel");
		expect(result?.when).toBeGreaterThan(0);
	});

	test("updateSeen should normalize nicks to lowercase", () => {
		updateSeen("CamelCase", "test message", "#testchannel");

		const result1 = getSeen("camelcase");
		const result2 = getSeen("CAMELCASE");
		const result3 = getSeen("CamelCase");

		expect(result1).not.toBeNull();
		expect(result2).not.toBeNull();
		expect(result3).not.toBeNull();
		expect(result1?.who).toBe("camelcase");
		expect(result2?.who).toBe("camelcase");
		expect(result3?.who).toBe("camelcase");
	});

	test("getSeen should return null for unknown user", () => {
		const result = getSeen("unknownuser");
		expect(result).toBeNull();
	});

	test("formatSeenMessage should format correctly", () => {
		const record: SeenRecord = {
			what: "hello world",
			when: Math.floor(Date.now() / 1000) - 3665, // 1 hour, 1 minute, 5 seconds ago
			where: "#testchannel",
			who: "testuser",
		};

		const message = formatSeenMessage(record);

		expect(message).toContain("testuser");
		expect(message).toContain("#testchannel");
		expect(message).toContain("hello world");
		expect(message).toContain("1 hour");
		expect(message).toContain("1 minute");
		expect(message).toContain("5 seconds");
		expect(message).toContain("ago");
	});

	test("formatSeenMessage should handle seconds only", () => {
		const record: SeenRecord = {
			what: "hello",
			when: Math.floor(Date.now() / 1000) - 42,
			where: "#test",
			who: "testuser",
		};

		const message = formatSeenMessage(record);

		expect(message).toContain("42 seconds ago");
		expect(message).not.toContain("minute");
		expect(message).not.toContain("hour");
	});

	test("formatSeenMessage should handle 1 second correctly", () => {
		const record: SeenRecord = {
			what: "hello",
			when: Math.floor(Date.now() / 1000) - 1,
			where: "#test",
			who: "testuser",
		};

		const message = formatSeenMessage(record);

		expect(message).toContain("1 second ago");
		expect(message).not.toContain("seconds");
	});

	test("formatSeenMessage should handle complex durations", () => {
		const record: SeenRecord = {
			what: "hello",
			// 2 days, 3 hours, 15 minutes, 30 seconds ago
			when:
				Math.floor(Date.now() / 1000) - (2 * 86400 + 3 * 3600 + 15 * 60 + 30),
			where: "#test",
			who: "testuser",
		};

		const message = formatSeenMessage(record);

		expect(message).toContain("2 days");
		expect(message).toContain("3 hours");
		expect(message).toContain("15 minutes");
		expect(message).toContain("30 seconds");
	});

	test("formatNotSeenMessage should format correctly without requesting nick", () => {
		const message = formatNotSeenMessage("unknownuser");

		expect(message).toBe("I haven't seen 'unknownuser'");
	});

	test("formatNotSeenMessage should format correctly with requesting nick", () => {
		const message = formatNotSeenMessage("unknownuser", "asker");

		expect(message).toBe("I haven't seen 'unknownuser', asker");
	});
});
