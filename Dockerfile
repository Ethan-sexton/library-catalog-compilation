FROM node:22-alpine

#Install Python 3 and pip
RUN apk add --no-cache python3 py3-pip build-base python3-dev

WORKDIR /app

#Install Node 
COPY package*.json ./
RUN npm ci --omit=dev

#Install Python dependencies with requirements file. 
COPY requirements.txt* ./
RUN if [ -f requirements.txt ]; then pip3 install --no-cache-dir -r requirements.txt --break-system-packages; fi

#Copy remaining files
COPY . .

#Set prod env
ENV NODE_ENV=production
ENV PORT=8080

#Expose dat
EXPOSE 8080

CMD ["node", "src/server.js"]