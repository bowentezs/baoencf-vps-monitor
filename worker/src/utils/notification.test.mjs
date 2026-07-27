import assert from 'node:assert/strict';
import { validateLoadNotificationInput } from './notification.ts';

const allowedClientIds = new Set(['node-a', 'node-b']);
const base = {
  name: 'CPU high load',
  metric: 'cpu',
  threshold: 80,
  ratio: 0.8,
  interval_min: 15,
};

const targeted = validateLoadNotificationInput({
  ...base,
  all_clients: false,
  clients: ['node-a'],
}, allowedClientIds);
assert.equal(targeted.ok, true);
if (targeted.ok) assert.deepEqual(targeted.item.clients, ['node-a']);

const emptyTarget = validateLoadNotificationInput({
  ...base,
  all_clients: false,
  clients: [],
}, allowedClientIds);
assert.equal(emptyTarget.ok, false);
if (!emptyTarget.ok) assert.match(emptyTarget.errors.join('\n'), /至少一个客户端/);

const allClients = validateLoadNotificationInput({
  ...base,
  all_clients: true,
  clients: ['node-a'],
}, allowedClientIds);
assert.equal(allClients.ok, true);
if (allClients.ok) assert.deepEqual(allClients.item.clients, []);

const legacyAllClients = validateLoadNotificationInput({ ...base, clients: [] }, allowedClientIds);
assert.equal(legacyAllClients.ok, true);
if (legacyAllClients.ok) assert.deepEqual(legacyAllClients.item.clients, []);

const invalidFlag = validateLoadNotificationInput({
  ...base,
  all_clients: 'false',
  clients: ['node-a'],
}, allowedClientIds);
assert.equal(invalidFlag.ok, false);
if (!invalidFlag.ok) assert.match(invalidFlag.errors.join('\n'), /all_clients/);
