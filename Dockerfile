FROM node:20

WORKDIR /app

# Instalar dependencias
COPY package*.json ./
COPY prisma/ ./prisma/
RUN npm install

# Copiar código
COPY . .

# Generar cliente Prisma
RUN npx prisma generate

# Build de Next.js
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]