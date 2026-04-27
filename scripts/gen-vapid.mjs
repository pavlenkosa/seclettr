import { createRequire } from "node:module";
import { createECDH } from "node:crypto";

function toBase64Url(input) {
  let output = Buffer.from(input).toString("base64");
  output = output.split("+").join("-");
  output = output.split("/").join("_");
  while (output.endsWith("=")) {
    output = output.slice(0, -1);
  }
  return output;
}

function generateWithWebPush() {
  try {
    const requireFromApi = createRequire(new URL("../apps/api/package.json", import.meta.url));
    const webpush = requireFromApi("web-push");
    return webpush.generateVAPIDKeys();
  } catch {
    return null;
  }
}

function generateWithNodeCrypto() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    publicKey: toBase64Url(ecdh.getPublicKey(undefined, "uncompressed")),
    privateKey: toBase64Url(ecdh.getPrivateKey()),
  };
}

const keys = generateWithWebPush() ?? generateWithNodeCrypto();

if (!keys.publicKey || !keys.privateKey) {
  throw new Error("Failed to generate VAPID keys");
}

console.log("VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + keys.privateKey);
console.log("VAPID_SUBJECT=mailto:dev@localhost");
