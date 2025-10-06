// irc-to-bluesky bot that posts from irc commands to a bluesky account
import { BskyAgent, RichText } from "@atproto/api";
import dotenv from "dotenv";
import * as irc from "irc-framework";

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
	service: "https://bsky.social",
});

// store recent messages per user for quote functionality
const messageHistory = new Map<string, string>();

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

// type for bluesky post data
interface PostData {
	text: string;
	facets?: unknown[];
	embed?: {
		$type: string;
		images: Array<{
			alt: string;
			image: unknown;
		}>;
	};
}

async function postToBluesky(
	text: string,
	imageUrl?: string,
): Promise<boolean> {
	try {
		const rt = new RichText({ text });
		await rt.detectFacets(agent);

		const postData: PostData = {
			text: rt.text,
			facets: rt.facets,
		};

		// handle image embedding if url provided
		if (imageUrl) {
			try {
				// fetch the image
				const response = await fetch(imageUrl);
				const imageBuffer = await response.arrayBuffer();

				// upload to bluesky
				const uploadResponse = await agent.uploadBlob(
					new Uint8Array(imageBuffer),
					{
						encoding: response.headers.get("content-type") || "image/jpeg",
					},
				);

				postData.embed = {
					$type: "app.bsky.embed.images",
					images: [
						{
							alt: "",
							image: uploadResponse.data.blob,
						},
					],
				};
			} catch (err) {
				console.error("Failed to embed image:", err);
				return false;
			}
		}

		const response = await agent.post(postData);
		const postUrl = `https://bsky.app/profile/${agent.session?.handle}/post/${response.uri.split("/").pop()}`;
		console.log("Posted to Bluesky:", postUrl);
		return true;
	} catch (err) {
		console.error("Failed to post to Bluesky:", err);
		return false;
	}
}

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

		// handle "twit" command
		const twitMatch = message.match(/^twit\s+(.+?)(?:\s+<(.+)>)?$/i);
		if (twitMatch) {
			const [, text, imageUrl] = twitMatch;
			// store the text being posted (not the command) in history
			messageHistory.set(nick.toLowerCase(), text.trim());
			const success = await postToBluesky(text.trim(), imageUrl?.trim());
			client.say(target, success ? "ok" : "no");
			return;
		}

		// handle "quote" command - only if the nick exists in history
		const quoteMatch = message.match(/^quote\s+(\S+)(?:\s+(.+))?$/i);
		if (quoteMatch) {
			const [, targetNick, additionalText] = quoteMatch;
			const quotedMessage = messageHistory.get(targetNick.toLowerCase());

			if (quotedMessage) {
				let postText = quotedMessage;
				if (additionalText) {
					postText += ` ${additionalText.trim()}`;
				}

				const success = await postToBluesky(postText);
				client.say(target, success ? "ok" : "no");
				return;
			}
			// if nick not found, fall through to store as regular message
		}

		// store non-command messages in history
		messageHistory.set(nick.toLowerCase(), message);
	});

	client.on("error", (err) => {
		console.error("IRC error:", err);
	});

	client.on("close", () => {
		console.log("Disconnected from IRC");
	});
}

main();
