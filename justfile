format:
    bun format

lint:
    bun lint

start:
    bun run index.ts

test:
    bun test

# run production container
up:
    docker compose up -d

# run staging container
up-staging:
    docker compose -f compose.staging.yml up -d

# stop containers
down:
    docker compose down
    docker compose -f compose.staging.yml down 2>/dev/null || true
