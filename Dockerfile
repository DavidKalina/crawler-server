# Use Node.js 18 as the base image
FROM node:18-slim

# Create app directory
WORKDIR /usr/src/app

# Install necessary system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run prebuild && npm run build

# Expose the port your app runs on
EXPOSE 3000

# Command to run the application
CMD ["node", "dist/index.js"]