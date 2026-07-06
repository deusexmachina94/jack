// audit module — hash-chained audit log, Merkle anchoring, transparency proofs.
export { AuditLog, type AuditEntry, type Anchor } from './service.js';
export { auditRoutes, type AuditDeps } from './routes.js';
export {
  merkleRoot, merkleProof, verifyProof, type ProofStep,
} from './merkle.js';
