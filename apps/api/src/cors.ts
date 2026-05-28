const PRIVATE_HTTPS_LAN_HOSTNAME_PATTERN =
  /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;

export function isCapacitorOriginAllowed(origin: string): boolean {
  if (origin === "capacitor://localhost") {
    return true;
  }
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && url.hostname === "localhost";
  } catch {
    return false;
  }
}

export function isDevelopmentCorsOriginAllowed(
  origin: string,
  allowedOrigins: readonly string[]
): boolean {
  try {
    const url = new URL(origin);
    return (
      allowedOrigins.includes(origin) ||
      (url.protocol === "https:" &&
        (url.hostname === "localhost" ||
          PRIVATE_HTTPS_LAN_HOSTNAME_PATTERN.test(url.hostname)))
    );
  } catch {
    return false;
  }
}
