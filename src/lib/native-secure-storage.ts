type StrongholdStore = {
  get(key: string): Promise<number[]>;
  insert(key: string, value: number[]): Promise<void>;
  remove(key: string): Promise<void>;
};

type StrongholdClient = {
  getStore(): StrongholdStore;
};

type StrongholdInstance = {
  loadClient(name: string): Promise<StrongholdClient>;
  createClient(name: string): Promise<StrongholdClient>;
  save(): Promise<void>;
};

type StrongholdConstructor = {
  load(path: string, password: string): Promise<StrongholdInstance>;
};

type NativeGlobals = {
  core?: {
    invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  };
  path?: {
    appDataDir(): Promise<string>;
  };
  stronghold?: {
    Stronghold?: StrongholdConstructor;
  };
};

type VaultContext = {
  stronghold: StrongholdInstance;
  store: StrongholdStore;
};

const CLIENT_NAME = "labstar-mobile-auth";
const VAULT_FILE = "mobile-session-vault.hold";
let vaultPromise: Promise<VaultContext> | null = null;

function nativeGlobals() {
  return (window as unknown as { __TAURI__?: NativeGlobals }).__TAURI__;
}

export function isNativeMobileRuntime() {
  return Boolean(nativeGlobals()?.core?.invoke)
    && /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

async function openVault(): Promise<VaultContext> {
  if (vaultPromise) return vaultPromise;
  vaultPromise = (async () => {
    const tauri = nativeGlobals();
    if (!tauri?.core?.invoke || !tauri.path?.appDataDir || !tauri.stronghold?.Stronghold) {
      throw new Error("native_secure_storage_unavailable");
    }

    const [directory, password] = await Promise.all([
      tauri.path.appDataDir(),
      tauri.core.invoke<string>("secure_vault_password"),
    ]);
    const separator = directory.endsWith("/") || directory.endsWith("\\") ? "" : "/";
    const stronghold = await tauri.stronghold.Stronghold.load(
      `${directory}${separator}${VAULT_FILE}`,
      password,
    );

    let client: StrongholdClient;
    try {
      client = await stronghold.loadClient(CLIENT_NAME);
    } catch {
      client = await stronghold.createClient(CLIENT_NAME);
      await stronghold.save();
    }

    return { stronghold, store: client.getStore() };
  })().catch((error) => {
    vaultPromise = null;
    throw error;
  });
  return vaultPromise;
}

function encode(value: string) {
  return Array.from(new TextEncoder().encode(value));
}

function decode(value: number[]) {
  return new TextDecoder().decode(new Uint8Array(value));
}

export const nativeSecureSessionStorage = isNativeMobileRuntime()
  ? {
      async getItem(key: string) {
        try {
          const { store } = await openVault();
          return decode(await store.get(key));
        } catch (error) {
          if (String((error as Error)?.message ?? error).toLowerCase().includes("record")) return null;
          throw error;
        }
      },
      async setItem(key: string, value: string) {
        const { stronghold, store } = await openVault();
        await store.insert(key, encode(value));
        await stronghold.save();
      },
      async removeItem(key: string) {
        const { stronghold, store } = await openVault();
        try {
          await store.remove(key);
        } catch (error) {
          if (!String((error as Error)?.message ?? error).toLowerCase().includes("record")) throw error;
        }
        await stronghold.save();
      },
    }
  : undefined;
