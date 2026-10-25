import test from 'node:test';
import assert from 'node:assert/strict';
import { redact, redactString, describeVideoStart } from './diagnostics.mjs';

test('serials keep only the model prefix, MACs and emails are removed', () => {
  const s = redactString('device T8214000000000AB at 00:11:22:33:44:55 / 001122334455 for someone@example.com');
  assert.match(s, /T8214<sn>/);
  assert.doesNotMatch(s, /000000000AB|00:11:22|001122334455|someone@/);
});

test('secret-looking fields and key material are redacted', () => {
  const out = redact({ password: 'x', auth_token: 'y', accountId: 'z', p2p_did: 'ABCD-123', model: 'T8214', key: Buffer.alloc(32), blob: 'a'.repeat(64) });
  assert.equal(out.password, '<redacted>');
  assert.equal(out.auth_token, '<redacted>');
  assert.equal(out.accountId, '<redacted>');
  assert.equal(out.p2p_did, '<redacted>');
  assert.equal(out.model, 'T8214');
  assert.equal(out.key, '<redacted>');
  assert.equal(out.blob, '<hex>');
});

test('video start detection reads the first NAL header', () => {
  const h264 = describeVideoStart(Buffer.from([0, 0, 0, 1, 0x67, 0x42]));
  assert.equal(h264.annexB, true);
  assert.equal(h264.h264NalType, 7);
  const h265 = describeVideoStart(Buffer.from([0, 0, 0, 1, 0x40, 0x01]));
  assert.equal(h265.h265NalType, 32);
});
