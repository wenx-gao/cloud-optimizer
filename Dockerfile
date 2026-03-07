# Node.js Version festlegen
FROM node:20-slim

# Arbeitsverzeichnis erstellen
WORKDIR /app

# Abhängigkeiten kopieren und installieren
COPY package*.json ./
RUN npm install

# Quellcode kopieren
COPY . .

# Port für Backend und Socket.io
EXPOSE 3000

# Startbefehl (nutzt ts-node direkt im Container)
CMD ["npm", "run", "dev"]
