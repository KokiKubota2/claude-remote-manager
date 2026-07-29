import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { E2E_TMP } from "../playwright.config";

function git(cwd: string, args: string[]): void {
  execFileSync("git", ["-c", "user.email=e2e@test", "-c", "user.name=e2e", ...args], {
    cwd,
    stdio: "ignore",
  });
}

/** ダミーリポジトリ(bare origin + clone)とregistry・空DB領域を用意する */
export function setupFixtures(): void {
  fs.rmSync(E2E_TMP, { recursive: true, force: true });
  fs.mkdirSync(E2E_TMP, { recursive: true });

  const originPath = path.join(E2E_TMP, "origin.git");
  const repoPath = path.join(E2E_TMP, "repo");
  fs.mkdirSync(originPath);
  git(E2E_TMP, ["init", "--bare", "-b", "develop", originPath]);
  git(E2E_TMP, ["clone", originPath, repoPath]);
  fs.writeFileSync(path.join(repoPath, "README.md"), "# e2e dummy\n");
  git(repoPath, ["checkout", "-b", "develop"]);
  git(repoPath, ["add", "."]);
  git(repoPath, ["commit", "-m", "init"]);
  git(repoPath, ["push", "-u", "origin", "develop"]);

  fs.writeFileSync(
    path.join(E2E_TMP, "projects.yaml"),
    [
      "projects:",
      "  - id: e2e-dummy",
      "    name: E2E Dummy",
      `    path: ${repoPath}`,
      "    defaultBranch: develop",
      "    packageManager: unknown",
      "    enabled: true",
      "",
    ].join("\n"),
  );
}
