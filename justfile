# start the irc-to-bluesky bot
start:
    bun run index.ts

# format and lint code
fmt:
    bunx @biomejs/biome check --write --unsafe .

# check code without fixing
lint:
    bunx @biomejs/biome check .
