export function buf(u: Uint8Array): Uint8Array<ArrayBuffer> {
  return u as unknown as Uint8Array<ArrayBuffer>;
}
