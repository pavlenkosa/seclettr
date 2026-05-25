// No-op stub used by vite.config.ts when @welldone-software/why-did-you-render
// is not installed in the current environment (e.g. inside a Docker container
// that hasn't run pnpm install yet). The real package is used when available.
export default function noop(_React: unknown, _options?: unknown): void {}
