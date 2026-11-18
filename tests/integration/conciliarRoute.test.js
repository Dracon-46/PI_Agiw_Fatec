import { beforeEach, describe, expect, it, vi } from 'vitest';

// A rota é testada de ponta a ponta com os repositórios simulados: o que se
// verifica aqui são as regras de negócio que ela aplica antes de gravar.
const oRepo = vi.hoisted(() => ({
   buscaContaPorCodigo: vi.fn(),
   atualizaStatusLancamentos: vi.fn(),
   geraProximoNumSeqConc: vi.fn(),
   listaDatasLancamentos: vi.fn(),
   atualizaStatusMovimentos: vi.fn(),
   listaDatasMovimentos: vi.fn(),
   registraAuditoria: vi.fn(),
}));

vi.mock('../../src/lib/repositories/contaRepository.js', () => ({ buscaContaPorCodigo: oRepo.buscaContaPorCodigo }));
vi.mock('../../src/lib/repositories/lancamentoRepository.js', () => ({
   atualizaStatusLancamentos: oRepo.atualizaStatusLancamentos,
   geraProximoNumSeqConc: oRepo.geraProximoNumSeqConc,
   listaDatasLancamentos: oRepo.listaDatasLancamentos,
}));
vi.mock('../../src/lib/repositories/movimentoRepository.js', () => ({
   atualizaStatusMovimentos: oRepo.atualizaStatusMovimentos,
   listaDatasMovimentos: oRepo.listaDatasMovimentos,
}));
vi.mock('../../src/lib/repositories/auditoriaRepository.js', () => ({
   ACAO_CONCILIACAO: 'CONCILIACAO',
   ACAO_CONCILIACAO_AUTOMATICA: 'CONCILIACAO_AUTO',
   ACAO_ESTORNO: 'ESTORNO',
   registraAuditoria: oRepo.registraAuditoria,
}));
vi.mock('../../src/lib/db.js', () => ({
   dataBrParaSql: (sData) => {
      const [sDia, sMes, sAno] = String(sData ?? '').split('/');
      return sAno ? `${sAno}-${sMes}-${sDia}` : '';
   },
}));

const { POST } = await import('../../src/app/api/conciliacao/conciliar/route.js');

const requisicao = (oCorpo) =>
   new Request('http://localhost/api/conciliacao/conciliar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof oCorpo === 'string' ? oCorpo : JSON.stringify(oCorpo),
   });

const oConta = { codConta: 'itau-1500-12345', datUltimoBloqueio: '30/09/2026' };
const aLancamentos = [{ codLancamento: 'L1', valMovimento: 3250, bEntrada: true }];
const aMovimentos = [{ codMovimento: 'M1', valMovimento: 3250, bEntrada: true }];

beforeEach(() => {
   oRepo.buscaContaPorCodigo.mockResolvedValue(oConta);
   oRepo.listaDatasLancamentos.mockResolvedValue([{ codLancamento: 'L1', datMovimento: '01/10/2026' }]);
   oRepo.listaDatasMovimentos.mockResolvedValue([{ codMovimento: 'M1', datMovimento: '01/10/2026' }]);
   oRepo.geraProximoNumSeqConc.mockResolvedValue('000042');
   oRepo.atualizaStatusLancamentos.mockResolvedValue(1);
   oRepo.atualizaStatusMovimentos.mockResolvedValue(1);
   oRepo.registraAuditoria.mockResolvedValue(undefined);
});

describe('POST /api/conciliacao/conciliar', () => {
   it('recusa corpo inválido (400)', async () => {
      const oResp = await POST(requisicao('{nao é json'));
      expect(oResp.status).toBe(400);
   });

   it('exige conta e registros selecionados (400)', async () => {
      expect((await POST(requisicao({ lancamentos: aLancamentos }))).status).toBe(400);
      expect((await POST(requisicao({ conta: oConta.codConta }))).status).toBe(400);
   });

   it('recusa diferença diferente de zero sem tocar no banco (409)', async () => {
      const oResp = await POST(
         requisicao({ conta: oConta.codConta, bConciliado: true, lancamentos: aLancamentos, movimentos: [{ ...aMovimentos[0], valMovimento: 3250.01 }] })
      );

      expect(oResp.status).toBe(409);
      expect((await oResp.json()).valDiferenca).toBe(-0.01);
      expect(oRepo.atualizaStatusLancamentos).not.toHaveBeenCalled();
   });

   it('devolve 404 para conta inexistente', async () => {
      oRepo.buscaContaPorCodigo.mockResolvedValue(null);
      const oResp = await POST(requisicao({ conta: 'x', bConciliado: true, lancamentos: aLancamentos, movimentos: aMovimentos }));

      expect(oResp.status).toBe(404);
   });

   it('recusa registros em período bloqueado (409)', async () => {
      oRepo.listaDatasMovimentos.mockResolvedValue([{ codMovimento: 'M1', datMovimento: '15/09/2026' }]);
      const oResp = await POST(requisicao({ conta: oConta.codConta, bConciliado: true, lancamentos: aLancamentos, movimentos: aMovimentos }));

      expect(oResp.status).toBe(409);
      expect((await oResp.json()).aRegistrosBloqueados).toEqual(['M1 (15/09/2026)']);
      expect(oRepo.atualizaStatusMovimentos).not.toHaveBeenCalled();
   });

   it('grava a conciliação com a mesma sequência nos dois lados e audita', async () => {
      const oResp = await POST(requisicao({ conta: oConta.codConta, bConciliado: true, lancamentos: aLancamentos, movimentos: aMovimentos }));

      expect(oResp.status).toBe(200);
      expect(oRepo.atualizaStatusLancamentos).toHaveBeenCalledWith(oConta, ['L1'], true, { sNumSeqConc: '000042', bAutomatica: false });
      expect(oRepo.atualizaStatusMovimentos).toHaveBeenCalledWith(oConta, ['M1'], true, { sNumSeqConc: '000042', bAutomatica: false });
      expect(oRepo.registraAuditoria).toHaveBeenCalledWith(expect.objectContaining({ tipAcao: 'CONCILIACAO' }));
   });

   it('estorna sem gerar nova sequência', async () => {
      const oResp = await POST(requisicao({ conta: oConta.codConta, bConciliado: false, lancamentos: aLancamentos, movimentos: aMovimentos }));

      expect(oResp.status).toBe(200);
      expect(oRepo.geraProximoNumSeqConc).not.toHaveBeenCalled();
      expect(oRepo.registraAuditoria).toHaveBeenCalledWith(expect.objectContaining({ tipAcao: 'ESTORNO' }));
   });

   it('devolve 500 quando a gravação falha', async () => {
      oRepo.atualizaStatusLancamentos.mockRejectedValue(new Error('falha de conexão'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const oResp = await POST(requisicao({ conta: oConta.codConta, bConciliado: true, lancamentos: aLancamentos, movimentos: aMovimentos }));

      expect(oResp.status).toBe(500);
   });
});
