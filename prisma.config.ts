import 'dotenv/config';
import { defineConfig } from '@prisma/config';

// A URL de conexão vem do .env (DATABASE_URL) e nunca é escrita no código.
// O Prisma CLI só a usa em "prisma db pull"; a aplicação conecta pelas
// variáveis DB_* (veja src/lib/db.js).
export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
