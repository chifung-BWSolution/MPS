import {
  cpSync,
  createReadStream,
  existsSync,
  mkdirSync,
  statSync,
} from 'fs';
import { join, normalize, resolve } from 'path';
import type { Plugin } from 'vite';

const URL_PREFIX = '/development_plan';

function resolveSafePath(root: string, requestPath: string): string | null {
  const decoded = decodeURIComponent(requestPath.split('?')[0] ?? '');
  const filePath = normalize(join(root, decoded));
  if (!filePath.startsWith(normalize(root))) {
    return null;
  }
  return filePath;
}

function contentType(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

/** 將 docs/development_plan 靜態發佈到 /development_plan/ */
export function developmentPlanStatic(rootDir: string): Plugin {
  const docsRoot = resolve(rootDir, 'docs/development_plan');

  return {
    name: 'development-plan-static',
    configureServer(server) {
      server.middlewares.use(URL_PREFIX, (req, res, next) => {
        if (!req.url || req.method !== 'GET') {
          next();
          return;
        }

        const relativePath = req.url === '/' ? '/index.html' : req.url;
        const filePath = resolveSafePath(docsRoot, relativePath);

        if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
          next();
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', contentType(filePath));
        createReadStream(filePath).pipe(res);
      });
    },
    closeBundle() {
      const outDir = resolve(rootDir, 'dist/development_plan');
      mkdirSync(outDir, { recursive: true });
      if (existsSync(docsRoot)) {
        cpSync(docsRoot, outDir, { recursive: true });
      }
    },
  };
}
