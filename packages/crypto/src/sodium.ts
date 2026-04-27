import _sodium from "libsodium-wrappers";

let initialised = false;

export async function ensureSodium(): Promise<typeof _sodium> {
  if (!initialised) {
    await _sodium.ready;
    initialised = true;
  }
  return _sodium;
}

export type Sodium = typeof _sodium;
