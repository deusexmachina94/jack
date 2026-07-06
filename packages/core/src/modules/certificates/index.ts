// certificates module — signed provenance certificates + regulator export bundle.
export {
  issueCertificate, verifyCertificate, getCertificate,
  type Certificate, type IssueCertInput,
} from './service.js';
export { buildRegulatorExport } from './export.js';
export { certificateRoutes, type CertificateDeps } from './routes.js';
