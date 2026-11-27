import { fetchWithAiUsage } from "../_shared/ai-usage.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  jsonResponse,
  requireUser,
  loadFramerConnection,
  supabaseAdmin,
} from "../_shared/framer-mcp.ts";
import {
  type EdgeDiscoveredPage,
  type EdgeProjectAnalysis,
  analyzeReaddyFileMap,
  assembleReaddyPageCode,
  extractLocalNamedDataImports,
  extractLocalSectionImports,
} from "../_shared/readdy-analyzer.ts";
import { extractGeminiUsage, recordReaddyLlmUsage } from "../_shared/readdy-llm-usage.ts";

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
    return "團隊 GitHub 連線已失效。";
  }
  if (status === 403) {
    return hasToken
      ? `團隊 GitHub 帳戶無法讀取這個倉庫（403）。${detail}`
      : `GitHub 拒絕存取或已達請求上限（403）。`;
  }
  if (status === 404) {
    return hasToken
      ? "找不到該倉庫、分支或檔案（404），請確認路徑及團隊帳戶的存取權限。"
      : "找不到可存取的 GitHub 倉庫（404）。";
  }
  return `GitHub API 錯誤 (${status})：${detail}`;
}

function quotedLiterals(code: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /(['"])([^'"\\\n]{4,180})\1/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) {
    const text = match[2].trim();
    if (!text || seen.has(text) || /^[a-z0-9:/._-]+$/i.test(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function acceptInterpretedPage(text: string, pageSource: string, sources: string, metaLine: string): string | null {
  let code = text
    .trim()
    .replace(/^```(?:tsx|jsx|ts|js|html)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (!/\/\*\s*===\s*COMPONENT:/.test(code) || code.length < 120) return null;
  if (!/\/\*\s*===\s*PAGE META:/.test(code)) {
    code = `${metaLine}\n\n${code}`;
  }
  const literals = quotedLiterals(pageSource);
  if (literals.length > 0) {
    const hits = literals.filter((item) => code.includes(item)).length;
    if (hits < Math.max(1, Math.ceil(literals.length * 0.6))) return null;
  }
  const inventedCopy = (code.match(/[\u4e00-\u9fff]{6,}/g) || []).some((run) => !sources.includes(run));
  if (inventedCopy) return null;
  const inventedUrl = (code.match(/https?:\/\/[^"'\\\s)]+/g) || []).some((url) => !sources.includes(url));
  if (inventedUrl) return null;
  return code;
}

function pageSourceBundle(pageFile: string, pageSource: string, fileMap: Record<string, string>): string {
  const chunks = [`/* FILE: ${pageFile} */\n${pageSource.slice(0, 24000)}`];
  let used = chunks[0].length;
  for (const [path, code] of Object.entries(fileMap)) {
    if (path === pageFile || !code.trim()) continue;
    const piece = `/* FILE: ${path} */\n${code.slice(0, 12000)}`;
    if (used + piece.length > 64000) break;
    chunks.push(piece);
    used += piece.length;
  }
  return chunks.join("\n\n");
}

async function interpretPageSourcesWithGemini(input: {
  pagePath: string;
  pageTitle: string;
  locale: string;
  pageFile: string;
  pageSource: string;
  fileMap: Record<string, string>;
  projectName?: string;
}): Promise<string | null> {
  const apiKey = (Deno.env.get("GEMINI_API_KEY") || "").trim();
  if (!apiKey || !input.pageSource.trim()) return null;
  const model = (Deno.env.get("GEMINI_MODEL") || "gemini-4-hydrogen").trim();
  const sources = pageSourceBundle(input.pageFile, input.pageSource, input.fileMap);
  const metaLine = `/* === PAGE META: path="${input.pagePath}" title="${input.pageTitle}" locale="${input.locale}" === */`;
  const prompt = `You read a Readdy page before any assembler runs. The first FILE is the page component. Later FILE blocks are the components and data it imports. Produce the rendered page.

Rules:
- First line must be exactly: ${metaLine}
- Read the page component's return JSX first. That call site is the page. Do not replace it with a layout shell, modal provider, or a component that only renders {children} or <Outlet />.
- Emit one /* === COMPONENT: Name === */ block per visible section, in the same order as the page return.
- Substitute props from the page JSX into each component. {title}, {image}, {subtitleEn} and similar bindings must become the literal values passed by the page.
- Locale is ${input.locale}. For zh or cn, L(first, second) or t(first, second) renders the first string. For en, render the second string. Keep the characters exactly.
- Keep image URLs, hrefs, and visible copy that appear in the FILE blocks. Do not invent text, links, buttons, or sections.
- Omit a component whose render returns null.
- Keep className values that describe layout, color, and images.
- Output only the assembled code. No markdown fence and no explanation.

${sources}`;

  const res = await fetchWithAiUsage(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 32768,
          thinkingConfig: { thinkingLevel: "low" },
        },
      }),
    },
    { feature: "readdy-framer", operation: "github_interpret", provider: "gemini", model },
  );
  if (!res.ok) return null;
  const json = await res.json();
  const { tokensIn, tokensOut } = extractGeminiUsage(json);
  const finishReason = json?.candidates?.[0]?.finishReason;
  if (finishReason === "MAX_TOKENS") {
    await recordReaddyLlmUsage(supabaseAdmin(), {
      provider: "gemini",
      model,
      useCase: "github_interpret",
      status: "truncated",
      tokensIn,
      tokensOut,
      projectName: input.projectName || "",
      pagePath: input.pagePath,
    });
    return null;
  }
  const parts = json?.candidates?.[0]?.content?.parts;
  const texts = Array.isArray(parts)
    ? parts.map((part: { text?: string }) => String(part?.text || "").trim()).filter(Boolean)
    : [];
  const text = texts.find((item) => item.includes("COMPONENT:")) || texts[texts.length - 1] || "";
  const accepted = acceptInterpretedPage(text, input.pageSource, sources, metaLine);
  await recordReaddyLlmUsage(supabaseAdmin(), {
    provider: "gemini",
    model,
    useCase: "github_interpret",
    status: accepted ? "ok" : "rejected",
    tokensIn,
    tokensOut,
    projectName: input.projectName || "",
    pagePath: input.pagePath,
  });
  return accepted;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

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
      skip_llm?: boolean;
      project_name?: string;
    };

    const action = String(body.action || "inspect");

    if (action === "list_repos") {
      const token = await resolveGitHubToken(body.github_token);
      if (!token) {
        return jsonResponse({
          configured: false,
          repos: [],
          message: "團隊 GitHub 尚未連線。",
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
          p === "public/sitemap.xml" || p === "sitemap.xml" ||
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

        const dataModulePaths = new Set<string>();
        for (const sourcePath of [page.sourceFile, ...deps]) {
          const code = fileMap[sourcePath];
          if (!code) continue;
          for (const dataImp of extractLocalNamedDataImports(code, sourcePath, allPaths)) {
            if (!fileMap[dataImp.resolvedPath]) {
              dataModulePaths.add(dataImp.resolvedPath);
            }
          }
        }
        await Promise.all(
          Array.from(dataModulePaths)
            .slice(0, 8)
            .map(async (p) => {
              const content = await fetchRepoTextFile(p, activeBranch);
              if (content !== null) fileMap[p] = content;
            }),
        );
      }

      const skipLlm = Boolean(body.skip_llm);
      const pageSource = fileMap[page.sourceFile] || "";
      const interpretedPromise = skipLlm
        ? Promise.resolve(null)
        : interpretPageSourcesWithGemini({
            pagePath: page.path,
            pageTitle: page.title,
            locale: page.locale || "zh",
            pageFile: page.sourceFile,
            pageSource,
            fileMap,
            projectName: body.project_name || `${owner}/${repo}`,
          }).catch(() => null);
      const assembled = assembleReaddyPageCode(page, fileMap, sharedFiles);
      const interpreted = await interpretedPromise;
      const assembledCode = interpreted || assembled.code;
      const assembledSummary = interpreted
        ? `${assembled.summary} · Gemini 已先讀頁面原文`
        : assembled.summary;
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
        code: assembledCode,
        included_files: assembled.includedFiles,
        summary: assembledSummary,
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
