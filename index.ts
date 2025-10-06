// irc-to-bluesky bot that posts from irc commands to a bluesky account
import { BskyAgent } from "@atproto/api";
import dotenv from "dotenv";
import * as irc from "irc-framework";
import { deletePost, parseBlueskyUrl, postToBluesky } from "./src/bluesky.js";
import { extractBlueskyUrl, parseCommand } from "./src/commands.js";
import { BLUESKY_SERVICE_URL } from "./src/constants.js";

// force local .env to override global environment variables
dotenv.config({ override: true });

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

// create bluesky agent
const agent = new BskyAgent({
	service: BLUESKY_SERVICE_URL,
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
	host: process.env.IRC_SERVER,
	port: parseInt(process.env.IRC_PORT || "6667", 10),
	nick: process.env.IRC_NICKNAME,
	username: process.env.IRC_USERNAME || process.env.IRC_NICKNAME,
	gecos: process.env.IRC_REALNAME || process.env.IRC_NICKNAME,
	tls: process.env.IRC_USE_TLS === "true",
});

async function main() {
	// login to bluesky
	console.log(
		`Attempting login with username: ${process.env.BLUESKY_USERNAME}`,
	);
	await agent.login({
		identifier: process.env.BLUESKY_USERNAME,
		password: process.env.BLUESKY_PASSWORD,
	});

	console.log(`Logged in to Bluesky as ${agent.session?.handle}`);

	client.on("registered", () => {
		console.log("Connected to IRC");

		// authenticate with nickserv if password is provided
		if (process.env.IRC_PASSWORD) {
			client.say("NickServ", `IDENTIFY ${process.env.IRC_PASSWORD}`);
			console.log("Sent NickServ identification");
		}

		console.log(`Attempting to join ${process.env.IRC_CHANNEL}`);
		client.join(process.env.IRC_CHANNEL);
	});

	client.on("join", (event) => {
		if (event.nick === client.user.nick) {
			console.log(`Joined ${event.channel}`);
		}
	});

	client.on("message", async (event) => {
		const { nick, message, target } = event;

		// ignore our own messages
		if (nick === client.user.nick) return;

		// only respond to messages in our channel
		if (target !== process.env.IRC_CHANNEL) return;

		// try to parse as a command
		const command = parseCommand(message);

		if (command?.type === "twit") {
			// store the text being posted (not the command) in history
			messageHistory.set(nick.toLowerCase(), command.text);
			const result = await postToBluesky(agent, command.text, command.imageUrl);
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

				const result = await postToBluesky(agent, postText);
				client.say(target, result.success ? "ok" : "no");
				return;
			}
			// if nick not found, fall through to store as regular message
		}

		if (command?.type === "reply") {
			if (lastBskyUrl) {
				const replyData = await parseBlueskyUrl(agent, lastBskyUrl);
				if (replyData) {
					const result = await postToBluesky(
						agent,
						command.text,
						undefined,
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
			const success = await deletePost(
				agent,
				lastPostUri,
				lastPostTimestamp,
				command.force,
			);
			if (success) {
				lastPostUri = null;
				lastPostTimestamp = null;
			}
			client.say(target, success ? "ok" : "no");
			return;
		}

		// track bluesky urls in messages
		const bskyUrl = extractBlueskyUrl(message);
		if (bskyUrl) {
			lastBskyUrl = bskyUrl;
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

	client.on("error", (err) => {
		console.error("IRC error:", err);
	});

	client.on("close", (event) => {
		console.log(
			"Disconnected from IRC",
			event ? `- Reason: ${JSON.stringify(event)}` : "",
		);
	});
}

main();
