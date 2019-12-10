FROM node:stretch-slim
LABEL maintainer "ChesTeRcs"

EXPOSE 1611
COPY server.js /server.js

WORKDIR /
CMD ["node", "server.js"]