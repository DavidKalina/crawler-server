export interface DomainConfig {
  allowSubdomains: boolean;
  ignorePaths: boolean;
  allowedDomains: string[];
  excludedPaths?: string[];
}
