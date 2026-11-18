import { describe, expect, it, vi } from 'vitest';

const oPrisma = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock('../../src/lib/db.js', () => ({ getPrisma: () => oPrisma }));

const { GET } = await import('../../src/app/api/health/route.js');
const oPacote = (await import('../../package.json')).default;

describe('GET /api/health', () => {
   it('responde 200 com a versão sem consultar o banco', async () => {
      const oResp = await GET(new Request('http://localhost/api/health'));

      expect(oResp.status).toBe(200);
      expect(await oResp.json()).toMatchObject({ status: 'ok', versao: oPacote.version });
      expect(oPrisma.$queryRaw).not.toHaveBeenCalled();
   });

   it('confere o banco quando pedido', async () => {
      oPrisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);
      const oResp = await GET(new Request('http://localhost/api/health?db=1'));

      expect(oResp.status).toBe(200);
      expect((await oResp.json()).banco).toBe('ok');
   });

   it('responde 503 quando o banco está fora do ar', async () => {
      oPrisma.$queryRaw.mockRejectedValue(new Error('ECONNREFUSED'));
      const oResp = await GET(new Request('http://localhost/api/health?db=1'));

      expect(oResp.status).toBe(503);
      expect(await oResp.json()).toMatchObject({ status: 'degradado', banco: 'indisponivel' });
   });
});
