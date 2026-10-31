FROM node:22-alpine
WORKDIR /app
COPY app ./app
COPY growatt.js server.js ./
ENV DATA_DIR=/data PORT=8787 TZ=Europe/Berlin
VOLUME /data
EXPOSE 8787
CMD ["node", "server.js"]
