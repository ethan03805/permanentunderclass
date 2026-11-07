FROM node:24-slim

WORKDIR /app
COPY package.json ./
COPY src ./src

USER node
ENV HOST=0.0.0.0 PORT=8080
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "src/main.ts"]
