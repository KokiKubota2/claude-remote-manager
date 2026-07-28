import { describe, expect, it } from "vitest";
import { buildTaskPrompt } from "../src/claude/prompt";
import type { CreateJobInput, Project } from "../src/types/index";

const project: Project = {
  id: "proj-a",
  name: "Project A",
  repositoryPath: "/tmp/x",
  defaultBranch: "main",
  packageManager: "pnpm",
  enabled: true,
};

const base: CreateJobInput = {
  projectId: "proj-a",
  task: "500エラーを修正して",
  mode: "fix",
  workspaceMode: "worktree",
  options: { runTests: true, allowDependencyInstall: false, createCommit: false },
};

describe("buildTaskPrompt (§10.3)", () => {
  it("依頼内容と禁止事項を含む", () => {
    const prompt = buildTaskPrompt(project, base);
    expect(prompt).toContain("500エラーを修正して");
    expect(prompt).toContain("Project A");
    expect(prompt).toContain("git push を実行しない");
    expect(prompt).toContain("関連テストを実行");
    expect(prompt).toContain("依存パッケージの追加・更新は行わない");
    expect(prompt).toContain("コミットは作成しないでください");
  });

  it("investigateモードでは変更禁止を明示する", () => {
    const prompt = buildTaskPrompt(project, { ...base, mode: "investigate" });
    expect(prompt).toContain("調査のみ");
  });

  it("createCommit有効時はコミット指示を含む", () => {
    const prompt = buildTaskPrompt(project, {
      ...base,
      options: { ...base.options, createCommit: true },
    });
    expect(prompt).toContain("変更をコミットしてください");
  });
});
