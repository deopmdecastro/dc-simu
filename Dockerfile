FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
ARG APP_BUILD_COMMIT
RUN APP_BUILD_COMMIT="$APP_BUILD_COMMIT" npm run build
LABEL org.opencontainers.image.revision=$APP_BUILD_COMMIT
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
EXPOSE 3000
CMD ["npm", "start"]
