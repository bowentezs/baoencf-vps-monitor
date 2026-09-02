import assert from 'node:assert/strict';

const {
  getSupabaseAdminClients,
  getSupabaseClientByToken,
  getSupabaseClientIdentityByToken,
  getSupabaseClientVisibility,
  getSupabasePublicClients,
  insertSupabaseMonitorRecords,
  updateSupabaseClientAndReturn,
} = await import('./client.ts');

const originalFetch = globalThis.fetch;
const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
};

globalThis.fetch = async (url) => {
  const rpc = String(url).split('/').pop();
  if (rpc === 'cfm_public_clients') {
    return Response.json([{ uuid: 'public-hidden', name: 'Hidden', hidden: 1, auto_renewal: 0 }]);
  }
  if (rpc === 'cfm_admin_clients') {
    return Response.json([{ uuid: 'admin-hidden', name: 'Hidden', hidden: 1, auto_renewal: 1 }]);
  }
  if (rpc === 'cfm_client_visibility') {
    return Response.json({ uuid: 'visibility-hidden', hidden: '1' });
  }
  if (rpc === 'cfm_agent_client_by_token') {
    return Response.json({ uuid: 'agent-hidden', name: 'Hidden', token_hash: 'hash', hidden: 1, auto_renewal: 0 });
  }
  if (rpc === 'cfm_agent_client_identity_by_token') {
    return Response.json({ uuid: 'identity-hidden', name: 'Hidden', hidden: 'true' });
  }
  if (rpc === 'cfm_update_client_returning') {
    return Response.json({ uuid: 'updated-hidden', name: 'Hidden', token_hash: 'hash', hidden: 1, auto_renewal: 0 });
  }
  if (rpc === 'cfm_insert_monitor_records') {
    return Response.json(2);
  }
  return Response.json(null);
};

try {
  assert.equal((await getSupabasePublicClients(env))[0].hidden, true);
  assert.equal((await getSupabaseAdminClients(env))[0].hidden, true);
  assert.equal((await getSupabaseClientVisibility(env, 'visibility-hidden')).hidden, true);
  assert.equal((await getSupabaseClientByToken(env, 'token')).hidden, true);
  assert.equal((await getSupabaseClientIdentityByToken(env, 'token')).hidden, true);
  assert.equal((await updateSupabaseClientAndReturn(env, 'updated-hidden', { hidden: true })).hidden, true);
  assert.equal(
    await insertSupabaseMonitorRecords(env, [
      { client: 'batch-1', time: '2026-01-01T00:00:00.000Z', cpu: 1 },
      { client: 'batch-2', time: '2026-01-01T00:00:00.000Z', cpu: 2 },
    ]),
    2,
  );
} finally {
  globalThis.fetch = originalFetch;
}
