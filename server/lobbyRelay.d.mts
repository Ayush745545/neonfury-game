import type { IncomingMessage } from 'node:http';
import type { Server } from 'node:http';

/** Room relay shared by the LAN host (server/host.mjs) and the
    online Vercel Function (api/lobby.mjs). */
export interface LobbyOptions {
  path?: string;
  publicUrl?: (req: IncomingMessage) => string;
}

export function attachLobby(server: Server, options?: LobbyOptions): unknown;
