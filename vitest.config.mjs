import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// O ERP e os usuários estão no fuso de Brasília: os testes rodam nele para que
// datas como "último bloqueio + 1" se comportem como em produção.
process.env.TZ = 'America/Sao_Paulo';

export default defineConfig({
   resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
   },
   test: {
      environment: 'node',
      include: ['tests/**/*.test.js'],
      clearMocks: true,
      coverage: {
         provider: 'v8',
         reporter: ['text', 'html', 'lcov'],
         // A pipeline falha se a cobertura das regras de negócio cair abaixo disto
         thresholds: { lines: 85, functions: 85, statements: 85, branches: 70 },
         include: [
            'src/utils/**',
            'src/services/autoMatchService.js',
            'src/lib/conciliacao/**',
            'src/lib/relatorios/**',
            'src/app/api/conciliacao/conciliar/**',
            'src/app/api/health/**',
         ],
      },
   },
});
