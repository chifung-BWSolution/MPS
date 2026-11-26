export const LAYOUT_PASS_PERCENT = 90;
export const LAYOUT_MEASUREMENT_VERSION = 2;
export const CAPTURE_DEVICES = ["desktop", "tablet", "phone"] as const;
export type CaptureDevice = typeof CAPTURE_DEVICES[number];

export type LayoutRegion = {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PageLayout = {
  version: number;
  width: number;
  height: number;
  background?: string;
  regions: LayoutRegion[];
};

export type LayoutReview = {
  meetsTarget: boolean;
  threshold: number;
  devices: Record<CaptureDevice, {
    percent: number;
    missing: number;
    extra: number;
    displaced: number;
    examples: { kind: "missing" | "extra" | "displaced"; label: string; y: number }[];
  }>;
};

function regionWeight(region: LayoutRegion): number {
  // Prevent an oversized photo or a long line of copy from hiding smaller missing elements.
  return Math.min(8, Math.max(1, Math.sqrt(region.width * region.height) / 35));
}

function regionSimilarity(a: LayoutRegion, b: LayoutRegion): number {
  const stableEdge = (delta: number, scale: number) => Math.max(0, 1 - Math.max(0, Math.abs(delta) - 3) / scale);
  const xScale = Math.max(20, Math.min(a.width, b.width));
  const yScale = Math.max(20, Math.min(a.height, b.height));
  const position = stableEdge(a.x - b.x, xScale) * stableEdge(a.y - b.y, yScale);
  const size = stableEdge(a.width - b.width, xScale) * stableEdge(a.height - b.height, yScale);
  return position * size;
}

function compareViewport(source: PageLayout, target: PageLayout): LayoutReview["devices"][CaptureDevice] {
  if (source.version !== target.version || source.width !== target.width || !source.regions.length || !target.regions.length) {
    return { percent: 0, missing: source.regions.length, extra: target.regions.length, displaced: 0, examples: [] };
  }
  const byKey = new Map<string, number[]>();
  target.regions.forEach((region, index) => {
    const candidates = byKey.get(region.key) || [];
    candidates.push(index);
    byKey.set(region.key, candidates);
  });
  const pairs: { a: number; b: number; score: number }[] = [];
  source.regions.forEach((region, a) => {
    for (const b of byKey.get(region.key) || []) {
      const score = regionSimilarity(region, target.regions[b]);
      if (score > 0) pairs.push({ a, b, score });
    }
  });
  pairs.sort((a, b) => b.score - a.score);
  const usedSource = new Set<number>();
  const usedTarget = new Set<number>();
  let matchedWeight = 0;
  let displaced = 0;
  const examples: { kind: LayoutReview["devices"][CaptureDevice]["examples"][number]["kind"]; region: LayoutRegion }[] = [];
  for (const { a, b, score } of pairs) {
    if (usedSource.has(a) || usedTarget.has(b)) continue;
    usedSource.add(a);
    usedTarget.add(b);
    if (score < LAYOUT_PASS_PERCENT / 100) {
      displaced++;
      examples.push({ kind: "displaced", region: source.regions[a] });
    }
    matchedWeight += (regionWeight(source.regions[a]) + regionWeight(target.regions[b])) * score;
  }
  const totalWeight = [...source.regions, ...target.regions].reduce((total, region) => total + regionWeight(region), 0);
  const heightRatio = Math.min(source.height, target.height) / Math.max(source.height, target.height);
  source.regions.forEach((region, index) => {
    if (!usedSource.has(index)) examples.push({ kind: "missing", region });
  });
  target.regions.forEach((region, index) => {
    if (!usedTarget.has(index)) examples.push({ kind: "extra", region });
  });
  return {
    percent: Math.floor(100 * (0.9 * matchedWeight / totalWeight + 0.1 * heightRatio) + 1e-8),
    missing: source.regions.length - usedSource.size,
    extra: target.regions.length - usedTarget.size,
    displaced,
    examples: examples.sort((a, b) => a.region.y - b.region.y).slice(0, 5).map(({ kind, region }) => ({
      kind,
      label: region.key.startsWith("text:") ? region.key.slice(5, 85) : region.key === "image" ? "圖片或媒體" : "色塊或控制項",
      y: Math.round(region.y),
    })),
  };
}

export function comparePageLayouts(
  source: Record<CaptureDevice, PageLayout>,
  target: Record<CaptureDevice, PageLayout>,
): LayoutReview {
  const devices = {
    desktop: compareViewport(source.desktop, target.desktop),
    tablet: compareViewport(source.tablet, target.tablet),
    phone: compareViewport(source.phone, target.phone),
  };
  return {
    devices,
    threshold: LAYOUT_PASS_PERCENT,
    meetsTarget: CAPTURE_DEVICES.every((device) => devices[device].percent >= LAYOUT_PASS_PERCENT),
  };
}
