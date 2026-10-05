import { execSync, spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import net from "net";
import os from "os";

const SOCKS_PORT = Number(process.env.TOR_SOCKS_PORT || 9050);
const SOCKS_HOST = process.env.TOR_SOCKS_HOST || "127.0.0.1";

export const TOR_SOCKS = `socks5://${SOCKS_HOST}:${SOCKS_PORT}`;

export function isServerless(): boolean {
  return (
    process.env.VERCEL === "1" ||
    !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
    !!process.env.LAMBDA_TASK_ROOT
  );
}

function portOpen(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const done = (ok: boolean) => {
      try { sock.destroy(); } catch {}
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
    try { sock.connect(port, host); } catch { done(false); }
  });
}

/* ------------------------------------------------------------------ */
/*  Find or auto-install the tor binary                                */
/* ------------------------------------------------------------------ */

import path from "path";

const KNOWN_PATHS = [
  process.env.TOR_BINARY,
  "/usr/sbin/tor",
  "/usr/bin/tor",
  "/usr/local/bin/tor",
  "/opt/homebrew/bin/tor",
  path.join(os.homedir(), ".mirage-tor", "tor", "tor.exe"),
  path.join(os.homedir(), ".mirage-tor", "tor", "tor"),
].filter(Boolean) as string[];

function findTorBinary(): string | null {
  for (const p of KNOWN_PATHS) {
    try { if (existsSync(p)) return p; } catch {}
  }
  return null;
}

/**
 * Downloads and extracts the Tor Expert Bundle directly.
 * Windows 10+ and macOS natively support `tar -xf` out of the box.
 */
async function downloadExpertBundle(platform: NodeJS.Platform, arch: string): Promise<string | null> {
  try {
    console.log("[tor] fetching latest tor version info...");
    const res = await fetch("https://dist.torproject.org/torbrowser/");
    const html = await res.text();
    // Match versions like 13.0.10, 14.0.0
    const matches = Array.from(html.matchAll(/href="(\d+\.\d+\.\d+)\/"/g)).map(m => m[1]);
    const latest = matches.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop();
    
    if (!latest) throw new Error("Could not parse latest version");

    let filename = "";
    if (platform === "win32") {
      filename = `tor-expert-bundle-windows-${arch === "arm64" ? "aarch64" : "x86_64"}-${latest}.tar.gz`;
    } else if (platform === "darwin") {
      filename = `tor-expert-bundle-macos-${arch === "arm64" ? "aarch64" : "x86_64"}-${latest}.tar.gz`;
    } else if (platform === "linux") {
      filename = `tor-expert-bundle-linux-${arch === "arm64" ? "aarch64" : "x86_64"}-${latest}.tar.gz`;
    } else {
      throw new Error(`Unsupported platform for expert bundle: ${platform}`);
    }

    const url = `https://dist.torproject.org/torbrowser/${latest}/${filename}`;
    console.log(`[tor] downloading from: ${url}`);
    
    const targetDir = path.join(os.homedir(), ".mirage-tor");
    mkdirSync(targetDir, { recursive: true });
    const tarballPath = path.join(targetDir, "bundle.tar.gz");

    // We can use built-in curl which exists on Windows 10+ and mac/linux
    execSync(`curl -s -L -o "${tarballPath}" "${url}"`, { stdio: "inherit" });
    console.log("[tor] extracting bundle...");
    
    // Windows 10+ has tar built-in
    execSync(`tar -xf "bundle.tar.gz"`, { cwd: targetDir, stdio: "inherit" });
    
    const bin = findTorBinary();
    if (bin) {
      console.log(`[tor] ✓ Expert Bundle installed at ${bin}`);
      return bin;
    }
    return null;
  } catch (err) {
    console.error("[tor] Expert Bundle download failed:", err);
    return null;
  }
}

/**
 * Attempt to install the `tor` package automatically.
 * Returns the binary path on success, null on failure.
 */
async function autoInstallTor(): Promise<string | null> {
  const platform = os.platform();
  console.log(`[tor] auto-installing tor on ${platform}…`);

  // On Windows, use the Expert Bundle directly via curl + tar
  if (platform === "win32") {
    return await downloadExpertBundle(platform, os.arch());
  }

  // On Linux/Mac, try package managers first
  const strategies: { cmd: string; sudoCmd?: string }[] = [];
  if (platform === "linux") {
    strategies.push(
      { cmd: "apt-get update -qq && apt-get install -y -qq tor", sudoCmd: "sudo -n apt-get update -qq && sudo -n apt-get install -y -qq tor" },
      { cmd: "yum install -y tor", sudoCmd: "sudo -n yum install -y tor" },
      { cmd: "apk add --no-cache tor", sudoCmd: "sudo -n apk add --no-cache tor" },
      { cmd: "pacman -Sy --noconfirm tor", sudoCmd: "sudo -n pacman -Sy --noconfirm tor" },
    );
  } else if (platform === "darwin") {
    strategies.push({ cmd: "brew install tor" });
  }

  for (const { cmd, sudoCmd } of strategies) {
    for (const attempt of [sudoCmd, cmd].filter(Boolean) as string[]) {
      try {
        console.log(`[tor] trying: ${attempt}`);
        execSync(attempt, { timeout: 120_000, stdio: "pipe", env: { ...process.env, DEBIAN_FRONTEND: "noninteractive" } });
        const bin = findTorBinary();
        if (bin) {
          console.log(`[tor] ✓ installed successfully at ${bin}`);
          return bin;
        }
      } catch {}
    }
  }

  // Fallback to Expert Bundle if package managers fail (or not available)
  return await downloadExpertBundle(platform, os.arch());
}

/* ------------------------------------------------------------------ */
/*  Ensure Tor daemon is running                                       */
/* ------------------------------------------------------------------ */

export function ensureTor(): Promise<boolean> {
  const g = globalThis as unknown as { __rb_tor?: Promise<boolean> };

  // If prior attempt resolved but port is now dead, clear the cache.
  if (g.__rb_tor) {
    const prior = g.__rb_tor;
    prior.then((was) => {
      if (was) {
        portOpen(SOCKS_HOST, SOCKS_PORT, 400).then((open) => {
          if (!open && g.__rb_tor === prior) delete g.__rb_tor;
        });
      }
    });
    // But if it previously FAILED (returned false), also clear it so we
    // retry — maybe tor was installed since last attempt.
    prior.then((was) => {
      if (!was && g.__rb_tor === prior) delete g.__rb_tor;
    });
    return g.__rb_tor;
  }

  g.__rb_tor = (async () => {
    if (isServerless()) return false;

    // 1. Already running?
    if (await portOpen(SOCKS_HOST, SOCKS_PORT)) {
      console.log("[tor] SOCKS5 port already open — reusing existing daemon");
      return true;
    }

    // 2. Find or install the binary
    let bin = findTorBinary();
    if (!bin) {
      bin = await autoInstallTor();
      if (!bin) return false;
    }

    // 3. Spawn the daemon
    try {
      mkdirSync("/tmp/rb-tor-data", { recursive: true, mode: 0o700 });

      // Try RunAsDaemon 1 first (forks to background cleanly)
      try {
        execSync(
          `${bin} --SocksPort ${SOCKS_HOST}:${SOCKS_PORT} --DataDirectory /tmp/rb-tor-data --RunAsDaemon 1 --AvoidDiskWrites 1`,
          { timeout: 10_000, stdio: "pipe" }
        );
        console.log("[tor] started daemon with RunAsDaemon 1");
      } catch {
        // Fallback: spawn detached
        const child = spawn(
          bin,
          [
            "--SocksPort", `${SOCKS_HOST}:${SOCKS_PORT}`,
            "--DataDirectory", "/tmp/rb-tor-data",
            "--RunAsDaemon", "0",
            "--AvoidDiskWrites", "1",
            "--Log", "notice stderr",
          ],
          { detached: true, stdio: "ignore" }
        );
        child.unref();
        console.log(`[tor] spawned daemon in background (pid ${child.pid})`);
      }
    } catch (err) {
      console.error("[tor] spawn failed:", err);
      return false;
    }

    // 4. Wait for bootstrap (up to 45 seconds)
    console.log("[tor] waiting for Tor circuit bootstrap…");
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await portOpen(SOCKS_HOST, SOCKS_PORT)) {
        console.log(`[tor] ✓ SOCKS5 circuit ready after ${(i * 0.5).toFixed(1)}s`);
        return true;
      }
    }

    console.error("[tor] ✗ timeout waiting for SOCKS5 port");
    return false;
  })();

  return g.__rb_tor;
}
