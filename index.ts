// irc-to-bluesky bot that posts from irc commands to a bluesky account

import { watch } from "node:fs";
import { AtpAgent } from "@atproto/api";
import dotenv from "dotenv";
import * as irc from "irc-framework";
import type { Command } from "./src/commands.js";
import { BLUESKY_APP_URL, BLUESKY_SERVICE_URL } from "./src/constants.js";

// force local .env to override global environment variables
// supports custom env file via ENV_FILE environment variable
const envFile = process.env.ENV_FILE || ".env";
dotenv.config({ override: true, path: envFile });

// validate required environment variables
const requiredEnvVars = [
	"IRC_SERVER",
	"IRC_NICKNAME",
	"IRC_CHANNEL",
	"BLUESKY_USERNAME",
	"BLUESKY_PASSWORD",
];
for (const varName of requiredEnvVars) {
	if (!process.env[varName]) {
		console.error(`Missing required environment variable: ${varName}`);
		process.exit(1);
	}
}

// extract validated environment variables as constants
const IRC_SERVER = process.env.IRC_SERVER as string;
const IRC_NICKNAME = process.env.IRC_NICKNAME as string;
const IRC_CHANNEL = process.env.IRC_CHANNEL as string;
const BLUESKY_USERNAME = process.env.BLUESKY_USERNAME as string;
const BLUESKY_PASSWORD = process.env.BLUESKY_PASSWORD as string;

// create bluesky agent
const agent = new AtpAgent({
	service: BLUESKY_SERVICE_URL,
});

// hot-reloadable command handlers
let commandHandlers: {
	parseCommand: (message: string) => Promise<Command>;
	extractBlueskyUrl: (message: string) => string | null;
} = await import("./src/commands.js");

// hot-reloadable bluesky handlers
let blueskyHandlers: typeof import("./src/bluesky.js") = await import(
	"./src/bluesky.js"
);

// watch commands.ts for changes and reload
watch("./src/commands.ts", async (event) => {
	if (event === "change") {
		console.log("Commands module changed, reloading...");
		try {
			// dynamic import with cache busting
			commandHandlers = await import(`./src/commands.js?t=${Date.now()}`);
			console.log("Commands module reloaded successfully");
		} catch (err) {
			console.error("Failed to reload commands module:", err);
		}
	}
});

// watch bluesky.ts for changes and reload
watch("./src/bluesky.ts", async (event) => {
	if (event === "change") {
		console.log("Bluesky module changed, reloading...");
		try {
			// dynamic import with cache busting
			blueskyHandlers = await import(`./src/bluesky.js?t=${Date.now()}`);
			console.log("Bluesky module reloaded successfully");
		} catch (err) {
			console.error("Failed to reload bluesky module:", err);
		}
	}
});

// store recent messages per user for quote functionality
const messageHistory = new Map<string, string>();

// track last post made by bot for untwit functionality
let lastPostUri: string | null = null;
let lastPostTimestamp: number | null = null;

// track last bluesky url linked in channel for reply functionality
let lastBskyUrl: string | null = null;

// initialize irc client
const client = new irc.Client();
client.connect({
	gecos: process.env.IRC_REALNAME || IRC_NICKNAME,
	host: IRC_SERVER,
	nick: IRC_NICKNAME,
	port: parseInt(process.env.IRC_PORT || "6667", 10),
	tls: process.env.IRC_USE_TLS === "true",
	username: process.env.IRC_USERNAME || IRC_NICKNAME,
});

// track last seen notification timestamp for polling
let lastSeenNotificationTime: string | undefined;

// poll for new notifications and post to irc channel
async function pollNotifications(
	agent: AtpAgent,
	ircClient: irc.Client,
	channel: string,
) {
	try {
		const result = await agent.listNotifications({ limit: 50 });

		// on first poll, just set the timestamp and don't post anything
		if (!lastSeenNotificationTime) {
			const mentionsAndReplies = result.data.notifications.filter(
				(n) => n.reason === "mention" || n.reason === "reply",
			);
			if (mentionsAndReplies.length > 0) {
				lastSeenNotificationTime = mentionsAndReplies[0].indexedAt;
			}
			return;
		}

		// process notifications in reverse order (oldest first)
		const notifications = [...result.data.notifications].reverse();

		for (const notif of notifications) {
			// only show mentions and replies
			if (notif.reason !== "mention" && notif.reason !== "reply") {
				continue;
			}

			// skip if we've already seen this notification
			if (notif.indexedAt <= lastSeenNotificationTime) {
				continue;
			}

			const post = notif.record as { text?: string };
			const postText = post.text || "";
			const authorHandle = notif.author.handle;
			const postUrl = `${BLUESKY_APP_URL}/profile/${authorHandle}/post/${notif.uri.split("/").pop()}`;

			// format message for irc
			const message =
				notif.reason === "mention"
					? `bsky/@${authorHandle}: ${postText} ${postUrl}`
					: `bsky/@${authorHandle} replies: ${postText} ${postUrl}`;

			ircClient.say(channel, message);

			// update lastBskyUrl so reply command will work
			lastBskyUrl = postUrl;

			// update last seen time
			lastSeenNotificationTime = notif.indexedAt;
		}

		// mark notifications as seen
		if (notifications.length > 0) {
			await agent.updateSeenNotifications();
		}
	} catch (err) {
		console.error("Failed to poll notifications:", err);
	}
}

async function main() {
	// login to bluesky
	console.log(`Attempting login with username: ${BLUESKY_USERNAME}`);
	const session = await agent.login({
		identifier: BLUESKY_USERNAME,
		password: BLUESKY_PASSWORD,
	});

	console.log(`Logged in to Bluesky as ${session.data.handle}`);

	client.on("registered", () => {
		console.log("Connected to IRC");

		// authenticate with nickserv if password is provided
		if (process.env.IRC_PASSWORD) {
			client.say("NickServ", `IDENTIFY ${process.env.IRC_PASSWORD}`);
			console.log("Sent NickServ identification");
		}

		console.log(`Attempting to join ${IRC_CHANNEL}`);
		client.join(IRC_CHANNEL);
	});

	client.on("join", (event: irc.JoinEvent) => {
		if (event.nick === client.user.nick) {
			console.log(`Joined ${event.channel}`);

			// start polling for notifications every 10 seconds
			setInterval(() => {
				pollNotifications(agent, client, IRC_CHANNEL);
			}, 10000);

			// do an initial poll immediately
			pollNotifications(agent, client, IRC_CHANNEL);
		}
	});

	client.on("message", async (event: irc.MessageEvent) => {
		const { nick, message, target } = event;

		// ignore our own messages
		if (nick === client.user.nick) return;

		// only respond to messages in our channel
		if (target !== IRC_CHANNEL) return;

		// try to parse as a command
		const command = await commandHandlers.parseCommand(message);

		if (command?.type === "twit") {
			// store the text being posted (not the command) in history
			messageHistory.set(nick.toLowerCase(), command.text);
			const result = await blueskyHandlers.postToBluesky(
				agent,
				command.text,
				command.imageUrls,
			);
			if (result.success && result.uri) {
				lastPostUri = result.uri;
				lastPostTimestamp = Date.now();
			}
			client.say(target, result.success ? "ok" : "no");
			return;
		}

		if (command?.type === "quote") {
			const quotedMessage = messageHistory.get(
				command.targetNick.toLowerCase(),
			);

			if (quotedMessage) {
				let postText = quotedMessage;
				if (command.additionalText) {
					postText += ` ${command.additionalText}`;
				}

				const result = await blueskyHandlers.postToBluesky(
					agent,
					postText,
					command.imageUrls,
				);
				client.say(target, result.success ? "ok" : "no");
				return;
			}
			// if nick not found, fall through to store as regular message
		}

		if (command?.type === "reply") {
			if (lastBskyUrl) {
				const replyData = await blueskyHandlers.parseBlueskyUrl(
					agent,
					lastBskyUrl,
				);
				if (replyData) {
					const result = await blueskyHandlers.postToBluesky(
						agent,
						command.text,
						command.imageUrls,
						replyData,
					);
					client.say(target, result.success ? "ok" : "no");
				} else {
					client.say(target, "no");
				}
			} else {
				client.say(target, "no");
			}
			return;
		}

		if (command?.type === "untwit") {
			const result = await blueskyHandlers.deletePost(
				agent,
				lastPostUri,
				lastPostTimestamp,
				command.force,
			);
			if (result.success) {
				lastPostUri = null;
				lastPostTimestamp = null;
				const preview = result.text
					? `deleted ${result.text.slice(0, 20)}...`
					: "deleted";
				client.say(target, preview);
			} else {
				client.say(target, "no");
			}
			return;
		}

		if (command?.type === "sup") {
			const result = await blueskyHandlers.getLastPost(agent, command.handle);
			if (result.success && result.message) {
				const message = result.url
					? `${result.message} ${result.url}`
					: result.message;
				client.say(target, message);
				// track the url for reply functionality
				if (result.url) {
					lastBskyUrl = result.url;
				}
			} else {
				client.say(target, "no");
			}
			return;
		}

		// track bluesky urls in messages and auto-display post content
		const bskyUrl = commandHandlers.extractBlueskyUrl(message);
		if (bskyUrl) {
			lastBskyUrl = bskyUrl;
			// fetch and display the post content
			const result = await blueskyHandlers.getPostFromUrl(agent, bskyUrl);
			if (result.success && result.message) {
				client.say(target, result.message);
			}
		}

		// store non-command messages in history
		messageHistory.set(nick.toLowerCase(), message);
	});

	client.on("socket close", () => {
		console.log("IRC socket closed - disconnected from server");
	});

	client.on("reconnecting", () => {
		console.log("IRC attempting to reconnect...");
	});

	client.on("error", (err: Error) => {
		console.error("IRC error:", err);
	});

	client.on("close", (event: unknown) => {
		console.log(
			"Disconnected from IRC",
			event ? `- Reason: ${JSON.stringify(event)}` : "",
		);
	});
}

main();
