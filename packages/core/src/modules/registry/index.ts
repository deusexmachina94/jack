// registry module — publisher registration, domain claiming, DNS-TXT verification.
export {
  createPublisher, addDomain, verifyDomain, getDomainByName, challengeHost,
  type Publisher, type Domain,
} from './service.js';
export { registryRoutes, type RegistryDeps } from './routes.js';
export { nodeDnsResolver, fakeDnsResolver, type DnsResolver } from './dns.js';
