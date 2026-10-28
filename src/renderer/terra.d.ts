import type { TerraApi } from "../main/preload.ts";

declare global {
  interface Window {
    terra: TerraApi;
  }
}
