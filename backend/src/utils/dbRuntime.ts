export const hasDatabaseConnectionString = (url: string) => {
  return url && url.length > 10;
};

export const redactDatabaseUrlForLogs = (url: string) => {
  try {
    const u = new URL(url);
    u.password = "****";
    return u.toString();
  } catch (e) {
    return "INVALID_URL";
  }
};

export const shouldSeedDefaultDocument = (count: number) => {
  return count === 0;
};
