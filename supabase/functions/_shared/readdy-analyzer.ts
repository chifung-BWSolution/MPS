// One analyzer. The app implementation lives in src/lib/readdyProjectAnalyzer.ts.
// Edge functions keep the names they already import, and accept either a
// shared-files object or a full analysis as the assembler’s third argument.

import type {
  ReaddyCssTokens,
  ReaddyDiscoveredPage,
  ReaddyProjectAnalysis,
} from "../../../src/types/readdyFramer.ts";
import {
  analyzeReaddyFileMap,
  assembleReaddyPageCode as assembleFromAnalysis,
  extractLocalNamedDataImports,
  extractLocalSectionImports,
  normalizeProjectFileMap,
  oklchToHex,
  parseCssTokensFromStylesheet,
} from "../../../src/lib/readdyProjectAnalyzer.ts";

export type EdgeCssTokens = ReaddyCssTokens;
export type EdgeDiscoveredPage = ReaddyDiscoveredPage;
export type EdgeProjectAnalysis = ReaddyProjectAnalysis;

export {
  analyzeReaddyFileMap,
  extractLocalNamedDataImports,
  extractLocalSectionImports,
  normalizeProjectFileMap,
  oklchToHex,
  parseCssTokensFromStylesheet,
};

type SharedFiles = ReaddyProjectAnalysis["sharedFiles"];

export function assembleReaddyPageCode(
  page: ReaddyDiscoveredPage,
  fileMap: Record<string, string>,
  sharedOrAnalysis: SharedFiles | ReaddyProjectAnalysis,
): { code: string; includedFiles: string[]; summary: string } {
  const analysis = sharedOrAnalysis && "pages" in sharedOrAnalysis
    ? sharedOrAnalysis
    : ({ sharedFiles: sharedOrAnalysis } as ReaddyProjectAnalysis);
  return assembleFromAnalysis(page, fileMap, analysis);
}
