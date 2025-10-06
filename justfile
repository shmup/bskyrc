fmt:
    bunx @biomejs/biome check --write --unsafe .

lint:
    bunx @biomejs/biome check .

start:
    bun run index.ts

test:
    bun test
