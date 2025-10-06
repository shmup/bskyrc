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
	reply?: {
		root: {
			uri: string;
			cid: string;
		};
		parent: {
			uri: string;
			cid: string;
		};
	};
}

async function postToBluesky(
	text: string,
	imageUrl?: string,
	replyTo?: { uri: string; cid: string },
): Promise<boolean> {
	try {
		const rt = new RichText({ text });
		await rt.detectFacets(agent);

		const postData: PostData = {
			text: rt.text,
			facets: rt.facets,
		};

		// add reply data if this is a reply
		if (replyTo) {
			postData.reply = {
				root: replyTo,
				parent: replyTo,
			};
		}

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

		// store post info for untwit functionality
		lastPostUri = response.uri;
		lastPostTimestamp = Date.now();

		return true;
	} catch (err) {
		console.error("Failed to post to Bluesky:", err);
		return false;
	}
}

async function parseBlueskyUrl(
	url: string,
): Promise<{ uri: string; cid: string } | null> {
	try {
		// extract handle and post id from url
		// format: https://bsky.app/profile/{handle}/post/{postId}
		const match = url.match(
			/https?:\/\/bsky\.app\/profile\/([^/]+)\/post\/([^/\s]+)/i,
		);
		if (!match) return null;

		const [, handle, postId] = match;

		// resolve handle to did
		const profile = await agent.getProfile({ actor: handle });
		const did = profile.data.did;

		// construct at-uri
		const uri = `at://${did}/app.bsky.feed.post/${postId}`;

		// fetch the post to get the cid
		const post = await agent.getPost({ repo: did, rkey: postId });
		const cid = post.cid;

		return { uri, cid };
	} catch (err) {
		console.error("Failed to parse Bluesky URL:", err);
		return null;
	}
}

async function deleteLastPost(forceDelete = false): Promise<boolean> {
	try {
		// if we don't have a cached post, fetch the most recent one
		if (!lastPostUri) {
			const feed = await agent.getAuthorFeed({
				actor: agent.session?.did || "",
				limit: 1,
			});

			if (!feed.data.feed.length) {
				return false;
			}

			const post = feed.data.feed[0].post;
			lastPostUri = post.uri;
			// extract timestamp from post indexedAt
			lastPostTimestamp = new Date(post.indexedAt).getTime();
		}

		// check if post is within 1 hour unless force delete
		if (!forceDelete && lastPostTimestamp) {
			const hourInMs = 60 * 60 * 1000;
			if (Date.now() - lastPostTimestamp > hourInMs) {
				return false;
			}
		}

		await agent.deletePost(lastPostUri);
		console.log("Deleted post:", lastPostUri);
		lastPostUri = null;
		lastPostTimestamp = null;
		return true;
	} catch (err) {
		console.error("Failed to delete post:", err);
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

		// handle "reply" command - reply to last url linked in channel
		const replyMatch = message.match(/^reply\s+(.+)$/i);
		if (replyMatch) {
			const [, text] = replyMatch;

			if (lastBskyUrl) {
				const replyData = await parseBlueskyUrl(lastBskyUrl);
				if (replyData) {
					const success = await postToBluesky(
						text.trim(),
						undefined,
						replyData,
					);
					client.say(target, success ? "ok" : "no");
				} else {
					client.say(target, "no");
				}
			} else {
				client.say(target, "no");
			}
			return;
		}

		// handle "untwit!" command - force delete regardless of time
		if (message.match(/^untwit!$/i)) {
			const success = await deleteLastPost(true);
			client.say(target, success ? "ok" : "no");
			return;
		}

		// handle "untwit" command - delete if within 1 hour
		if (message.match(/^untwit$/i)) {
			const success = await deleteLastPost(false);
			client.say(target, success ? "ok" : "no");
			return;
		}

		// track bluesky urls in messages
		const bskyUrlMatch = message.match(
			/https?:\/\/bsky\.app\/profile\/[^/]+\/post\/[^/\s]+/i,
		);
		if (bskyUrlMatch) {
			lastBskyUrl = bskyUrlMatch[0];
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
