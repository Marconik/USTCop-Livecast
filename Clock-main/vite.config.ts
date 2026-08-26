import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {execFile} from 'child_process';
import {existsSync} from 'fs';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import type {IncomingMessage, ServerResponse} from 'http';

const scheduleScript = path.resolve(__dirname, 'scripts/xlsx_schedule.py');
const bundledPython = path.resolve(
  process.env.USERPROFILE ?? '',
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',
);
const pythonExecutable = existsSync(bundledPython) ? bundledPython : 'python';

function readJsonBody(req: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function runScheduleScript(command: string, group: string, payload?: unknown) {
  return new Promise<unknown>((resolve, reject) => {
    const child = execFile(
      pythonExecutable,
      [scheduleScript, command, '--group', group],
      {encoding: 'utf8', env: {...process.env, PYTHONIOENCODING: 'utf-8'}},
      (error, stdout, stderr) => {
        const output = stdout.trim() || stderr.trim();
        let parsed: unknown = {};
        if (output) {
          try {
            parsed = JSON.parse(output);
          } catch {
            parsed = {error: output};
          }
        }

        if (error) {
          reject(parsed);
          return;
        }

        resolve(parsed);
      },
    );

    if (payload !== undefined) {
      child.stdin?.write(JSON.stringify(payload));
    }
    child.stdin?.end();
  });
}

function groupFromPath(pathname: string) {
  const match = pathname.match(/^\/api\/groups\/([A-E])\/(.+)$/i);
  if (!match) {
    return null;
  }
  return {
    group: match[1].toUpperCase(),
    action: match[2],
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'ustcop-schedule-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (!req.url?.startsWith('/api/')) {
              next();
              return;
            }

            const url = new URL(req.url, 'http://localhost');
            const route = groupFromPath(url.pathname);
            if (!route) {
              sendJson(res, 404, {error: 'API 路径不存在'});
              return;
            }

            try {
              if (req.method === 'GET' && route.action === 'schedule') {
                const result = await runScheduleScript('load', route.group);
                sendJson(res, 200, result);
                return;
              }

              if (req.method === 'POST' && route.action === 'round') {
                const body = await readJsonBody(req);
                const result = await runScheduleScript('write-round', route.group, body);
                sendJson(res, 200, result);
                return;
              }

              if (req.method === 'POST' && route.action === 'advance') {
                const body = await readJsonBody(req);
                const result = await runScheduleScript('write-advancement', route.group, body);
                sendJson(res, 200, result);
                return;
              }

              sendJson(res, 404, {error: 'API 动作不存在'});
            } catch (error) {
              const payload =
                typeof error === 'object' && error !== null ? error : {error: String(error)};
              sendJson(res, 500, payload);
            }
          });
        },
      },
    ],
  };
});
