import { z } from "zod";

export const createJobInputSchema = z.object({
  projectId: z.string().min(1),
  task: z.string().trim().min(1, "タスク内容を入力してください").max(4000),
  title: z.string().trim().max(120).optional(),
  mode: z.enum(["investigate", "fix", "review", "test"]),
  workspaceMode: z.enum(["worktree", "existing"]).default("worktree"),
  baseBranch: z
    .string()
    .trim()
    .regex(/^[\w./-]+$/, "不正なブランチ名です")
    .max(100)
    .optional(),
  options: z
    .object({
      runTests: z.boolean().default(true),
      allowDependencyInstall: z.boolean().default(false),
      createCommit: z.boolean().default(false),
    })
    .default({ runTests: true, allowDependencyInstall: false, createCommit: false }),
});

export type CreateJobInputParsed = z.infer<typeof createJobInputSchema>;
