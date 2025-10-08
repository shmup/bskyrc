// bluesky posting and interaction logic
import {
	type AppBskyFeedPost,
	type AppBskyRichtextFacet,
	type AtpAgent,
	RichText,
} from "@atproto/api";
import sharp from "sharp";

import { BLUESKY_APP_URL, ONE_HOUR_MS } from "./constants.js";

// type for bluesky post data
interface PostData {
	text: string;
	facets?: AppBskyRichtextFacet.Main[];
	embed?: AppBskyFeedPost.Record["embed"];
	reply?: AppBskyFeedPost.ReplyRef;
}

export interface ReplyTarget {
	uri: string;
	cid: string;
}

export interface PostResult {
	success: boolean;
	uri?: string;
	url?: string;
}

export async function postToBluesky(
	agent: AtpAgent,
	text: string,
	imageUrls?: string[],
	replyTo?: ReplyTarget,
): Promise<PostResult> {
	try {
		const rt = new RichText({ text });
		await rt.detectFacets(agent);

		const postData: PostData = {
			facets: rt.facets,
			text: rt.text,
		};

		// add reply data if this is a reply
		if (replyTo) {
			postData.reply = {
				parent: replyTo,
				root: replyTo,
			};
		}

		// handle image embedding if urls provided (max 4 images)
		if (imageUrls && imageUrls.length > 0) {
			try {
				const images = [];
				// bluesky supports up to 4 images per post
				const urlsToEmbed = imageUrls.slice(0, 4);

				for (const imageUrl of urlsToEmbed) {
					// fetch the image
					const response = await fetch(imageUrl);
					const imageBuffer = await response.arrayBuffer();

					// resize image to stay under size limits (max 2000px on longest side)
					const resizedBuffer = await sharp(Buffer.from(imageBuffer))
						.resize(2000, 2000, {
							fit: "inside",
							withoutEnlargement: true,
						})
						.jpeg({ quality: 90 })
						.toBuffer();

					// upload to bluesky
					const uploadResponse = await agent.uploadBlob(
						new Uint8Array(resizedBuffer),
						{
							encoding: "image/jpeg",
						},
					);

					images.push({
						alt: "",
						image: uploadResponse.data.blob,
					});
				}

				postData.embed = {
					$type: "app.bsky.embed.images",
					images,
				};
			} catch (err) {
				console.error("Failed to embed images:", err);
				return { success: false };
			}
		}

		const response = await agent.post(
			postData as Partial<AppBskyFeedPost.Record> &
				Omit<AppBskyFeedPost.Record, "createdAt">,
		);
		const postUrl = `${BLUESKY_APP_URL}/profile/${agent.session?.handle}/post/${response.uri.split("/").pop()}`;
		console.log("Posted to Bluesky:", postUrl);

		return {
			success: true,
			uri: response.uri,
			url: postUrl,
		};
	} catch (err) {
		console.error("Failed to post to Bluesky:", err);
		return { success: false };
	}
}

export async function parseBlueskyUrl(
	agent: AtpAgent,
	url: string,
): Promise<ReplyTarget | null> {
	try {
		// extract handle and post id from url
		// format: https://bsky.app/profile/{handle}/post/{postId}
		const match = url.match(
			/https?:\/\/bsky\.app\/profile\/([^/]+)\/post\/([^/\s]+)/i,
		);
		if (!match) return null;

		const handle = match[1] as string;
		const postId = match[2] as string;

		// resolve handle to did
		const profile = await agent.getProfile({ actor: handle });
		const did = profile.data.did;

		// construct at-uri
		const uri = `at://${did}/app.bsky.feed.post/${postId}`;

		// fetch the post to get the cid
		const post = await agent.getPost({ repo: did, rkey: postId });
		const cid = post.cid;

		return { cid, uri };
	} catch (err) {
		console.error("Failed to parse Bluesky URL:", err);
		return null;
	}
}

export async function deletePost(
	agent: AtpAgent,
	uri: string | null,
	timestamp: number | null,
	forceDelete: boolean,
): Promise<{ success: boolean; text?: string }> {
	try {
		let postUri = uri;
		let postTimestamp = timestamp;
		let postText: string | undefined;

		// if we don't have a cached post, fetch the most recent one
		if (!postUri) {
			const feed = await agent.getAuthorFeed({
				actor: agent.session?.did || "",
				limit: 1,
			});

			if (!feed.data.feed.length) {
				return { success: false };
			}

			const post = (feed.data.feed[0] as (typeof feed.data.feed)[0]).post;
			postUri = post.uri;
			// extract timestamp from post indexedAt
			postTimestamp = new Date(post.indexedAt).getTime();
			// extract text from post record
			postText = (post.record as { text?: string })?.text;
		} else {
			// fetch the post to get its text
			try {
				const postData = await agent.getPost({
					repo: agent.session?.did || "",
					rkey: postUri.split("/").pop() || "",
				});
				postText = (postData.value as { text?: string })?.text;
			} catch (err) {
				console.error("Failed to fetch post text:", err);
			}
		}

		// check if post is within 1 hour unless force delete
		if (!forceDelete && postTimestamp) {
			if (Date.now() - postTimestamp > ONE_HOUR_MS) {
				return { success: false };
			}
		}

		await agent.deletePost(postUri);
		console.log("Deleted post:", postUri);
		return { success: true, text: postText };
	} catch (err) {
		console.error("Failed to delete post:", err);
		return { success: false };
	}
}

/**
 * normalize a handle by adding .bsky.social if it doesn't contain a period
 */
function normalizeHandle(handle: string): string {
	if (handle.includes(".")) {
		return handle;
	}
	return `${handle}.bsky.social`;
}

export interface LastPostResult {
	success: boolean;
	message?: string;
	url?: string;
}

// formats a post object into a display message
function formatPostMessage(post: {
	record: unknown;
	embed?: unknown;
	author: { handle: string };
}): string {
	// extract post text
	let text = (post.record as { text?: string }).text || "";

	// check for embeds
	const embed = post.embed;
	if (embed) {
		// check for quote posts
		if ((embed as { $type?: string }).$type === "app.bsky.embed.record#view") {
			text += `${text ? " " : ""}[+quote]`;
		}
		// check for images
		else if (
			(embed as { $type?: string }).$type === "app.bsky.embed.images#view" &&
			(embed as { images?: unknown[] }).images &&
			Array.isArray((embed as { images: unknown[] }).images)
		) {
			const imgCount = (embed as { images: unknown[] }).images.length;
			if (imgCount === 1) {
				text += `${text ? " " : ""}[image]`;
			} else {
				text += `${text ? " " : ""}[+${imgCount} images]`;
			}
		}
		// check for external links
		else if (
			(embed as { $type?: string }).$type === "app.bsky.embed.external#view" &&
			(embed as { external?: unknown }).external &&
			(
				(embed as { external: unknown }).external as {
					uri?: string;
				}
			).uri
		) {
			const linkUrl = (
				(embed as { external: unknown }).external as {
					uri: string;
				}
			).uri;
			text += (text ? " " : "") + linkUrl;
		}
	}

	const authorHandle = post.author.handle;
	return `bsky/@${authorHandle}: ${text}`;
}

export async function getLastPost(
	agent: AtpAgent,
	handle: string,
): Promise<LastPostResult> {
	try {
		const normalizedHandle = normalizeHandle(handle);

		// fetch the user's feed
		const feed = await agent.getAuthorFeed({
			actor: normalizedHandle,
			limit: 1,
		});

		if (!feed.data.feed.length) {
			return { message: "crickets", success: true };
		}

		const feedItem = feed.data.feed[0];
		const post = feedItem?.post;
		if (!post) {
			return { success: false };
		}

		const message = formatPostMessage(post);
		const postUrl = `${BLUESKY_APP_URL}/profile/${post.author.handle}/post/${post.uri.split("/").pop()}`;

		return {
			message,
			success: true,
			url: postUrl,
		};
	} catch (err) {
		// invalid handle or profile not found - return "who?"
		if (
			err &&
			typeof err === "object" &&
			"message" in err &&
			typeof err.message === "string" &&
			(err.message.includes("Profile not found") ||
				err.message.includes("actor must be a valid did or a handle"))
		) {
			console.log(`Invalid or unknown handle: ${handle}`);
			return { message: "who?", success: true };
		}
		// other errors - log and return failure
		console.error("Failed to get last post:", err);
		return { success: false };
	}
}

// fetches and formats a post given its bluesky url
export async function getPostFromUrl(
	agent: AtpAgent,
	url: string,
): Promise<LastPostResult> {
	try {
		// parse the url to get uri
		const replyData = await parseBlueskyUrl(agent, url);
		if (!replyData) {
			return { success: false };
		}

		// fetch the post thread to get the post data
		const thread = await agent.getPostThread({ uri: replyData.uri });
		if (
			!thread.data.thread ||
			thread.data.thread.$type !== "app.bsky.feed.defs#threadViewPost"
		) {
			return { success: false };
		}

		const post = thread.data.thread.post;

		const message = formatPostMessage(post);

		return {
			message,
			success: true,
			url,
		};
	} catch (err) {
		console.error("Failed to get post from URL:", err);
		return { success: false };
	}
}
