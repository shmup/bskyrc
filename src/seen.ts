// database and logic for tracking when users were last seen on irc

import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";

let db: Database | null = null;

/**
 * get or initialize the database
 */
function getDb(): Database {
	if (!db || !db.filename) {
		const dbPath =
			process.env.SEEN_DB_PATH || path.join(process.cwd(), "data", "seen.db");

		// ensure data directory exists
		const dir = path.dirname(dbPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		db = new Database(dbPath);

		// create table if it doesn't exist
		db.run(`
      CREATE TABLE IF NOT EXISTS seen (
        who TEXT PRIMARY KEY,
        what TEXT NOT NULL,
        where_channel TEXT NOT NULL,
        when_timestamp INTEGER NOT NULL
      )
    `);
	}
	return db;
}

export interface SeenRecord {
	who: string;
	what: string;
	where: string;
	when: number;
}

/**
 * update the seen database with a user's message
 */
export function updateSeen(
	nick: string,
	message: string,
	channel: string,
): void {
	const normalizedNick = nick.toLowerCase();
	const timestamp = Math.floor(Date.now() / 1000);

	// upsert - insert or update if exists
	getDb().run(
		`
    INSERT INTO seen (who, what, where_channel, when_timestamp)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(who) DO UPDATE SET
      what = excluded.what,
      where_channel = excluded.where_channel,
      when_timestamp = excluded.when_timestamp
  `,
		[normalizedNick, message, channel, timestamp],
	);
}

/**
 * get the last seen info for a user
 */
export function getSeen(nick: string): SeenRecord | null {
	const normalizedNick = nick.toLowerCase();

	const result = getDb()
		.query<
			{
				who: string;
				what: string;
				where_channel: string;
				when_timestamp: number;
			},
			[string]
		>(
			`
    SELECT who, what, where_channel, when_timestamp
    FROM seen
    WHERE who = ?
  `,
		)
		.get(normalizedNick);

	if (!result) {
		return null;
	}

	return {
		what: result.what,
		when: result.when_timestamp,
		where: result.where_channel,
		who: result.who,
	};
}

/**
 * format a time duration in human-readable form (matching GIR's style)
 */
function formatDuration(seconds: number): string {
	let remaining = seconds;
	const parts: string[] = [];

	const years = Math.floor(remaining / (365 * 24 * 60 * 60));
	if (years > 0) {
		parts.push(years === 1 ? "1 year" : `${years} years`);
		remaining %= 365 * 24 * 60 * 60;
	}

	const days = Math.floor(remaining / (24 * 60 * 60));
	if (days > 0) {
		parts.push(days === 1 ? "1 day" : `${days} days`);
		remaining %= 24 * 60 * 60;
	}

	const hours = Math.floor(remaining / (60 * 60));
	if (hours > 0) {
		parts.push(hours === 1 ? "1 hour" : `${hours} hours`);
		remaining %= 60 * 60;
	}

	const minutes = Math.floor(remaining / 60);
	if (minutes > 0) {
		parts.push(minutes === 1 ? "1 minute" : `${minutes} minutes`);
		remaining %= 60;
	}

	// always include seconds
	const secs = Math.floor(remaining);
	parts.push(secs === 1 ? "1 second" : `${secs} seconds`);

	// join with commas and "and" before the last part
	if (parts.length === 1) {
		return parts[0];
	}

	const last = parts.pop();
	return `${parts.join(", ")} and ${last}`;
}

/**
 * format a seen record for display (matching GIR's output format)
 */
export function formatSeenMessage(
	record: SeenRecord,
	_requestingNick?: string,
): string {
	const now = Math.floor(Date.now() / 1000);
	const elapsed = now - record.when;
	const duration = formatDuration(elapsed);
	const timestamp = new Date(record.when * 1000).toLocaleString("en-US", {
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		month: "short",
		second: "2-digit",
		timeZone: "America/New_York",
		weekday: "short",
		year: "numeric",
	});

	return `${record.who} was last seen on ${record.where} ${duration} ago, saying: ${record.what} [${timestamp}]`;
}

/**
 * format a "haven't seen" message
 */
export function formatNotSeenMessage(
	nick: string,
	requestingNick?: string,
): string {
	if (requestingNick) {
		return `I haven't seen '${nick}', ${requestingNick}`;
	}
	return `I haven't seen '${nick}'`;
}

/**
 * close the database connection (for cleanup)
 */
export function closeDb(): void {
	if (db) {
		db.close();
		db = null;
	}
}
