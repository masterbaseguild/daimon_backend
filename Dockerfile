FROM node:21-alpine3.17

WORKDIR /

COPY package.json package.json

RUN npm ci

COPY . .

RUN npm run build

EXPOSE 80

CMD ["npm", "start"]