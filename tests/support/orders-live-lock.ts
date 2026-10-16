import { spawn, type ChildProcess } from "node:child_process";

/**
 * Shared by the M5.5 and M5.6A live suites.
 * One session holds the lock for the whole suite, including the
 * out-of-order commit test's separate orders transaction.
 * Other sessions must not take this key.
 */
export const ORDERS_LIVE_LOCK_KEY = 561606;

function databaseEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PGPASSWORD: "postgres",
  };
}

/**
 * Holds pg_advisory_lock until release runs SQL unlock on that same session.
 * Disconnect alone is not used, because a dropped client can leave the
 * backend holding the lock.
 */
export async function holdOrdersLiveLock(): Promise<
  () => Promise<void>
> {
  const child: ChildProcess = spawn(
    "psql",
    [
      "-h",
      "127.0.0.1",
      "-p",
      "55322",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-t",
      "-A",
    ],
    {
      env: databaseEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });

  const exited = new Promise<number | null>((resolve) => {
    child.on("exit", (code) => {
      resolve(code);
    });
  });

  const waitFor = async (marker: string): Promise<void> => {
    const started = Date.now();

    while (!output.includes(marker)) {
      if (child.exitCode !== null) {
        throw new Error(
          `orders live lock session exited early: ${output}`,
        );
      }

      if (Date.now() - started > 120000) {
        throw new Error(
          `orders live lock did not reach ${marker}: ${output}`,
        );
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    }
  };

  try {
    child.stdin?.write(
      `select pg_catalog.pg_advisory_lock(${ORDERS_LIVE_LOCK_KEY});\n`,
    );
    child.stdin?.write("select 'held';\n");
    await waitFor("held");
  } catch (error) {
    child.kill("SIGKILL");
    await exited;
    throw error;
  }

  let released = false;

  return async () => {
    if (released) {
      return;
    }

    released = true;

    if (child.exitCode !== null) {
      return;
    }

    child.stdin?.write(
      `select pg_catalog.pg_advisory_unlock(${ORDERS_LIVE_LOCK_KEY});\n`,
    );
    child.stdin?.write("select 'released';\n");

    try {
      await waitFor("released");
    } finally {
      child.stdin?.end();
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 2000);
      await exited;
      clearTimeout(timer);
    }
  };
}
