/**
 * Sketchfab API client — search and download 3D models.
 */

export interface SketchfabModel {
  uid: string;
  name: string;
  thumbnailUrl: string;
  viewerUrl: string;
  vertexCount: number;
  faceCount: number;
  isDownloadable: boolean;
  license?: string;
  user: {
    displayName: string;
    profileUrl: string;
  };
}

export interface SketchfabSearchResult {
  models: SketchfabModel[];
  totalCount: number;
  next?: string;
}

/**
 * Search Sketchfab models via our proxy API.
 */
export async function searchModels(
  query: string,
  options?: { maxVertices?: number; page?: number },
): Promise<SketchfabSearchResult> {
  const params = new URLSearchParams({
    q: query,
    ...(options?.maxVertices && { maxVertices: String(options.maxVertices) }),
    ...(options?.page && { page: String(options.page) }),
  });

  const res = await fetch(`/api/models/search?${params}`);
  if (!res.ok) {
    throw new Error(`Search failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Get download URL for a model (via proxy).
 */
export async function getModelDownloadUrl(uid: string): Promise<string> {
  const res = await fetch(`/api/models/${uid}/download`);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status}`);
  }
  const data = await res.json();
  return data.url;
}
