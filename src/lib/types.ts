// Shared types used by both server and client bundles.
// Keep this file free of any Node-only imports.

export type Engine = "chromium" | "firefox" | "webkit";

export type OSFamily = "windows" | "macos" | "linux" | "android" | "ios";

export type DeviceKind = "desktop" | "phone" | "tablet" | "privacy";

export interface DeviceProfile {
  id: string;
  label: string;
  os: OSFamily;
  osLabel: string;
  browserName: string;
  engine: Engine;
  kind: DeviceKind;
  width: number;
  height: number;
  dpr: number;
  touch: boolean;
  mobile: boolean;
  /** User-Agent template. {v} is replaced with the engine version. */
  ua: string;
  note?: string;
}

export interface ProfileAvailability {
  profile: DeviceProfile;
  available: boolean;
}

export interface SessionMeta {
  url: string;
  title: string;
  loading: boolean;
  canBack: boolean;
  canFwd: boolean;
}

export interface SessionOptions {
  profileId: string;
  url?: string;
  proxies?: string[];
}

export interface SessionInfo {
  id: string;
  profile: DeviceProfile;
  meta: SessionMeta;
  transport: "ws" | "http";
  wsUrl: string | null;
  createdAt: number;
}

export type NavAction = "goto" | "back" | "forward" | "reload";

export type InputEvent =
  | { t: "move"; x: number; y: number }
  | { t: "down"; x: number; y: number; button: number }
  | { t: "up"; x: number; y: number; button: number }
  | { t: "tap"; x: number; y: number }
  | { t: "swipe"; x0: number; y0: number; x1: number; y1: number }
  | { t: "wheel"; dx: number; dy: number; x: number; y: number }
  | {
      t: "key";
      key: string;
      ctrl?: boolean;
      shift?: boolean;
      alt?: boolean;
      meta?: boolean;
    }
  | { t: "type"; text: string };

export type ServerMessage =
  | { type: "meta"; meta: SessionMeta }
  | { type: "error"; message: string };
