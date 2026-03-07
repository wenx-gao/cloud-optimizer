# 1. Basis-Image wählen
FROM node:20-slim

# 2. Arbeitsverzeichnis im Container festlegen
WORKDIR /app

# 3. Abhängigkeiten kopieren
# Wir kopieren nur die package.json Dateien zuerst, um das Caching zu optimieren
COPY package*.json ./

# 4. Installation der Pakete
RUN npm install

# 5. Den Rest des Frontend-Quellcodes kopieren
COPY . .

# 6. Port für Vite (Standard ist 5173)
EXPOSE 5173

# 7. Startbefehl
# WICHTIG: --host sorgt dafür, dass Vite nicht nur auf 127.0.0.1 hört, 
# sondern im Docker-Netzwerk erreichbar ist.
CMD ["npm", "run", "dev", "--", "--host"]
