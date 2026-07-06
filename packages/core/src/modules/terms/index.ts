// terms module — RSL ingestion + immutable append-and-supersede license store.
export { ingestTerms, getCurrentTerms, type LicenseTerm, type IngestInput } from './service.js';
export { termsRoutes, type TermsDeps } from './routes.js';
export { parseRsl, type Policy } from './rsl.js';
