export function hasDatabaseConnectionString(rawConnectionString?: string): boolean {
  return Boolean(rawConnectionString?.trim());
}

export function redactDatabaseUrlForLogs(connectionString: string): string {
  return connectionString.replace(/:([^@:]+)@/, ":******@");
}

export function shouldSeedDefaultDocument(existingDocumentCount: number): boolean {
  return existingDocumentCount === 0;
}
