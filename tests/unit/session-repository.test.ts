import {PostgresSessionRepository} from '../../packages/database/src/sessions';

test('session operations use the shared transaction and bound parameters', async () => {
  const query = jest.fn().mockResolvedValueOnce({rows: []}).mockResolvedValueOnce({rows: [{account_id: 'account', password_hash: 'hash'}]})
    .mockResolvedValueOnce({rows: [{absolute_expires_at: new Date(0)}]}).mockResolvedValueOnce({rows: [{account_id: 'account'}]})
    .mockResolvedValueOnce({rows: []});
  const repository = new PostgresSessionRepository({transaction: work => work({query} as never)});
  expect(await repository.credential('a@example.test')).toEqual({accountId: 'account', passwordHash: 'hash'});
  await repository.create('session', 'account', 'digest');
  expect(await repository.renew('digest')).toBe('account');
  await repository.revoke('digest');
  expect(query.mock.calls[1]?.[1]).toEqual(['a@example.test']);
  expect(query.mock.calls[2]?.[1]).toEqual(['session', 'account', 'digest']);
  expect(query.mock.calls[3]?.[0]).toContain('revoked_at IS NULL');
  expect(query.mock.calls[3]?.[0]).toContain("interval '30 minutes'");
  expect(query.mock.calls[4]?.[1]).toEqual(['digest']);
});
