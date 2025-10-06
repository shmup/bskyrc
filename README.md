# bskyrc

IRC-to-Bluesky bot that posts from IRC commands to a Bluesky account.

## Setup

1. Copy `.env.template` to `.env` and fill in your credentials:
   ```bash
   cp .env.template .env
   ```

2. Edit `.env` with your IRC and Bluesky credentials (set `IRC_PASSWORD` if your nick requires NickServ authentication)

3. Install dependencies:
   ```bash
   bun install
   ```

4. Run the bot:
   ```bash
   bun start
   ```

## Commands

### Post to Bluesky
```
twit hello world
```

### Post with an image
```
twit hello world https://example.com/image.jpg
```

Image URLs are automatically detected and embedded (supports .jpg, .jpeg, .png, .gif, .webp, .bmp). Query strings are supported (e.g., `image.jpg?size=large`). Multiple images (up to 4) are supported.

### Quote someone's last message
```
quote usernick
```

### Quote with additional text
```
quote usernick foo bar
```
This will post usernick's last message followed by "foo bar" on a new line.

### Reply to a post
```
reply this is my reply
```
Replies to the last Bluesky URL posted in the channel. Supports images like `twit`.

### Delete your last post
```
untwit
```
Deletes your last post (within time limit). Use `untwit!` to force delete.

## Features

- Posts appear as natural Bluesky posts without IRC nick formatting
- Stores message history to support quoting
- Supports image embedding
- NickServ authentication support
- Case-insensitive command handling
