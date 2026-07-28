import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { Project } from "../types/index";

const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isValidProjectId(id: string): boolean {
  return PROJECT_ID_PATTERN.test(id);
}

const projectSchema = z.object({
  id: z.string().regex(PROJECT_ID_PATTERN, "id must be kebab-case (a-z, 0-9, -)"),
  name: z.string().min(1),
  path: z.string().min(1),
  defaultBranch: z.string().min(1),
  packageManager: z.enum(["pnpm", "npm", "yarn", "bun", "unknown"]).default("unknown"),
  enabled: z.boolean().default(true),
});

const registryFileSchema = z.object({
  projects: z.array(projectSchema),
});

export class RegistryError extends Error {}

/**
 * Repository Registryを読み込み、スキーマ検証して返す。
 * ファイルシステム検証(存在・realpath)は resolveProjectPath で行う。
 */
export function loadRegistry(configPath: string): Project[] {
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch {
    throw new RegistryError(
      `Project registry not found: ${configPath} (copy config/projects.example.yaml to get started)`,
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (e) {
    throw new RegistryError(`Project registry is not valid YAML: ${(e as Error).message}`);
  }

  const result = registryFileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new RegistryError(`Invalid project registry:\n${issues}`);
  }

  const projects = result.data.projects;
  const ids = new Set<string>();
  for (const p of projects) {
    if (ids.has(p.id)) throw new RegistryError(`Duplicate project id: ${p.id}`);
    ids.add(p.id);
    if (!path.isAbsolute(p.path)) {
      throw new RegistryError(`Project path must be absolute: ${p.id} -> ${p.path}`);
    }
  }

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    repositoryPath: p.path,
    defaultBranch: p.defaultBranch,
    packageManager: p.packageManager,
    enabled: p.enabled,
  }));
}

/**
 * プロジェクトの登録パスをrealpath解決し、シンボリックリンク等で
 * 登録範囲外へ脱出していないことを検証して返す(§19.3)。
 */
export function resolveProjectPath(project: Project): string {
  let real: string;
  try {
    real = fs.realpathSync(project.repositoryPath);
  } catch {
    throw new RegistryError(
      `Project path does not exist: ${project.id} -> ${project.repositoryPath}`,
    );
  }
  if (!fs.statSync(real).isDirectory()) {
    throw new RegistryError(`Project path is not a directory: ${project.id} -> ${real}`);
  }
  return real;
}

/**
 * 任意のパスが指定ディレクトリ配下にあることを検証する(パストラバーサル防止)。
 * 比較前に両者をresolveする。相対パス`candidate`は`root`基準で解決する。
 */
export function isPathInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(resolvedRoot, candidate);
  const rel = path.relative(resolvedRoot, resolvedCandidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export class ProjectRegistry {
  private byId: Map<string, Project>;

  constructor(projects: Project[]) {
    this.byId = new Map(projects.map((p) => [p.id, p]));
  }

  static load(configPath: string): ProjectRegistry {
    return new ProjectRegistry(loadRegistry(configPath));
  }

  list(): Project[] {
    return [...this.byId.values()];
  }

  listEnabled(): Project[] {
    return this.list().filter((p) => p.enabled);
  }

  /** 有効なプロジェクトのみ返す。未登録・無効はnull */
  get(id: string): Project | null {
    const p = this.byId.get(id);
    return p && p.enabled ? p : null;
  }
}
