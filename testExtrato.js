import { BradescoProvider } from './src/providers/BradescoProvider.js';

async function test() {
  const provider = new BradescoProvider();
  try {
    const extrato = await provider.fetchExtrato('06112024', '20112024');
    console.log('Movimentos:', extrato.length);
  } catch (e) {
    console.error('Erro:', e.message);
  }
}

test();
