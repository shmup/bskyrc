## bskyrc

irc-to-bluesky bot

### setup
```bash
curl -fsSL https://bun.sh/install | bash
cp .env.template .env # you gotta edit this
bun install
bun start
```

### development

```bash
bun dev # hack on it with reloading
bun format
bun test

```

### commands

```bash
twit hello world
twit check this out https://example.com/image.jpg  # images detected by file extension or MIME type
twit cool pic https://cdn.bsky.app/img/...  # works even without .jpg extension
quote usernick
quote usernick with extra text
reply this is my reply
untwit
sup usernick # infers .bsky.social otherwise supply full handle
```

### features

- supports posting text and images to bluesky
- automatic image detection via file extension or MIME type (works with CDN URLs)
- automatic image resizing (max 2000px) to fit within bluesky's size limits
- replies to last bluesky post in channel
- quoting from message history
- untwit to delete last bluesky post in channel
