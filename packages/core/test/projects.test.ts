import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ProjectRegistry,
  RegistryError,
  isPathInside,
  isValidProjectId,
  loadRegistry,
  resolveProjectPath,
} from "../src/config/projects.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-registry-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeRegistry(yaml: string): string {
  const p = path.join(tmpDir, "projects.yaml");
  fs.writeFileSync(p, yaml);
  return p;
}

describe("isValidProjectId", () => {
  it("kebab-caseのみ許可する", () => {
    expect(isValidProjectId("mego-api")).toBe(true);
    expect(isValidProjectId("a1")).toBe(true);
    expect(isValidProjectId("MegoApi")).toBe(false);
    expect(isValidProjectId("mego_api")).toBe(false);
    expect(isValidProjectId("../etc")).toBe(false);
    expect(isValidProjectId("")).toBe(false);
  });
});

describe("loadRegistry", () => {
  it("正常なYAMLを読み込む", () => {
    const p = writeRegistry(`
projects:
  - id: proj-a
    name: Project A
    path: ${tmpDir}
    defaultBranch: main
    packageManager: pnpm
    enabled: true
`);
    const projects = loadRegistry(p);
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      id: "proj-a",
      repositoryPath: tmpDir,
      defaultBranch: "main",
    });
  });

  it("ファイルがないとRegistryError", () => {
    expect(() => loadRegistry(path.join(tmpDir, "nope.yaml"))).toThrow(RegistryError);
  });

  it("相対パスを拒否する", () => {
    const p = writeRegistry(`
projects:
  - id: proj-a
    name: A
    path: ./relative
    defaultBranch: main
`);
    expect(() => loadRegistry(p)).toThrow(/absolute/);
  });

  it("重複IDを拒否する", () => {
    const p = writeRegistry(`
projects:
  - { id: dup, name: A, path: ${tmpDir}, defaultBranch: main }
  - { id: dup, name: B, path: ${tmpDir}, defaultBranch: main }
`);
    expect(() => loadRegistry(p)).toThrow(/Duplicate/);
  });

  it("不正なIDを拒否する", () => {
    const p = writeRegistry(`
projects:
  - { id: "Bad_ID", name: A, path: ${tmpDir}, defaultBranch: main }
`);
    expect(() => loadRegistry(p)).toThrow(RegistryError);
  });
});

describe("ProjectRegistry", () => {
  it("get()は有効なプロジェクトのみ返す", () => {
    const p = writeRegistry(`
projects:
  - { id: on-proj, name: A, path: ${tmpDir}, defaultBranch: main, enabled: true }
  - { id: off-proj, name: B, path: ${tmpDir}, defaultBranch: main, enabled: false }
`);
    const registry = ProjectRegistry.load(p);
    expect(registry.get("on-proj")?.id).toBe("on-proj");
    expect(registry.get("off-proj")).toBeNull();
    expect(registry.get("unknown")).toBeNull();
    expect(registry.listEnabled()).toHaveLength(1);
  });
});

describe("resolveProjectPath", () => {
  it("存在しないパスを拒否する", () => {
    expect(() =>
      resolveProjectPath({
        id: "x",
        name: "X",
        repositoryPath: path.join(tmpDir, "missing"),
        defaultBranch: "main",
        packageManager: "unknown",
        enabled: true,
      }),
    ).toThrow(RegistryError);
  });

  it("シンボリックリンクをrealpath解決する", () => {
    const realDir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-real-"));
    const link = path.join(tmpDir, "link");
    fs.symlinkSync(realDir, link);
    try {
      const resolved = resolveProjectPath({
        id: "x",
        name: "X",
        repositoryPath: link,
        defaultBranch: "main",
        packageManager: "unknown",
        enabled: true,
      });
      expect(resolved).toBe(fs.realpathSync(realDir));
    } finally {
      fs.rmSync(realDir, { recursive: true, force: true });
    }
  });
});

describe("isPathInside", () => {
  it("配下パスを許可し、脱出を拒否する", () => {
    expect(isPathInside("/a/b", "/a/b/c")).toBe(true);
    expect(isPathInside("/a/b", "/a/b")).toBe(true);
    expect(isPathInside("/a/b", "/a/b/../c")).toBe(false);
    expect(isPathInside("/a/b", "/etc/passwd")).toBe(false);
    expect(isPathInside("/a/b", "c/../../x")).toBe(false);
    expect(isPathInside("/a/b", "c/d")).toBe(true);
  });
});
