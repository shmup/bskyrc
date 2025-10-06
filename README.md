## bskyrc

irc-to-bluesky bot

### setup
```bash
curl -fsSL https://bun.sh/install | bash
cp .env.template .env # edit .env with your credentials
bun install
bun start
```

### development

```bash
bun dev # hack on it with reloading
just fmt
just test

```

### commands

```bash
twit hello world
twit check this out https://example.com/image.jpg
quote usernick
quote usernick with extra text
reply this is my reply
untwit
```

### features


- supports posting text and images to bluesky
- replies to last bluesky post in channel
- quoting from message history
- untwit to delete last bluesky post in channel
