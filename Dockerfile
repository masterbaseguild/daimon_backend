FROM node:21-alpine3.17

WORKDIR /daimon

COPY . .
RUN npm install
RUN npm run build

EXPOSE 80

CMD ["npm", "start"]