import type { GridConfig } from '@/types/readdyFramer';

export const DEFAULT_GITHUB_REPO =
  'https://github.com/nova-studio/readdy-saas-landing';

export const DEFAULT_GITHUB_BRANCH = 'main';
export const DEFAULT_GITHUB_FILE_PATH = 'src/pages/LandingPage.tsx';

export const DEFAULT_GRID_CONFIG: GridConfig = {
  desktop_width: 1440,
  container_max_width: 1200,
  columns: 12,
  gutter: 24,
};

export const SAMPLE_READDY_TSX = `export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#080F1E] text-white">
      {/* Top Navigation */}
      <header className="max-w-[1200px] mx-auto px-8 py-5 flex items-center justify-between">
        <span className="text-xl font-bold tracking-tight">NovaCloud</span>
        <nav className="hidden md:flex items-center gap-8 text-sm text-slate-300">
          <a href="#features">Features</a>
          <a href="#workflow">Workflow</a>
          <a href="#pricing">Pricing</a>
          <a href="#docs">Docs</a>
        </nav>
        <button className="px-4 py-2 rounded-lg bg-[#0BB59B] text-[#081018] font-semibold text-sm">
          Start Free Trial
        </button>
      </header>

      {/* Hero Banner */}
      <section className="max-w-[1200px] mx-auto px-8 py-20 text-center">
        <span className="inline-block px-3 py-1 rounded-full bg-[#0BB59B]/15 text-[#0BB59B] text-xs font-semibold mb-6">
          v2.4 · 12-Col Grid Precision Engine
        </span>
        <h1 className="text-5xl font-bold tracking-tight max-w-3xl mx-auto leading-tight">
          Ship Readdy Prototypes Directly to Framer Canvas
        </h1>
        <p className="mt-5 text-lg text-slate-300 max-w-2xl mx-auto">
          Automatically lock 1440px desktop breakpoints, map Design Tokens, and stream structured Auto Stacks via Remote MCP.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <button className="px-6 py-3 rounded-lg bg-[#0BB59B] text-[#081018] font-semibold">
            Sync to Framer
          </button>
          <button className="px-6 py-3 rounded-lg border border-white/20 text-white font-medium">
            Inspect IR JSON
          </button>
        </div>
      </section>

      {/* Trusted Logos Strip */}
      <section className="max-w-[1200px] mx-auto px-8 py-10 border-y border-white/10">
        <p className="text-center text-xs uppercase tracking-widest text-slate-400 mb-6">
          Trusted by product & design engineering teams
        </p>
        <div className="flex flex-wrap items-center justify-between gap-8 text-slate-300 font-semibold">
          <span>LINEAR</span>
          <span>VERCEL</span>
          <span>RAYCAST</span>
          <span>FRAMER</span>
          <span>SUPABASE</span>
        </div>
      </section>

      {/* 3-Column Features Grid */}
      <section id="features" className="max-w-[1200px] mx-auto px-8 py-20">
        <h2 className="text-3xl font-bold text-center">Built for Zero-Drift Layout Handoff</h2>
        <p className="text-slate-400 text-center mt-3 max-w-xl mx-auto">
          Every Tailwind section is compiled into a flat Framer Stack or Grid anchored to your 12-column rule.
        </p>
        <div className="mt-12 grid grid-cols-3 gap-6">
          <div className="p-6 rounded-xl bg-white/5 border border-white/10">
            <h3 className="text-lg font-semibold">AST Section Splitting</h3>
            <p className="mt-2 text-sm text-slate-300">
              Separates Navbar, Hero, Feature Grids, and Footer into deterministic Framer steps.
            </p>
          </div>
          <div className="p-6 rounded-xl bg-white/5 border border-white/10">
            <h3 className="text-lg font-semibold">12-Col Grid Anchor</h3>
            <p className="mt-2 text-sm text-slate-300">
              Locks 1440px viewport and 1200px container bounds with 24px gutter alignment.
            </p>
          </div>
          <div className="p-6 rounded-xl bg-white/5 border border-white/10">
            <h3 className="text-lg font-semibold">Stepwise Remote MCP</h3>
            <p className="mt-2 text-sm text-slate-300">
              Streams one section per Edge Function invocation to eliminate timeout risks.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="max-w-[1200px] mx-auto px-8 py-16">
        <div className="rounded-2xl bg-[#0F223D] border border-[#0BB59B]/30 p-12 text-center">
          <h2 className="text-3xl font-bold">Ready to Sync Your Landing Page?</h2>
          <p className="mt-3 text-slate-300">
            Connect mcp.framer.com once and let your whole team publish directly from Readdy.
          </p>
          <button className="mt-7 px-6 py-3 rounded-lg bg-[#0BB59B] text-[#081018] font-semibold">
            Launch Framer Sync
          </button>
        </div>
      </section>

      {/* Global Footer */}
      <footer className="max-w-[1200px] mx-auto px-8 py-10 border-t border-white/10 flex items-center justify-between text-sm text-slate-400">
        <span>© 2026 NovaCloud Inc.</span>
        <div className="flex items-center gap-6">
          <a href="#privacy">Privacy</a>
          <a href="#terms">Terms</a>
          <a href="#status">Status</a>
        </div>
      </footer>
    </div>
  );
}
`;
