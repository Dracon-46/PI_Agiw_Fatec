import { defineConfig } from '@prisma/config';

export default defineConfig({
  datasource: {
    url: 'sqlserver://dell5:1433;database=BDAPRESENTACAO;user=sa;password=12345;encrypt=true;trustServerCertificate=true;',
  },
});