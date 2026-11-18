FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=2s --retries=10 CMD wget -qO- http://localhost:3000/salud || exit 1
CMD ["node", "src/server.js"]
