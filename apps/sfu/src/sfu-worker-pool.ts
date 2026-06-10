import * as mediasoup from "mediasoup";
type Worker = mediasoup.types.Worker;

export interface WorkerPoolDeps {
  rtcMinPort: number;
  rtcMaxPort: number;
}

export interface WorkerPool {
  workers: Worker[];
  getNextWorker(): Worker;
  spawn(): Promise<void>;
  spawnAll(count: number): Promise<void>;
  getAliveCount(): number;
}

const MAX_RESPAWN_ATTEMPTS = 8;
const RESPAWN_BASE_DELAY_MS = 500;
const RESPAWN_MAX_DELAY_MS = 30_000;

export function createWorkerPool(
  deps: WorkerPoolDeps,
  onWorkerDied?: (deadWorker: Worker) => void
): WorkerPool {
  const workers: Worker[] = [];
  let workerIndex = 0;

  async function spawn(): Promise<void> {
    const worker = await mediasoup.createWorker({
      logLevel: "warn",
      rtcMinPort: deps.rtcMinPort,
      rtcMaxPort: deps.rtcMaxPort,
    });
    worker.on("died", () => {
      console.error(
        `mediasoup worker ${worker.pid} died — removing from pool`
      );
      const idx = workers.indexOf(worker);
      if (idx !== -1) workers.splice(idx, 1);
      onWorkerDied?.(worker);
      if (workers.length === 0) {
        console.error(
          "[sfu] all mediasoup workers are dead — new calls will fail until respawn"
        );
      }
      void respawnWithBackoff(1);
    });
    workers.push(worker);
  }

  async function spawnAll(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await spawn();
    }
  }

  function getNextWorker(): Worker {
    const worker = workers[workerIndex % workers.length];
    workerIndex++;
    if (!worker) throw new Error("No workers available");
    return worker;
  }

  function getAliveCount(): number {
    return workers.filter((w) => !w.closed).length;
  }

  async function respawnWithBackoff(attempt: number): Promise<void> {
    if (attempt > MAX_RESPAWN_ATTEMPTS) {
      console.error(
        `[sfu] mediasoup worker failed to respawn after ${MAX_RESPAWN_ATTEMPTS} attempts — giving up`
      );
      return;
    }
    const delay = Math.min(
      RESPAWN_BASE_DELAY_MS * Math.pow(2, attempt - 1),
      RESPAWN_MAX_DELAY_MS
    );
    console.info(
      `[sfu] respawn attempt ${attempt}/${MAX_RESPAWN_ATTEMPTS} in ${delay}ms`
    );
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
    try {
      await spawn();
      console.info(
        `[sfu] replacement worker spawned (attempt ${attempt})`
      );
    } catch (err) {
      console.error(`[sfu] respawn attempt ${attempt} failed:`, err);
      void respawnWithBackoff(attempt + 1);
    }
  }

  return {
    workers,
    getNextWorker,
    spawn,
    spawnAll,
    getAliveCount,
  };
}
