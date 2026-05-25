export interface GifResult {
  id: string;
  /** Full-quality URL used for preview in the picker grid. */
  url: string;
  /**
   * URL actually uploaded when the user sends the GIF.
   * Uses Giphy's "downsized" variant (≤5 MB) instead of "original"
   * (which can be 20 MB+), so the client-side download + re-upload is fast.
   */
  sendUrl: string;
  previewUrl: string;
  width: number;
  height: number;
  title: string;
}

const GIPHY_API_KEY: string | undefined = import.meta.env.VITE_GIPHY_API_KEY;
const GIPHY_BASE = "https://api.giphy.com/v1/gifs";

export function isGifSupportEnabled(): boolean {
  return Boolean(GIPHY_API_KEY);
}

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}

interface GiphyResult {
  id: string;
  title: string;
  images: {
    original?: GiphyImage;
    fixed_width?: GiphyImage;
    fixed_width_small?: GiphyImage;
    downsized?: GiphyImage;
  };
}

function parseGiphyResult(result: GiphyResult): GifResult | null {
  const full =
    result.images.original ??
    result.images.downsized ??
    result.images.fixed_width;
  // "downsized" is capped at ~5 MB by Giphy; "original" can be 20 MB+.
  // Use downsized as the send URL so the client downloads a small file
  // before re-uploading; fall back to fixed_width then full if not available.
  const send =
    result.images.downsized ??
    result.images.fixed_width ??
    full;
  const preview =
    result.images.fixed_width ??
    result.images.fixed_width_small ??
    full;
  if (!full || !preview || !send) return null;

  return {
    id: result.id,
    url: full.url,
    sendUrl: send.url,
    previewUrl: preview.url,
    width: parseInt(preview.width, 10) || 200,
    height: parseInt(preview.height, 10) || 150,
    title: result.title,
  };
}

async function fetchGiphy(
  endpoint: string,
  params: Record<string, string>
): Promise<GifResult[]> {
  if (!GIPHY_API_KEY) return [];

  const url = new URL(`${GIPHY_BASE}/${endpoint}`);
  url.searchParams.set("api_key", GIPHY_API_KEY);
  url.searchParams.set("rating", "g");
  url.searchParams.set("lang", "en");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) return [];
    const data = (await response.json()) as { data?: GiphyResult[] };
    return (data.data ?? [])
      .map(parseGiphyResult)
      .filter((r): r is GifResult => r !== null);
  } catch {
    return [];
  }
}

export async function fetchFeaturedGifs(limit = 24): Promise<GifResult[]> {
  return fetchGiphy("trending", { limit: String(limit) });
}

export async function searchGifs(
  query: string,
  limit = 24
): Promise<GifResult[]> {
  const q = query.trim();
  if (!q) return fetchFeaturedGifs(limit);
  return fetchGiphy("search", { q, limit: String(limit) });
}
