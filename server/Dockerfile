FROM node:22-alpine

WORKDIR /app

# No npm deps — pure Node ESM + built-in node:sqlite
COPY package.json ./
COPY src ./src

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data
ENV SQLITE_PATH=/data/openhood.db

RUN mkdir -p /data

EXPOSE 8080

# node:sqlite is available on Node 22+
CMD ["node", "src/index.js"]
