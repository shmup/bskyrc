// bluesky posting and interaction logic
import {
	type AppBskyFeedPost,
	type AppBskyRichtextFacet,
	type AtpAgent,
	RichText,
} from "@atproto/api";

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

					// upload to bluesky
					const uploadResponse = await agent.uploadBlob(
						new Uint8Array(imageBuffer),
						{
							encoding: response.headers.get("content-type") || "image/jpeg",
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
): Promise<boolean> {
	try {
		let postUri = uri;
		let postTimestamp = timestamp;

		// if we don't have a cached post, fetch the most recent one
		if (!postUri) {
			const feed = await agent.getAuthorFeed({
				actor: agent.session?.did || "",
				limit: 1,
			});

			if (!feed.data.feed.length) {
				return false;
			}

			const post = (feed.data.feed[0] as (typeof feed.data.feed)[0]).post;
			postUri = post.uri;
			// extract timestamp from post indexedAt
			postTimestamp = new Date(post.indexedAt).getTime();
		}

		// check if post is within 1 hour unless force delete
		if (!forceDelete && postTimestamp) {
			if (Date.now() - postTimestamp > ONE_HOUR_MS) {
				return false;
			}
		}

		await agent.deletePost(postUri);
		console.log("Deleted post:", postUri);
		return true;
	} catch (err) {
		console.error("Failed to delete post:", err);
		return false;
	}
}
