import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  extractBearerToken,
  jsonResponse,
  loadFramerConnection,
  supabaseAdmin,
} from "../_shared/framer-mcp.ts";
import {
  type EdgeDiscoveredPage,
  type EdgeProjectAnalysis,
  analyzeReaddyFileMap,
  assembleReaddyPageCode,
  extractLocalSectionImports,
} from "../_shared/readdy-analyzer.ts";

type ParsedRepoUrl = {
  owner: string;
  repo: string;
  branchHint?: string;
  pathHint?: string;
};

function isReaddyRepoName(name: string): boolean {
  return /readdy/i.test(String(name || ""));
}

function parseGitHubRepoUrl(raw: string): ParsedRepoUrl | null {
  const trimmed = String(raw || "").trim().replace(/\.git$/i, "");
  if (!trimmed) return null;

  // Support owner/repo shorthand
  if (!trimmed.includes("://") && /^[\w.-]+\/[\w.-]+$/.test(trimmed)) {
    const [owner, repo] = trimmed.split("/");
    return { owner, repo };
  }

  try {
    const u = new URL(trimmed);
    if (!/github\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, "");
    let branchHint: string | undefined;
    let pathHint: string | undefined;
    if ((parts[2] === "tree" || parts[2] === "blob") && parts[3]) {
      branchHint = parts[3];
      if (parts.length > 4) {
        pathHint = parts.slice(4).join("/");
      }
    }
    return { owner, repo, branchHint, pathHint };
  } catch {
    return null;
  }
}

async function resolveGitHubToken(requestToken?: string): Promise<string> {
  const inline = String(requestToken || "").trim();
  if (inline) return inline;

  const supabase = supabaseAdmin();
  const conn = await loadFramerConnection(supabase);
  if (conn?.github_token && conn.github_token.trim()) {
    return conn.github_token.trim();
  }

  return (Deno.env.get("GITHUB_TOKEN") || "").trim();
}

function githubHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "MPS-Readdy-Framer-Workbench",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function decodeBase64Utf8(base64Content: string): string {
  const clean = base64Content.replace(/\s+/g, "");
  const binStr = atob(clean);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

function scoreComponentPath(path: string): number {
  const lower = path.toLowerCase();
  if (lower.includes("landingpage")) return 0;
  if (lower.startsWith("src/pages/")) return 1;
  if (lower.startsWith("app/") && lower.endsWith("page.tsx")) return 2;
  if (lower === "src/app.tsx" || lower === "src/app.jsx") return 3;
  if (lower.startsWith("src/components/")) return 4;
  if (lower.endsWith(".html")) return 6;
  return 5;
}

function isCandidateComponent(path: string): boolean {
  const lower = path.toLowerCase();
  if (
    lower.includes("node_modules/") ||
    lower.startsWith("dist/") ||
    lower.startsWith("build/") ||
    lower.endsWith(".d.ts") ||
    lower.endsWith("vite-env.d.ts") ||
    lower.endsWith("/main.tsx") ||
    lower === "main.tsx"
  ) {
    return false;
  }
  return /\.(tsx|jsx|html)$/i.test(lower);
}

function formatGitHubError(status: number, hasToken: boolean, detail: string): string {
  if (status === 401) {
    return "GitHub Token 無效或已過期，請在「Private / Token 設定」更新有效的 PAT。";
  }
  if (status === 403) {
    return hasToken
      ? `GitHub API 拒絕存取（403），請確認 PAT 具備該私有倉庫的 Contents Read 權限。${detail}`
      : `GitHub API 速率限制或私有倉庫拒絕存取（403），請先設定團隊 GitHub PAT。`;
  }
  if (status === 404) {
    return hasToken
      ? "找不到該倉庫、分支或檔案（404），請確認路徑與 Token 倉庫授權範圍。"
      : "找不到倉庫（404）。若為 Private 私有倉庫，請先點擊「Private / Token 設定」填入 GitHub PAT。";
  }
  return `GitHub API 錯誤 (${status})：${detail}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!extractBearerToken(req)) {
    return jsonResponse({ error: "未登入或缺少授權標頭" }, 401);
  }

  try {
    const body = (await req.json()) as {
      action?: string;
      repo_url?: string;
      branch?: string;
      file_path?: string;
      github_token?: string;
      page?: EdgeDiscoveredPage;
      shared_files?: EdgeProjectAnalysis["sharedFiles"];
      all_paths?: string[];
    };

    const action = String(body.action || "inspect");

    if (action === "list_repos") {
      const token = await resolveGitHubToken(body.github_token);
      if (!token) {
        return jsonResponse({
          configured: false,
          repos: [],
          message: "尚未設定 GitHub Token，請先點擊右上角「Private Token」設定團隊 PAT。",
        });
      }

      const headers = githubHeaders(token);
      type GitHubRawRepo = {
        id: number;
        name?: string;
        full_name?: string;
        owner?: { login?: string };
        html_url?: string;
        default_branch?: string;
        private?: boolean;
        updated_at?: string;
        pushed_at?: string | null;
        description?: string | null;
      };

      const seen = new Map<number, {
        id: number;
        name: string;
        full_name: string;
        owner: string;
        html_url: string;
        default_branch: string;
        is_private: boolean;
        updated_at: string;
        pushed_at: string | null;
        description: string | null;
      }>();

      for (let page = 1; page <= 5; page++) {
        const res = await fetch(
          `https://api.github.com/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&direction=desc&per_page=100&page=${page}`,
          { headers },
        );
        if (!res.ok) {
          if (page === 1) {
            const errText = await res.text().catch(() => "");
            return jsonResponse({ error: formatGitHubError(res.status, true, errText) }, 400);
          }
          break;
        }
        const items = (await res.json()) as GitHubRawRepo[];
        if (!Array.isArray(items) || items.length === 0) break;

        for (const item of items) {
          const repoName = String(item.name || "");
          if (!isReaddyRepoName(repoName)) continue;
          const id = Number(item.id);
          if (!seen.has(id)) {
            const fullName = String(item.full_name || "");
            seen.set(id, {
              id,
              name: repoName,
              full_name: fullName,
              owner: String(item.owner?.login || ""),
              html_url: String(item.html_url || `https://github.com/${fullName}`),
              default_branch: String(item.default_branch || "main"),
              is_private: Boolean(item.private),
              updated_at: String(item.updated_at || ""),
              pushed_at: item.pushed_at ? String(item.pushed_at) : null,
              description: item.description ? String(item.description) : null,
            });
          }
        }

        if (items.length < 100) break;
      }

      const repos = Array.from(seen.values()).sort((a, b) => {
        const ta = Date.parse(a.pushed_at || a.updated_at || "") || 0;
        const tb = Date.parse(b.pushed_at || b.updated_at || "") || 0;
        return tb - ta;
      });

      return jsonResponse({ configured: true, repos });
    }

    const parsed = parseGitHubRepoUrl(body.repo_url || "");
    if (!parsed) {
      return jsonResponse(
        { error: "GitHub 倉庫地址格式不正確，請輸入 https://github.com/owner/repo 或 owner/repo" },
        400,
      );
    }

    const token = await resolveGitHubToken(body.github_token);
    const headers = githubHeaders(token);
    const { owner, repo } = parsed;

    const fetchRepoTextFile = async (filePath: string, branchName: string): Promise<string | null> => {
      const clean = filePath.trim().replace(/^\/+/, "");
      if (!clean) return null;
      const encoded = clean.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${encoded}?ref=${encodeURIComponent(branchName)}`,
        { headers },
      );
      if (!res.ok) return null;
      const json = (await res.json().catch(() => ({}))) as {
        content?: string;
        encoding?: string;
      };
      if (!json.content) return null;
      return json.encoding === "base64" ? decodeBase64Utf8(json.content) : String(json.content);
    };

    // 1. Inspect repo metadata, branches, and component file tree
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!repoRes.ok) {
      const errText = await repoRes.text().catch(() => "");
      return jsonResponse({ error: formatGitHubError(repoRes.status, Boolean(token), errText) }, 400);
    }
    const repoJson = (await repoRes.json()) as {
      full_name: string;
      private: boolean;
      default_branch: string;
    };

    const activeBranch = String(body.branch || parsed.branchHint || repoJson.default_branch || "main");

    if (action === "list_branches") {
      const branchesRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/branches?per_page=30`,
        { headers },
      );
      const branches: string[] = [];
      if (branchesRes.ok) {
        const list = (await branchesRes.json()) as Array<{ name?: string }>;
        for (const item of list) {
          if (item.name) branches.push(item.name);
        }
      }
      const defBranch = repoJson.default_branch || "main";
      if (!branches.includes(defBranch)) {
        branches.unshift(defBranch);
      }
      return jsonResponse({
        full_name: repoJson.full_name,
        default_branch: defBranch,
        branches,
      });
    }

    if (action === "analyze_project") {
      const [branchesRes, treeRes, commitRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=30`, { headers }),
        fetch(
          `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(activeBranch)}?recursive=1`,
          { headers },
        ),
        fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(activeBranch)}`, { headers }),
      ]);

      const branches: string[] = [];
      if (branchesRes.ok) {
        const list = (await branchesRes.json()) as Array<{ name?: string }>;
        for (const item of list) {
          if (item.name) branches.push(item.name);
        }
      }
      if (!branches.includes(activeBranch)) branches.unshift(activeBranch);

      if (!treeRes.ok) {
        const errText = await treeRes.text().catch(() => "");
        return jsonResponse(
          { error: formatGitHubError(treeRes.status, Boolean(token), errText) },
          400,
        );
      }

      const treeJson = (await treeRes.json()) as {
        tree?: Array<{ path?: string; type?: string }>;
      };
      const allBlobs = (treeJson.tree || [])
        .filter((item) => item.type === "blob" && item.path)
        .map((item) => String(item.path))
        .filter((p) => !p.startsWith("node_modules/") && !p.startsWith("dist/"));

      const keyPaths = allBlobs.filter(
        (p) =>
          p === "package.json" ||
          p === "index.html" ||
          /^tailwind\.config\.(ts|js|mjs|cjs)$/i.test(p) ||
          /^src\/(index|App)\.css$/i.test(p) ||
          /^src\/router\/(config|index)\.(tsx|ts)$/i.test(p) ||
          /^src\/App\.tsx$/i.test(p) ||
          /pageSeoData\.(ts|tsx)$/i.test(p) ||
          /articles\/routes-(zh|en)\.(tsx|ts)$/i.test(p),
      );

      const fileMap: Record<string, string> = {};
      await Promise.all(
        keyPaths.slice(0, 20).map(async (p) => {
          const text = await fetchRepoTextFile(p, activeBranch);
          if (text !== null) fileMap[p] = text;
        }),
      );

      let commitSha = "";
      if (commitRes.ok) {
        const commitJson = (await commitRes.json().catch(() => ({}))) as { sha?: string };
        commitSha = commitJson.sha || "";
      }

      const analysis = analyzeReaddyFileMap(fileMap, {
        sourceType: "github",
        projectName: repo,
        allTreePaths: allBlobs,
        githubMeta: {
          owner,
          repo,
          full_name: repoJson.full_name,
          branch: activeBranch,
          default_branch: repoJson.default_branch,
          branches,
          is_private: Boolean(repoJson.private),
        },
      });

      return jsonResponse({
        analysis,
        commit_sha: commitSha,
        all_paths: allBlobs,
      });
    }

    if (action === "fetch_page_bundle") {
      const page = body.page;
      if (!page) {
        return jsonResponse({ error: "缺少 page 參數" }, 400);
      }
      const sharedFiles = body.shared_files || {};
      const allPathsList = Array.isArray(body.all_paths) ? body.all_paths : [];
      const allPaths = new Set<string>(allPathsList);

      const fileMap: Record<string, string> = {};
      const toFetch = new Set<string>();
      if (page.sourceFile && page.sourceFile.includes("/")) toFetch.add(page.sourceFile);
      if (sharedFiles.navbar) toFetch.add(sharedFiles.navbar);
      if (sharedFiles.footer) toFetch.add(sharedFiles.footer);

      await Promise.all(
        Array.from(toFetch).map(async (p) => {
          const content = await fetchRepoTextFile(p, activeBranch);
          if (content !== null) fileMap[p] = content;
        }),
      );

      if (page.articleSlug) {
        const articleFiles = allPathsList.filter((p) =>
          /articles\/(zh|en)-\d+\.ts$/i.test(p),
        );
        const preferredPrefix = page.articleLang === "en" ? "en-" : "zh-";
        const orderedArticleFiles = [
          ...articleFiles.filter((p) => p.includes(preferredPrefix)),
          ...articleFiles.filter((p) => !p.includes(preferredPrefix)),
        ];
        for (const af of orderedArticleFiles) {
          const content = await fetchRepoTextFile(af, activeBranch);
          if (content !== null) {
            fileMap[af] = content;
            if (content.includes(page.articleSlug)) break;
          }
        }
      } else if (page.sourceFile && fileMap[page.sourceFile]) {
        const pageCode = fileMap[page.sourceFile];
        if (allPaths.size === 0) {
          // Discover tree if caller didn't pass all_paths
          const treeRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(activeBranch)}?recursive=1`,
            { headers },
          );
          if (treeRes.ok) {
            const tj = (await treeRes.json()) as { tree?: Array<{ path?: string; type?: string }> };
            for (const item of tj.tree || []) {
              if (item.type === "blob" && item.path) allPaths.add(item.path);
            }
          }
        }
        const deps = extractLocalSectionImports(pageCode, page.sourceFile, allPaths)
          .map((d) => d.resolvedPath)
          .filter((p) => !fileMap[p])
          .slice(0, 16);

        await Promise.all(
          deps.map(async (p) => {
            const content = await fetchRepoTextFile(p, activeBranch);
            if (content !== null) fileMap[p] = content;
          }),
        );
      }

      const assembled = assembleReaddyPageCode(page, fileMap, sharedFiles);
      const commitRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(activeBranch)}`,
        { headers },
      );
      let commitSha = "";
      if (commitRes.ok) {
        const cj = (await commitRes.json().catch(() => ({}))) as { sha?: string };
        commitSha = cj.sha || "";
      }

      return jsonResponse({
        code: assembled.code,
        included_files: assembled.includedFiles,
        summary: assembled.summary,
        commit_sha: commitSha,
        repo_meta: {
          repo: `${owner}/${repo}`,
          branch: activeBranch,
          file_path: page.sourceFile,
          commit_sha: commitSha,
          is_private: Boolean(repoJson.private),
        },
      });
    }

    if (action === "inspect") {
      const [branchesRes, treeRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=30`, { headers }),
        fetch(
          `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(activeBranch)}?recursive=1`,
          { headers },
        ),
      ]);

      const branches: string[] = [];
      if (branchesRes.ok) {
        const list = (await branchesRes.json()) as Array<{ name?: string }>;
        for (const item of list) {
          if (item.name) branches.push(item.name);
        }
      }
      if (!branches.includes(activeBranch)) {
        branches.unshift(activeBranch);
      }

      if (!treeRes.ok) {
        const errText = await treeRes.text().catch(() => "");
        return jsonResponse(
          { error: formatGitHubError(treeRes.status, Boolean(token), errText) },
          400,
        );
      }

      const treeJson = (await treeRes.json()) as {
        sha?: string;
        tree?: Array<{ path?: string; type?: string }>;
      };
      const allBlobs = (treeJson.tree || [])
        .filter((item) => item.type === "blob" && item.path)
        .map((item) => String(item.path));

      const files = allBlobs
        .filter(isCandidateComponent)
        .sort((a, b) => scoreComponentPath(a) - scoreComponentPath(b) || a.localeCompare(b));

      const tailwindConfigPath =
        allBlobs.find((p) => /^tailwind\.config\.(ts|js|mjs|cjs)$/i.test(p)) || null;

      return jsonResponse({
        owner,
        repo,
        full_name: repoJson.full_name,
        is_private: Boolean(repoJson.private),
        default_branch: repoJson.default_branch,
        branch: activeBranch,
        branches,
        files,
        suggested_file: parsed.pathHint && files.includes(parsed.pathHint)
          ? parsed.pathHint
          : files[0] || "src/pages/LandingPage.tsx",
        tailwind_config_path: tailwindConfigPath,
      });
    }

    if (action === "fetch_file") {
      const targetPath = String(body.file_path || parsed.pathHint || "src/pages/LandingPage.tsx")
        .trim()
        .replace(/^\/+/, "");

      const encodedPath = targetPath.split("/").map(encodeURIComponent).join("/");
      const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(activeBranch)}`;

      const [fileRes, commitRes] = await Promise.all([
        fetch(fileUrl, { headers }),
        fetch(
          `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(activeBranch)}`,
          { headers },
        ),
      ]);

      if (!fileRes.ok) {
        const errText = await fileRes.text().catch(() => "");
        return jsonResponse(
          { error: formatGitHubError(fileRes.status, Boolean(token), errText) },
          400,
        );
      }

      const fileJson = (await fileRes.json()) as {
        name?: string;
        path?: string;
        content?: string;
        encoding?: string;
        sha?: string;
      };

      if (!fileJson.content) {
        return jsonResponse({ error: "目標路徑不是可讀取的單一檔案。" }, 400);
      }

      const code =
        fileJson.encoding === "base64"
          ? decodeBase64Utf8(fileJson.content)
          : String(fileJson.content);

      let commitSha = fileJson.sha || "";
      if (commitRes.ok) {
        const commitJson = (await commitRes.json().catch(() => ({}))) as { sha?: string };
        if (commitJson.sha) commitSha = commitJson.sha;
      }

      // Optionally read tailwind.config.* if present
      let tailwindConfig: string | null = null;
      for (const cfgPath of [
        "tailwind.config.ts",
        "tailwind.config.js",
        "tailwind.config.mjs",
      ]) {
        const cfgRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${cfgPath}?ref=${encodeURIComponent(activeBranch)}`,
          { headers },
        );
        if (cfgRes.ok) {
          const cfgJson = (await cfgRes.json()) as { content?: string; encoding?: string };
          if (cfgJson.content) {
            tailwindConfig =
              cfgJson.encoding === "base64"
                ? decodeBase64Utf8(cfgJson.content)
                : String(cfgJson.content);
            break;
          }
        }
      }

      return jsonResponse({
        file_path: fileJson.path || targetPath,
        file_name: fileJson.name || targetPath.split("/").pop() || "Component.tsx",
        code,
        commit_sha: commitSha,
        tailwind_config: tailwindConfig,
        repo_meta: {
          repo: `${owner}/${repo}`,
          branch: activeBranch,
          file_path: fileJson.path || targetPath,
          commit_sha: commitSha,
          is_private: Boolean(repoJson.private),
        },
      });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
