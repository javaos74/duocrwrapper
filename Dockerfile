FROM node:22

WORKDIR /app
COPY . .
RUN npm install 
ENV PORT 5000
CMD [ "npm", "start" ]
