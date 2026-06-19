FROM node:20-alpine

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Run development server on port 3001
CMD ["npm", "run", "dev", "--", "-p", "3001"]
