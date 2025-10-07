FROM oven/bun:alpine

WORKDIR /app

COPY package.json bun.lock ./
COPY index.ts tsconfig.json ./
COPY src ./src

RUN bun install --production --ignore-scripts

CMD ["bun", "run", "index.ts"]
