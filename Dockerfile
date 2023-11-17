FROM node:21-alpine3.17

WORKDIR /

COPY . .
RUN npm ci
RUN npm run build

EXPOSE 80

CMD ["npm", "start"]