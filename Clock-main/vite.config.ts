import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {execFile} from 'child_process';
import {createHash} from 'crypto';
import {existsSync} from 'fs';
import {createRequire} from 'module';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import type {IncomingMessage, ServerResponse} from 'http';

const require = createRequire(import.meta.url);
const WebSocket = require('ws') as any;

const scheduleScript = path.resolve(__dirname, 'scripts/xlsx_schedule.py');
const bundledPython = path.resolve(
  process.env.USERPROFILE ?? '',
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',
);
const pythonExecutable = existsSync(bundledPython) ? bundledPython : 'python';
const OBS_REQUEST_TIMEOUT_MS = 5000;
const OBS_RESTORE_TRANSITION_DELAY_MS = 2000;

type ObsRequestPayload = Record<string, unknown>;

type ObsRequestResponse = {
  requestId?: string;
  requestStatus?: {
    result?: boolean;
    code?: number;
    comment?: string;
  };
  responseData?: unknown;
};

type ObsSceneItemResponse = {
  sceneItemId: number;
  sourceName: string;
  sceneItemEnabled: boolean;
  inputKind?: string;
  isGroup?: boolean;
};

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

function createObsAuthentication(password: string, salt: string, challenge: string) {
  const secret = createHash('sha256')
    .update(password + salt)
    .digest('base64');

  return createHash('sha256')
    .update(secret + challenge)
    .digest('base64');
}

function createObsClient(obsWebSocketUrl: string, obsWebSocketPassword: string) {
  let socket: any = null;
  let connecting: Promise<void> | null = null;
  const pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  const closeSocket = () => {
    if (socket) {
      socket.removeAllListeners();
      socket.close();
      socket = null;
    }

    for (const request of pendingRequests.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error('OBS 连接已断开'));
    }
    pendingRequests.clear();
    connecting = null;
  };

  const connect = () => {
    if (socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (connecting) {
      return connecting;
    }

    connecting = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(obsWebSocketUrl);
      let settled = false;

      const fail = (error: unknown) => {
        if (!settled) {
          settled = true;
          connecting = null;
          reject(error);
        }
        closeSocket();
      };

      const identifyTimeout = setTimeout(() => {
        fail(new Error(`连接 OBS 超时，请确认 WebSocket 已启用：${obsWebSocketUrl}`));
      }, OBS_REQUEST_TIMEOUT_MS);

      ws.on('message', (raw: Buffer) => {
        let message: {op?: number; d?: Record<string, unknown>};
        try {
          message = JSON.parse(raw.toString('utf8'));
        } catch {
          return;
        }

        if (message.op === 0) {
          const authentication = message.d?.authentication as
            | {salt?: string; challenge?: string}
            | undefined;
          const identifyPayload: Record<string, unknown> = {rpcVersion: 1};

          if (authentication?.salt && authentication.challenge) {
            if (!obsWebSocketPassword) {
              fail(new Error('OBS WebSocket 需要密码，请在 .env 中设置 OBS_WS_PASSWORD'));
              return;
            }

            identifyPayload.authentication = createObsAuthentication(
              obsWebSocketPassword,
              authentication.salt,
              authentication.challenge,
            );
          }

          ws.send(JSON.stringify({op: 1, d: identifyPayload}));
          return;
        }

        if (message.op === 2) {
          clearTimeout(identifyTimeout);
          socket = ws;
          settled = true;
          resolve();
          return;
        }

        if (message.op === 7) {
          const data = message.d as ObsRequestResponse | undefined;
          const requestId = data?.requestId;
          if (!requestId) return;

          const pending = pendingRequests.get(requestId);
          if (!pending) return;

          pendingRequests.delete(requestId);
          clearTimeout(pending.timeout);

          if (data.requestStatus?.result) {
            pending.resolve(data.responseData ?? {});
            return;
          }

          pending.reject(
            new Error(data.requestStatus?.comment ?? `OBS 请求失败：${data.requestStatus?.code}`),
          );
        }
      });

      ws.on('close', closeSocket);
      ws.on('error', fail);
    });

    return connecting;
  };

  const request = async (requestType: string, requestData?: ObsRequestPayload) => {
    await connect();

    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error(`OBS 请求超时：${requestType}`));
      }, OBS_REQUEST_TIMEOUT_MS);

      pendingRequests.set(requestId, {resolve, reject, timeout});
      socket.send(
        JSON.stringify({
          op: 6,
          d: {
            requestId,
            requestType,
            requestData,
          },
        }),
      );
    });
  };

  return {request};
}

async function getObsSnapshot(obsClient: ReturnType<typeof createObsClient>) {
  const sceneData = await getObsSceneList(obsClient);
  const transitionData = await getObsTransitionList(obsClient);
  const currentTransition = await getObsCurrentTransition(obsClient);

  const scenes = await Promise.all(
    (sceneData.scenes ?? []).map(async (scene) => {
      const items = await getObsSceneItemsSafe(obsClient, scene.sceneName);

      return {
        name: scene.sceneName,
        index: scene.sceneIndex,
        items: items.map((item) => ({
          id: item.sceneItemId,
          name: item.sourceName,
          enabled: item.sceneItemEnabled,
          inputKind: item.inputKind,
          isGroup: item.isGroup,
        })),
      };
    }),
  );

  return {
    connected: true,
    currentScene: sceneData.currentProgramSceneName,
    currentTransition: currentTransition.transitionName ?? transitionData.currentSceneTransitionName,
    scenes,
    transitions: (transitionData.transitions ?? []).map((transition) => ({
      name: transition.transitionName,
      kind: transition.transitionKind,
      fixed: transition.transitionFixed,
    })),
  };
}

async function getObsSceneList(obsClient: ReturnType<typeof createObsClient>) {
  return (await obsClient.request('GetSceneList')) as {
    currentProgramSceneName?: string;
    scenes?: Array<{sceneName: string; sceneIndex?: number}>;
  };
}

async function getObsCurrentProgramSceneName(obsClient: ReturnType<typeof createObsClient>) {
  const sceneData = (await obsClient.request('GetCurrentProgramScene')) as {
    currentProgramSceneName?: string;
  };

  return sceneData.currentProgramSceneName;
}

async function getObsTransitionList(obsClient: ReturnType<typeof createObsClient>) {
  try {
    return (await obsClient.request('GetSceneTransitionList')) as {
      currentSceneTransitionName?: string;
      transitions?: Array<{
        transitionName: string;
        transitionKind?: string;
        transitionFixed?: boolean;
      }>;
    };
  } catch {
    try {
      return (await obsClient.request('GetTransitionList')) as {
        currentSceneTransitionName?: string;
        transitions?: Array<{
          transitionName: string;
          transitionKind?: string;
          transitionFixed?: boolean;
        }>;
      };
    } catch {
      return {transitions: []};
    }
  }
}

async function getObsCurrentTransition(obsClient: ReturnType<typeof createObsClient>) {
  try {
    return (await obsClient.request('GetCurrentSceneTransition')) as {
      transitionName?: string;
      transitionKind?: string;
    };
  } catch {
    return {};
  }
}

async function getObsSnapshotAfterSceneAction(
  obsClient: ReturnType<typeof createObsClient>,
  fallbackSceneName: string,
) {
  try {
    return await getObsSnapshot(obsClient);
  } catch {
    return {
      connected: true,
      currentScene: (await getObsCurrentProgramSceneName(obsClient)) ?? fallbackSceneName,
      currentTransition: undefined,
      scenes: [],
      transitions: [],
    };
  }
}

async function getObsSceneItems(
  obsClient: ReturnType<typeof createObsClient>,
  sceneName: string,
) {
  let itemData: {sceneItems?: ObsSceneItemResponse[]};
  try {
    itemData = (await obsClient.request('GetSceneItemList', {sceneName})) as {
      sceneItems?: ObsSceneItemResponse[];
    };
  } catch {
    try {
      itemData = (await obsClient.request('GetGroupSceneItemList', {sceneName})) as {
        sceneItems?: ObsSceneItemResponse[];
      };
    } catch {
      itemData = (await obsClient.request('GetGroupSceneItemList', {groupName: sceneName})) as {
        sceneItems?: ObsSceneItemResponse[];
      };
    }
  }

  return itemData.sceneItems ?? [];
}

async function getObsSceneItemsSafe(
  obsClient: ReturnType<typeof createObsClient>,
  sceneName: string,
) {
  try {
    return await getObsSceneItems(obsClient, sceneName);
  } catch {
    return [];
  }
}

async function setExclusiveObsSceneItems(
  obsClient: ReturnType<typeof createObsClient>,
  sceneName: string,
  visibleSourceNames: string[],
) {
  const visibleNames = new Set(visibleSourceNames);
  const items = await getObsSceneItems(obsClient, sceneName);

  if (items.length === 0) {
    throw new Error(`OBS 中未找到“${sceneName}”的素材项`);
  }

  const matchedNames = new Set<string>();
  await Promise.all(
    items.map((item) => {
      const shouldBeVisible = visibleNames.has(item.sourceName);
      if (shouldBeVisible) {
        matchedNames.add(item.sourceName);
      }

      if (item.sceneItemEnabled === shouldBeVisible) {
        return Promise.resolve();
      }

      return obsClient.request('SetSceneItemEnabled', {
        sceneName,
        sceneItemId: item.sceneItemId,
        sceneItemEnabled: shouldBeVisible,
      });
    }),
  );

  const missingNames = visibleSourceNames.filter((name) => !matchedNames.has(name));
  if (missingNames.length > 0) {
    throw new Error(`OBS “${sceneName}”中未找到素材：${missingNames.join('、')}`);
  }
}

async function setNamedObsSceneItemsEnabled(
  obsClient: ReturnType<typeof createObsClient>,
  sceneName: string,
  sourceNames: string[],
  sceneItemEnabled: boolean,
) {
  const targetNames = new Set(sourceNames);
  const items = await getObsSceneItems(obsClient, sceneName);

  if (items.length === 0) {
    throw new Error(`OBS 中未找到“${sceneName}”的素材项`);
  }

  const matchedNames = new Set<string>();
  await Promise.all(
    items
      .filter((item) => targetNames.has(item.sourceName))
      .map((item) => {
        matchedNames.add(item.sourceName);
        if (item.sceneItemEnabled === sceneItemEnabled) {
          return Promise.resolve();
        }

        return obsClient.request('SetSceneItemEnabled', {
          sceneName,
          sceneItemId: item.sceneItemId,
          sceneItemEnabled,
        });
      }),
  );

  const missingNames = sourceNames.filter((name) => !matchedNames.has(name));
  if (missingNames.length > 0) {
    throw new Error(`OBS “${sceneName}”中未找到素材：${missingNames.join('、')}`);
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function switchObsSceneWithTransition(
  obsClient: ReturnType<typeof createObsClient>,
  sceneName: string,
  transitionName: string,
  restoreTransitionName?: string,
  restoreDelayMs = OBS_RESTORE_TRANSITION_DELAY_MS,
) {
  await obsClient.request('SetCurrentSceneTransition', {transitionName});
  await obsClient.request('SetCurrentProgramScene', {sceneName});

  if (!restoreTransitionName) {
    return;
  }

  if (restoreDelayMs > 0) {
    await wait(restoreDelayMs);
  }

  await obsClient.request('SetCurrentSceneTransition', {
    transitionName: restoreTransitionName,
  });
}

function obsActionFromPath(pathname: string) {
  const match = pathname.match(/^\/api\/obs\/(.+)$/i);
  return match?.[1] ?? null;
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
  const obsClient = createObsClient(
    env.OBS_WS_URL || 'ws://127.0.0.1:4455',
    env.OBS_WS_PASSWORD || '',
  );

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
            const obsAction = obsActionFromPath(url.pathname);
            if (obsAction) {
              try {
                if (req.method === 'GET' && obsAction === 'state') {
                  const result = await getObsSnapshot(obsClient);
                  sendJson(res, 200, result);
                  return;
                }

                if (req.method === 'POST' && obsAction === 'scene') {
                  const body = (await readJsonBody(req)) as {sceneName?: string};
                  if (!body.sceneName) {
                    sendJson(res, 400, {error: '缺少 sceneName'});
                    return;
                  }

                  await obsClient.request('SetCurrentProgramScene', {
                    sceneName: body.sceneName,
                  });
                  sendJson(
                    res,
                    200,
                    await getObsSnapshotAfterSceneAction(obsClient, body.sceneName),
                  );
                  return;
                }

                if (req.method === 'POST' && obsAction === 'transition') {
                  const body = (await readJsonBody(req)) as {transitionName?: string};
                  if (!body.transitionName) {
                    sendJson(res, 400, {error: '缺少 transitionName'});
                    return;
                  }

                  await obsClient.request('SetCurrentSceneTransition', {
                    transitionName: body.transitionName,
                  });
                  sendJson(res, 200, await getObsSnapshot(obsClient));
                  return;
                }

                if (req.method === 'POST' && obsAction === 'scene-item') {
                  const body = (await readJsonBody(req)) as {
                    sceneName?: string;
                    sceneItemId?: number;
                    sceneItemEnabled?: boolean;
                  };
                  if (
                    !body.sceneName ||
                    typeof body.sceneItemId !== 'number' ||
                    typeof body.sceneItemEnabled !== 'boolean'
                  ) {
                    sendJson(res, 400, {
                      error: '缺少 sceneName、sceneItemId 或 sceneItemEnabled',
                    });
                    return;
                  }

                  await obsClient.request('SetSceneItemEnabled', {
                    sceneName: body.sceneName,
                    sceneItemId: body.sceneItemId,
                    sceneItemEnabled: body.sceneItemEnabled,
                  });
                  sendJson(res, 200, await getObsSnapshot(obsClient));
                  return;
                }

                if (req.method === 'POST' && obsAction === 'exclusive-scene-items') {
                  const body = (await readJsonBody(req)) as {
                    sceneName?: string;
                    visibleSourceNames?: string[];
                  };
                  if (
                    !body.sceneName ||
                    !Array.isArray(body.visibleSourceNames) ||
                    body.visibleSourceNames.some((name) => typeof name !== 'string')
                  ) {
                    sendJson(res, 400, {
                      error: '缺少 sceneName 或 visibleSourceNames',
                    });
                    return;
                  }

                  await setExclusiveObsSceneItems(
                    obsClient,
                    body.sceneName,
                    body.visibleSourceNames,
                  );
                  sendJson(res, 200, await getObsSnapshot(obsClient));
                  return;
                }

                if (req.method === 'POST' && obsAction === 'named-scene-items') {
                  const body = (await readJsonBody(req)) as {
                    sceneName?: string;
                    sourceNames?: string[];
                    sceneItemEnabled?: boolean;
                  };
                  if (
                    !body.sceneName ||
                    !Array.isArray(body.sourceNames) ||
                    body.sourceNames.some((name) => typeof name !== 'string') ||
                    typeof body.sceneItemEnabled !== 'boolean'
                  ) {
                    sendJson(res, 400, {
                      error: '缺少 sceneName、sourceNames 或 sceneItemEnabled',
                    });
                    return;
                  }

                  await setNamedObsSceneItemsEnabled(
                    obsClient,
                    body.sceneName,
                    body.sourceNames,
                    body.sceneItemEnabled,
                  );
                  sendJson(res, 200, await getObsSnapshot(obsClient));
                  return;
                }

                if (req.method === 'POST' && obsAction === 'scene-with-transition') {
                  const body = (await readJsonBody(req)) as {
                    sceneName?: string;
                    transitionName?: string;
                    restoreTransitionName?: string;
                    restoreDelayMs?: number;
                  };
                  if (!body.sceneName || !body.transitionName) {
                    sendJson(res, 400, {
                      error: '缺少 sceneName 或 transitionName',
                    });
                    return;
                  }

                  await switchObsSceneWithTransition(
                    obsClient,
                    body.sceneName,
                    body.transitionName,
                    body.restoreTransitionName,
                    typeof body.restoreDelayMs === 'number'
                      ? body.restoreDelayMs
                      : OBS_RESTORE_TRANSITION_DELAY_MS,
                  );
                  sendJson(
                    res,
                    200,
                    await getObsSnapshotAfterSceneAction(obsClient, body.sceneName),
                  );
                  return;
                }

                sendJson(res, 404, {error: 'OBS API 动作不存在'});
              } catch (error) {
                sendJson(res, 500, {
                  connected: false,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
              return;
            }

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

              if (req.method === 'POST' && route.action === 'score-images') {
                const body = await readJsonBody(req);
                const result = await runScheduleScript('generate-score-images', route.group, body);
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
