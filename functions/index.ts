import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import * as nodemailer from 'nodemailer';

import { buildEmailHtml, validateSendPayload } from './email';
import { loadRuntimeConfig, toPublicRuntimeConfig, validateRuntimeConfig, type RuntimeConfig } from './config';
import { resolvePrincipal, type Principal } from './auth';
import { connectMongo, getMongoHealth } from './mongo';
import { loadRuntimeSecrets } from './secrets';
import { logError, logInfo, logWarn } from './logging';

export const MAX_BODY_BYTES = 10 * 1024 * 1024;

export type ParsedBody =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

export const parseRequestBody = (body: string): ParsedBody => {
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return { ok: false, error: 'Invalid JSON payload' };
  }
};

export interface ApplicationDependencies {
  config?: RuntimeConfig;
  /** Injected in tests or after the redsecrets bootstrap phase. */
  jwtSecret?: string;
  emailUser?: string;
  emailPass?: string;
}

interface RequestContext {
  requestId: string;
  principal: Principal | null;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function headerValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

async function sendEmail(
  to: string,
  name: string,
  source: string,
  img: string,
  credentials: { user: string; pass: string },
): Promise<void> {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: credentials,
  });
  await new Promise<void>((resolve, reject) => {
    transporter.sendMail(
      {
        from: credentials.user,
        to,
        subject: 'Your secret code',
        html: buildEmailHtml({ name, source, img }),
      },
      (error, info) => {
        if (error) {
          logError('Email delivery failed', { error: error.message });
          reject(error);
        } else {
          logInfo('Email delivered', { response: info?.response || 'accepted' });
          resolve();
        }
      },
    );
  });
}

async function respondHealth(res: ServerResponse, config: RuntimeConfig): Promise<void> {
  const mongo = await getMongoHealth(config);
  const configErrors = validateRuntimeConfig(config);
  const healthy = configErrors.length === 0 && mongo.connected;
  json(res, healthy ? 200 : 503, {
    status: healthy ? 'healthy' : 'unhealthy',
    service: config.serviceName,
    channel: config.channel,
    uptimeSeconds: Math.round(process.uptime()),
    config: { valid: configErrors.length === 0, errors: configErrors },
    mongo,
  });
}

function authenticate(req: IncomingMessage, config: RuntimeConfig, jwtSecret?: string):
  | { ok: true; principal: Principal }
  | { ok: false; status: 401 | 503; error: string } {
  const result = resolvePrincipal(req.headers, {
    jwtSecret: jwtSecret || config.jwtSecret,
    cookieName: config.cookieName,
  });
  if (!result.configured) return { ok: false, status: 503, error: 'Authentication is not configured' };
  if (!result.principal) return { ok: false, status: 401, error: 'Not authenticated' };
  return { ok: true, principal: result.principal };
}

export function createApplicationServer(dependencies: ApplicationDependencies = {}): Server {
  const config = dependencies.config || loadRuntimeConfig();
  const jwtSecret = dependencies.jwtSecret || config.jwtSecret;

  return createServer((req, res) => {
    const requestId = headerValue(req.headers['x-request-id']) || randomUUID();
    const method = (req.method || 'GET').toUpperCase();
    const pathname = new URL(req.url || '/', 'http://redbook.internal').pathname;

    res.setHeader('Access-Control-Allow-Origin', config.publicUrl);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-Id');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('X-Request-Id', requestId);

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const context: RequestContext = { requestId, principal: null };
    logInfo('HTTP request', { requestId, method, pathname });

    req.on('error', (error) => logWarn('HTTP request stream failed', { requestId, error: error.message }));

    let body = '';
    let bodyBytes = 0;
    let rejected = false;
    const decoder = new StringDecoder('utf8');

    req.on('data', (chunk: Buffer | string) => {
      if (rejected) return;
      bodyBytes += Buffer.byteLength(chunk);
      if (bodyBytes > MAX_BODY_BYTES) {
        rejected = true;
        json(res, 413, { error: 'Payload too large' });
        req.destroy();
        return;
      }
      body += decoder.write(chunk);
    });

    req.on('end', async () => {
      if (rejected) return;
      decoder.end();

      try {
        if (pathname === '/health' || pathname === '/healthz' || pathname === '/ready') {
          await respondHealth(res, config);
          return;
        }

        if ((pathname === '/config' || pathname === '/api/config') && method === 'GET') {
          json(res, 200, toPublicRuntimeConfig(config, Boolean(jwtSecret)));
          return;
        }

        // The legacy lead form remains intentionally public. New CRM API paths
        // below /api are authenticated by default, so sibling routes cannot
        // accidentally ship without the session boundary.
        if (pathname === '/send' && method === 'POST') {
          const parsedBodyResult = parseRequestBody(body);
          if (!parsedBodyResult.ok) {
            json(res, 400, { error: parsedBodyResult.error });
            return;
          }
          const validation = validateSendPayload(parsedBodyResult.value);
          if (!validation.ok) {
            json(res, 400, { error: validation.error });
            return;
          }
          const { email, name, source, img } = validation.value;
          if (!dependencies.emailUser || !dependencies.emailPass) {
            json(res, 503, { error: 'Email automation is not configured' });
            return;
          }
          await sendEmail(email, name, source, img, {
            user: dependencies.emailUser,
            pass: dependencies.emailPass,
          });
          json(res, 200, { message: 'Email details logged successfully' });
          return;
        }

        if (pathname.startsWith('/api/')) {
          const auth = authenticate(req, config, jwtSecret);
          if (!auth.ok) {
            logWarn('Protected request rejected', { requestId, method, pathname, status: auth.status });
            json(res, auth.status, { error: auth.error });
            return;
          }
          context.principal = auth.principal;
          if (pathname === '/api/me' && method === 'GET') {
            // Return only the verified principal. Never pass tokens or raw
            // request headers to downstream CRM handlers.
            json(res, 200, { principal: context.principal });
            return;
          }
        }

        json(res, 404, { error: 'Not Found' });
      } catch (error) {
        logError('Unhandled HTTP request failure', {
          requestId,
          method,
          pathname,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        json(res, 500, { error: 'Internal Server Error', requestId });
      }
    });
  });
}

/**
 * Production/beta bootstrap: connect app Mongo, resolve credentials through
 * redsecrets, then expose the server with a fully configured auth verifier.
 */
export async function startConfiguredServer(config = loadRuntimeConfig()): Promise<Server> {
  const db = await connectMongo(config);
  const secrets = await loadRuntimeSecrets(db, config);
  const runtimeServer = createApplicationServer({
    config,
    jwtSecret: secrets.jwtSecret,
    emailUser: secrets.emailUser,
    emailPass: secrets.emailPass,
  });
  await new Promise<void>((resolve) => runtimeServer.listen(config.port, resolve));
  logInfo('redbook functions service started', {
    channel: config.channel,
    port: config.port,
    publicUrl: config.publicUrl,
  });
  return runtimeServer;
}

// Existing tests import this server directly. Production uses the configured
// bootstrap above, which prevents a server from starting without Mongo and the
// redsecrets-backed JWT secret.
export const server = createApplicationServer();

if (process.env.NODE_ENV !== 'test') {
  void startConfiguredServer().catch((error) => {
    logError('redbook functions startup failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    process.exitCode = 1;
  });
}
