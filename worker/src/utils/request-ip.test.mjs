import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeIpSubnetKey, isPublicIpAddress } from './request-ip.ts';

test('normalizeIpSubnetKey preserves IPv4 addresses', () => {
  assert.equal(normalizeIpSubnetKey('1.2.3.4'), '1.2.3.4');
  assert.equal(normalizeIpSubnetKey(' 192.168.1.100 '), '192.168.1.100');
});

test('normalizeIpSubnetKey unmaps IPv4-mapped IPv6', () => {
  assert.equal(normalizeIpSubnetKey('::ffff:192.0.2.1'), '192.0.2.1');
  assert.equal(normalizeIpSubnetKey('0:0:0:0:0:ffff:10.0.0.1'), '10.0.0.1');
});

test('normalizeIpSubnetKey aggregates IPv6 to /64 subnet', () => {
  // Full representation
  assert.equal(
    normalizeIpSubnetKey('2400:cb00:2048:0001:0000:0000:c629:d7a2'),
    '2400:cb00:2048:1::/64',
  );
  // Compressed with ::
  assert.equal(
    normalizeIpSubnetKey('2400:cb00:2048:1::c629:d7a2'),
    '2400:cb00:2048:1::/64',
  );
  // Two different hosts in the same /64 subnet yield identical keys
  assert.equal(
    normalizeIpSubnetKey('2400:cb00:2048:1::1'),
    normalizeIpSubnetKey('2400:cb00:2048:1:ffff:eeee:dddd:cccc'),
  );
  // Loopback and compressed prefix
  assert.equal(normalizeIpSubnetKey('::1'), '0:0:0:0::/64');
  assert.equal(normalizeIpSubnetKey('2001:db8::1'), '2001:db8:0:0::/64');
});
