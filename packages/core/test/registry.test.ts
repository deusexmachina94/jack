import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Db } from '../src/db/client.js';
import { makeTestDb } from './helpers/db.js';
import {
  createPublisher, addDomain, verifyDomain, getDomainByName, challengeHost,
} from '../src/modules/registry/index.js';
import { fakeDnsResolver } from '../src/modules/registry/dns.js';

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => { ({ db, close } = await makeTestDb()); });
afterEach(async () => { await close(); });

describe('registry', () => {
  it('registers a publisher and claims a domain with a challenge', async () => {
    const pub = await createPublisher(db, { name: 'NZZ', email: 'ops@nzz.ch' });
    const domain = await addDomain(db, pub.id, 'NZZ.ch');
    expect(domain.domain).toBe('nzz.ch');
    expect(domain.status).toBe('unverified');
    expect(domain.challenge).toMatch(/^brip-verify=[0-9a-f]{32}$/);
  });

  it('rejects an invalid domain and a duplicate claim', async () => {
    const pub = await createPublisher(db, { name: 'X', email: 'a@x.io' });
    await expect(addDomain(db, pub.id, 'not a domain')).rejects.toThrow(/valid domain/);
    await addDomain(db, pub.id, 'x.io');
    await expect(addDomain(db, pub.id, 'x.io')).rejects.toThrow(/already claimed/);
  });

  it('verifies a domain when the DNS-TXT record matches', async () => {
    const pub = await createPublisher(db, { name: 'NZZ', email: 'ops@nzz.ch' });
    const domain = await addDomain(db, pub.id, 'nzz.ch');
    const dns = fakeDnsResolver({ [challengeHost('nzz.ch')]: ['some-other', domain.challenge] });

    const verified = await verifyDomain(db, domain.id, dns);
    expect(verified.status).toBe('verified');
    expect(verified.verifiedAt).toBeInstanceOf(Date);
  });

  it('stays pending when the record is missing or wrong', async () => {
    const pub = await createPublisher(db, { name: 'NZZ', email: 'ops@nzz.ch' });
    const domain = await addDomain(db, pub.id, 'nzz.ch');
    const dns = fakeDnsResolver({ [challengeHost('nzz.ch')]: ['brip-verify=wrong'] });

    const result = await verifyDomain(db, domain.id, dns);
    expect(result.status).toBe('pending');
    expect((await getDomainByName(db, 'nzz.ch'))?.status).toBe('pending');
  });
});
