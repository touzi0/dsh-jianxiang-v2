import type { IncomingMessage, ServerResponse } from 'node:http';
import { type SessionStore } from '../auth/token.js';
import { type StyleSnippetStore } from '../styles/style-snippets.js';
export declare function createRoutes(store: SessionStore, styleStore?: StyleSnippetStore): ({
    method: string;
    path: string;
    handler: (_req: IncomingMessage, res: ServerResponse) => Promise<void>;
} | {
    method: string;
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<ServerResponse<IncomingMessage> | undefined>;
} | {
    method?: undefined;
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
})[];
