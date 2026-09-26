import { createHttpClient } from '@/lib/httpClient';
import { AppError } from '@/lib/errors';

const auth = () => ({ accessToken: 't', tenantId: 'x' });

describe('httpClient error typing', () => {
  it('turns a fetch rejection into AppError(network, 0)', async () => {
    const http = createHttpClient({ baseUrl: 'http://api', getAuth: auth, fetchImpl: jest.fn().mockRejectedValue(new TypeError('Network request failed')) });
    await expect(http.get('/x')).rejects.toMatchObject({ code: 'network', status: 0 });
    await expect(http.get('/x')).rejects.toBeInstanceOf(AppError);
  });

  it('maps an empty-body 403 (tenant header mismatch) to forbidden', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 403, json: () => Promise.reject(new Error('no body')) });
    const http = createHttpClient({ baseUrl: 'http://api', getAuth: auth, fetchImpl });
    await expect(http.get('/x')).rejects.toMatchObject({ code: 'forbidden', status: 403 });
  });
});
