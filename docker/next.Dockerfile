FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
COPY docker/next-entrypoint.sh /usr/local/bin/fanzoom-next-entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/fanzoom-next-entrypoint && chmod +x /usr/local/bin/fanzoom-next-entrypoint

EXPOSE 3000

ENTRYPOINT ["fanzoom-next-entrypoint"]
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]
