/**
 * Thin wrapper around the Sinas Management API. Uses the admin token from
 * .sinas/config.json — never the user-facing per-session JWT.
 */

export interface ApiError extends Error {
  status: number;
  detail: string;
}

function trim(url: string): string {
  return url.replace(/\/+$/, '');
}

export class SinasApi {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async raw(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${trim(this.baseUrl)}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return res;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.raw(method, path, body);
    if (!res.ok && res.status !== 204) {
      let detail = res.statusText;
      try {
        const data = (await res.clone().json()) as { detail?: string; message?: string };
        detail = data.detail || data.message || detail;
      } catch {
        // not JSON
      }
      const err = new Error(`${method} ${path} → ${res.status}: ${detail}`) as ApiError;
      err.status = res.status;
      err.detail = detail;
      throw err;
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // ─── Info ───
  getInfo(): Promise<{ auth_mode: string; version: string; features: Record<string, boolean> }> {
    return this.request('GET', '/info');
  }

  // ─── Auth ───
  getMe(): Promise<{ id: string; email: string; roles: string[] }> {
    return this.request('GET', '/auth/me');
  }

  // ─── Config (kind: SinasConfig) ───
  validateConfig(yamlContent: string): Promise<{
    valid: boolean;
    errors: Array<{ path: string; message: string }>;
    warnings: Array<{ path: string; message: string }>;
  }> {
    return this.request('POST', '/api/v1/config/validate', { config: yamlContent });
  }

  applyConfig(yamlContent: string, dryRun = false): Promise<{
    success: boolean;
    summary: Record<string, Record<string, number>>;
    changes: Array<{ action: string; resourceType: string; resourceName: string; details?: string }>;
    errors: string[];
    warnings?: string[];
  }> {
    return this.request('POST', '/api/v1/config/apply', { config: yamlContent, dryRun });
  }

  // ─── Packages (kind: SinasPackage) ───
  /** Server uses the same parser for both kinds, so this also validates packages. */
  validatePackage(yamlContent: string): ReturnType<SinasApi['validateConfig']> {
    return this.validateConfig(yamlContent);
  }

  previewPackage(yamlContent: string, variables?: Record<string, unknown>, instance?: string): Promise<{
    success: boolean;
    summary: Record<string, Record<string, number>>;
    changes: Array<{ action: string; resourceType: string; resourceName: string; details?: string }>;
    errors: string[];
    warnings?: string[];
    variables?: unknown;
    requires_input?: boolean;
  }> {
    return this.request('POST', '/api/v1/packages/preview', {
      source: yamlContent,
      variables: variables && Object.keys(variables).length > 0 ? variables : null,
      ...(instance ? { instance } : {}),
    });
  }

  installPackage(
    yamlContent: string,
    variables?: Record<string, unknown>,
    opts: { instance?: string; allowBroadRolePermissions?: boolean } = {},
  ): Promise<{
    package: { id: string; name: string; version: string };
    apply: { success: boolean; summary: Record<string, Record<string, number>>; changes: unknown[]; errors: string[] };
  }> {
    return this.request('POST', '/api/v1/packages/install', {
      source: yamlContent,
      variables: variables && Object.keys(variables).length > 0 ? variables : null,
      ...(opts.instance ? { instance: opts.instance } : {}),
      ...(opts.allowBroadRolePermissions ? { allowBroadRolePermissions: true } : {}),
    });
  }

  listPackages(): Promise<Array<{ id: string; name: string; version: string }>> {
    return this.request('GET', '/api/v1/packages');
  }

  // ─── Manifests ───
  getManifestStatus(namespace: string, name: string): Promise<{
    namespace: string;
    name: string;
    resources: Array<{ type: string; namespace: string; name: string; exists: boolean }>;
    permissions: { satisfied: boolean; missing: string[] };
    stores: Array<{ store: string; exists: boolean }>;
  }> {
    return this.request('GET', `/api/v1/manifests/${namespace}/${name}/status`);
  }
}
