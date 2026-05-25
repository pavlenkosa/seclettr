// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type SodiumModuleNamespace = typeof import("libsodium-wrappers-sumo");
type SodiumModule = SodiumModuleNamespace extends { default: infer T }
  ? T
  : SodiumModuleNamespace;

let sodiumPromise: Promise<SodiumModule> | null = null;

function resolveSodiumModule(module: SodiumModuleNamespace): SodiumModule {
  return (("default" in module ? module.default : module) as SodiumModule);
}

export async function ensureSodium(): Promise<SodiumModule> {
  if (!sodiumPromise) {
    sodiumPromise = import("libsodium-wrappers-sumo").then(async (module) => {
      const sodium = resolveSodiumModule(module);
      await sodium.ready;
      return sodium;
    });
  }

  return sodiumPromise;
}

export type Sodium = Awaited<ReturnType<typeof ensureSodium>>;
