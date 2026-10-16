# Build stage
FROM node:18 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

# Backend URL is baked into the React bundle at build time
ARG REACT_APP_API_URL=http://localhost:5000
ENV REACT_APP_API_URL=$REACT_APP_API_URL

RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
