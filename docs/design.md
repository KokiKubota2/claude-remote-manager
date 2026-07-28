# Claude Code Remote Job Manager

## スマートフォンからClaude Codeタスクを起動・監視・操作するシステム設計書

> 改訂 2026-07-28: Phase 0 成立性調査(`docs/capability-report.md`)の結果を反映。
> 主な変更: Claude 連携の主経路を Claude Agent SDK(`canUseTool`)に変更、
> Hook CLI・内部Hook HTTP API・tmuxアダプタを削除、Remote Controlをオプション機能に格下げ。

---

# 1. 概要

MacBook Pro上の複数のGitリポジトリを対象に、外出先のスマートフォンからClaude Codeのタスクを開始・監視・操作できるローカル実行システムを構築する。

スマートフォンでは、主に次の操作を行う。

* 登録済みプロジェクトを選択する
* Claude Codeへ依頼するタスクを入力する
* Claude Codeジョブを開始する
* 実行状況を確認する
* Claude Codeからの質問に回答する
* ツール実行を許可または拒否する
* エラー発生を確認する
* 完了内容とGit差分を確認する
* 追加修正を依頼する
* ジョブを停止する
* 作業結果を保持または破棄する

基本方針は以下とする。

```text
Web管理画面
＝プロジェクト選択、タスク起動、ジョブ管理、差分確認

Slack
＝通知、許可、拒否、簡単な追加指示

Claude公式Remote Control
＝利用可能な場合の詳細な会話・セッション操作

MacBook Pro
＝Claude Code、Git、ソースコード、実行処理の本体
```

MacBook Proから外部サービスへ接続する方式を基本とし、家庭用ルーターのポート開放は行わない。

---

# 2. 利用シナリオ

## 2.1 外出先から修正を依頼する

スマートフォンでWeb管理画面を開く。

```text
新しいタスク

プロジェクト
[ MeGo API ▼ ]

依頼内容
┌────────────────────────────┐
│ ユーザー登録画面で500エラーが    │
│ 発生しています。原因を調査して    │
│ 修正し、関連テストを実行して      │
│ ください。                       │
└────────────────────────────┘

実行モード
● 修正まで行う
○ 調査のみ

作業環境
● 専用Git worktree
○ 現在の作業ディレクトリ

[実行開始]
```

実行開始後、MacBook Pro上で以下を行う。

1. 対象リポジトリを確認
2. Git状態を確認
3. ベースブランチを更新
4. 専用Git worktreeを作成
5. Claude Codeを起動
6. タスク本文をClaude Codeへ渡す
7. Slackへ開始通知を送る
8. 実行状態を保存する

---

## 2.2 Claude Codeが許可を求める

Claude Codeがコマンド実行などの許可を求めた場合、Slackへ通知する。

```text
🔐 Claude Codeが許可を求めています

プロジェクト
MeGo API

ジョブ
ユーザー登録500エラー修正

ツール
Bash

実行内容
pnpm add zod

目的
入力値検証用の依存パッケージを追加します。

[今回のみ許可]
[拒否]
[詳細]
```

スマートフォンでボタンを押すと、Claude Codeへ許可または拒否を返す。

許可要求は Claude Agent SDK の `canUseTool` コールバックで処理する。
(Phase 0 実測により、headless 起動では `PermissionRequest` Hook が発火しないことを確認済み。
詳細は `docs/capability-report.md` §6・§13 を参照。)

---

## 2.3 Claude Codeが判断を求める

```text
🤔 Claude Codeが判断を求めています

認証エラーの修正方法として、次の2案があります。

A. 既存セッション処理を修正する
B. 認証処理を新しい共通関数へ移す

Bを推奨します。

[提案どおり進める]
[指示を入力]
[Webで開く]
[停止]
```

「指示を入力」を押すとSlack Modalを表示する。

```text
追加指示

┌────────────────────────────┐
│ Bで進めてください。既存APIとの    │
│ 互換性は維持してください。        │
└────────────────────────────┘

[送信]
```

---

## 2.4 作業完了

```text
✅ Claude Codeの作業が完了しました

プロジェクト
MeGo API

結果
・500エラーの原因を特定
・入力値が未定義の場合の処理を修正
・回帰テストを3件追加
・テスト成功

変更
4ファイル
+86 / -21

作業ブランチ
claude/job-20260727-001

[結果を見る]
[追加修正]
[差分を見る]
[完了]
```

---

# 3. ゴール

## 3.1 必須ゴール

以下をスマートフォンから行えること。

1. プロジェクトを選択する
2. タスクを入力する
3. Claude Codeを起動する
4. 実行中の状態を確認する
5. Claude Codeの質問に回答する
6. 実行許可を与える、または拒否する
7. 完了通知を受け取る
8. Git差分を確認する
9. 追加修正を依頼する
10. ジョブを停止する

---

## 3.2 操作性のゴール

スマートフォンでの操作を最小限にする。

優先順位は以下とする。

```text
1. ボタン1回
2. 選択肢から選ぶ
3. 短文入力
4. 詳細画面を開く
5. SSH接続
```

SSH接続は通常運用では使用しない。

---

## 3.3 安全性のゴール

* SlackやWebから任意のローカルパスを指定できない
* 登録済みリポジトリだけを操作できる
* Slackから任意のシェルコマンドを実行できない
* Claude Codeの作業は原則専用worktreeで行う
* 既存の作業ディレクトリを意図せず変更しない
* 許可要求の失敗時に自動許可しない
* 作業結果を自動で本番ブランチへマージしない
* 外部ユーザーから操作されないよう認証する

---

# 4. 非ゴール

初期バージョンでは以下を実装しない。

* クラウド上でClaude Codeを実行する
* 複数ユーザーによる共同操作
* 任意シェルコマンドの遠隔実行
* 自動本番デプロイ
* 自動Pull Requestマージ
* 自動本番ブランチマージ
* Zedの画面そのものの遠隔操作
* 完全なターミナルエミュレーター
* Claude Codeの全出力の常時ストリーミング
* 複数Macの一括管理
* 一般公開サービスとしてのマルチテナント対応

---

# 5. システム構成

```text
┌─────────────────────────────────────────┐
│ スマートフォン                           │
│                                         │
│  ┌───────────────────┐                  │
│  │ Web管理画面       │                  │
│  │                   │                  │
│  │ ・プロジェクト選択 │                  │
│  │ ・タスク起動       │                  │
│  │ ・ジョブ一覧       │                  │
│  │ ・状態確認         │                  │
│  │ ・Git差分          │                  │
│  └─────────┬─────────┘                  │
│            │                            │
│  ┌─────────▼─────────┐                  │
│  │ Slack             │                  │
│  │                   │                  │
│  │ ・通知             │                  │
│  │ ・許可／拒否       │                  │
│  │ ・追加指示         │                  │
│  └───────────────────┘                  │
└─────────────────────────────────────────┘
                │
                │ HTTPS / WebSocket
                ▼
┌─────────────────────────────────────────┐
│ MacBook Pro                             │
│                                         │
│  Claude Remote Job Manager             │
│  ┌───────────────────────────────────┐  │
│  │ Web UI / API                      │  │
│  │ Slack Bridge                      │  │
│  │ Job Manager                       │  │
│  │ Repository Registry               │  │
│  │ Claude Adapter                    │  │
│  │ Git Worktree Manager              │  │
│  │ SQLite                            │  │
│  └──────────────┬────────────────────┘  │
│                 │ Agent SDK             │
│      ┌──────────▼──────────┐            │
│      │ Claude Code         │            │
│      │                     │            │
│      │ ・Agent SDK         │            │
│      │ ・canUseTool        │            │
│      │ ・Remote Control(任意)│          │
│      └──────────┬──────────┘            │
│                 │                       │
│      ┌──────────▼──────────┐            │
│      │ Git worktree        │            │
│      │ ソースコード        │            │
│      └─────────────────────┘            │
└─────────────────────────────────────────┘
```

---

# 6. 外部アクセス方式

Web管理画面をスマートフォンから利用するため、次の方式を選択できる設計にする。

## 6.1 推奨：Tailscale

MacBook ProとスマートフォンにTailscaleを導入し、Tailnet内だけでWeb管理画面へアクセスする。

```text
http://macbook-name:32146
```

またはHTTPS化できる場合は以下とする。

```text
https://macbook-name.tailnet-name.ts.net
```

メリット：

* 家庭用ルーターのポート開放が不要
* 公開インターネットに管理画面を露出しない
* 固定グローバルIPが不要
* スマートフォンとMacが別ネットワークでも利用できる

MVPではTailscaleを第一候補とする。

---

## 6.2 代替：Cloudflare Tunnel

Cloudflare Tunnelを利用する場合は、Cloudflare Accessによる認証を必須とする。

単にURLを知っていればアクセスできる状態にはしない。

---

## 6.3 ローカルのみ

開発中は以下で起動できるようにする。

```text
http://127.0.0.1:32146
```

---

# 7. 推奨技術スタック

```text
Runtime
- Node.js 22以降

Language
- TypeScript

Package manager
- pnpm

Web
- Next.js
- React
- Server ActionsまたはRoute Handlers
- Tailwind CSS

Slack
- @slack/bolt
- Socket Mode
- Block Kit
- Modal

Claude
- @anthropic-ai/claude-agent-sdk
- claude CLI(SDKが内部で使用)

Database
- SQLite
- better-sqlite3
- Drizzle ORM

Validation
- Zod

Logging
- Pino

Process management
- Node.js child_process
- execFile
- spawn

Git
- git CLI
- execFile経由で操作

Testing
- Vitest
- Playwright

Code quality
- ESLint
- Prettier
```

Web UIとAPIを同じNext.jsアプリケーションに置いてよい。

ただし、ジョブ実行プロセスはWebリクエストのライフサイクルから分離する。

---

# 8. コンポーネント

## 8.1 Web管理画面

責務：

* プロジェクト一覧表示
* 新規タスク作成
* ジョブ一覧表示
* ジョブ詳細表示
* 状態更新
* 追加指示送信
* ジョブ停止
* Git差分表示
* ログ表示
* worktree保持／破棄
* 認証

---

## 8.2 Job Manager

責務：

* ジョブ作成
* キュー管理
* worktree作成
* Claude Code起動
* PID・セッション管理
* 状態遷移
* Claude Code終了検知
* タイムアウト処理
* Slack通知
* 再起動後のジョブ復旧判定

Job Managerは常駐プロセスとして動作させる。

---

## 8.3 Repository Registry

Claude Codeを実行できるリポジトリを管理する。

スマートフォンから任意のファイルパスは指定させない。

登録例：

```yaml
projects:
  - id: mego-api
    name: MeGo API
    path: /Users/koki/develop/mego-api
    defaultBranch: develop
    packageManager: pnpm
    enabled: true

  - id: mego-web
    name: MeGo Web
    path: /Users/koki/develop/mego-web
    defaultBranch: develop
    packageManager: pnpm
    enabled: true

  - id: ananke
    name: Ananke
    path: /Users/koki/develop/ananke
    defaultBranch: main
    packageManager: pnpm
    enabled: true
```

初期バージョンではYAMLまたはJSONで管理してよい。

将来的にはWeb UIから登録できるようにする。

---

## 8.4 Claude Adapter

Claude Codeとの接続方法を抽象化する。

```ts
interface ClaudeAdapter {
  checkCapabilities(): Promise<ClaudeCapabilities>;

  startJob(input: StartClaudeJobInput): Promise<ClaudeSession>;

  sendMessage(
    session: ClaudeSession,
    message: string,
  ): Promise<void>;

  stopJob(session: ClaudeSession): Promise<void>;

  getStatus(
    session: ClaudeSession,
  ): Promise<ClaudeSessionStatus>;
}
```

実装：

```text
SdkClaudeAdapter    Claude Agent SDK(主経路)
MockClaudeAdapter   テスト用
```

主経路は Claude Agent SDK(`@anthropic-ai/claude-agent-sdk`)とする。

* `query()` でジョブを起動する(プロセス生成・stream-json制御はSDKが内包)
* `canUseTool` コールバックで許可要求を受け取り、Slack回答で解決する
* `options.resume` + セッションIDで追加指示を送る
* `interrupt()` で停止する

Phase 0 実測(v2.1.220)で確認済みの根拠:

* headless(`--print`)起動では PermissionRequest Hook が発火せず、許可が必要なツールは即拒否される
* 対話モード(PTY)は worktree ごとに workspace trust ダイアログが出るため自動化に不向き
* SDK の `canUseTool` はこの両問題を回避できる唯一の公式経路

縮退運用(SDKが利用できない場合):

* `claude -p --resume <sessionId>` の連鎖で対話継続のみ提供する
* 許可制御は settings.json の allow/deny ルールで事前定義できる範囲に限定し、動的な許可要求は「拒否して質問として通知」へ倒す

tmux / PTY アダプタは実装しない(capability-report §14-2)。

---

## 8.5 Slack Bridge

責務：

* Socket Mode接続
* ジョブ開始通知
* 許可要求通知(canUseTool)
* 判断待ち通知
* 完了通知
* エラー通知
* ボタン操作受信
* Modal入力受信
* 操作ユーザー認証
* 回答済みメッセージ更新
* Web詳細画面へのリンク生成

Slack Socket Modeを使用する。

Mac側にSlack用の公開HTTP Request URLを作らない。

---

## 8.6 Claude イベント処理(Hook CLI は廃止)

旧設計の「Hook CLI + localhost HTTP の Hook Receiver」は廃止する。

Agent SDK を使う場合、許可要求・応答完了・通知はすべて Job Manager プロセス内の
コールバック/メッセージストリームとして受け取れるため、プロセス間通信が不要になる。

| 旧設計(Hook CLI) | 新設計(SDK) |
|---|---|
| PermissionRequest Hook → Hook CLI → HTTP → Job Manager | `canUseTool` コールバック |
| Stop Hook → Hook CLI → HTTP | `result` メッセージ / SDK Hooks の `Stop`(`last_assistant_message` 付き) |
| Notification Hook → Hook CLI → HTTP | SDK Hooks の `Notification`(`notification_type` 付き) |
| SessionStart / SessionEnd Hook | `system/init` メッセージ / ストリーム終了 |

ユーザーのグローバル `~/.claude/settings.json` の Hooks 設定は変更しない。
SDK 側の hooks オプションはジョブセッション内に閉じる。

---

## 8.7 Git Worktree Manager

責務：

* ベースリポジトリの確認
* 未コミット変更の確認
* remote fetch
* worktree作成
* 作業ブランチ作成
* 差分取得
* コミット作成
* worktree削除
* ブランチ保持

原則として、Claude Codeのタスクごとに専用worktreeを作成する。

---

# 9. Claude Code起動方式

## 9.1 基本方針(Agent SDK)

Claude Agent SDK の `query()` を専用worktreeを cwd として実行し、最初のプロンプトとしてタスク本文を渡す。

概念例：

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";

const sessionId = jobSessionUuid; // ジョブ作成時に生成したUUID

const q = query({
  prompt: taskPrompt,
  options: {
    cwd: worktreePath,
    // セッションIDを「取得」するのではなく「指定」する(実測確認済み)
    // SDKオプション名は実装時にSDKの型定義で確認する
    env: sanitizeClaudeEnv({
      ...process.env,
      CLAUDE_REMOTE_JOB_ID: jobId,
    }),
    canUseTool: async (toolName, input, { suggestions }) => {
      // Slackへ許可要求を通知し、回答をPromiseで待つ
      return await permissionBroker.request(jobId, toolName, input, suggestions);
    },
  },
});

for await (const message of q) {
  // system/init: session_id 確認
  // assistant: 最新メッセージの保存
  // result: 完了・エラー処理
}
```

注意点(Phase 0 実測に基づく):

* `sanitizeClaudeEnv` で `CLAUDECODE` / `CLAUDE_CODE_*` 系環境変数を除去する。
  `CLAUDE_CODE_CHILD_SESSION` が継承されるとトランスクリプト保存が無効化され、resume が壊れる。
* `--print` + PermissionRequest Hook の組み合わせは成立しない(headlessではHookが発火せず即deny)。
  許可制御は必ず `canUseTool` で行う。
* SDKのオプション名・型は実装時に実際のSDKバージョンの型定義で確認し、存在しないオプションを仮定しない。

---

## 9.2 Remote Control(オプション機能)

Phase 0 実測の結果、Remote Control連携はオプション機能とする。

確認済みの事実(v2.1.220):

* `claude remote-control` で起動でき、`https://claude.ai/code?environment=env_...` 形式のURLが端末に表示される
* URLは**セッション単位ではなくenvironment(マシン接続)単位**
* 起動時に対話確認(y/n)があり、完全な非対話起動はできない
* 外部プログラムからセッションを操作する公式APIはない

したがって:

* Job Managerからの自動起動はしない(ユーザーが手動で `claude remote-control` を起動する運用)
* 起動中であればWeb画面にenvironment URLを1つ表示する(ジョブ単位ではなくマシン単位)
* Remote Controlの `--spawn=worktree` は本システムのGit Worktree Managerと競合するため併用しない

---

## 9.3 縮退運用(SDKが使えない場合)

SDKに問題が発生した場合の縮退運用として、CLI直接利用を残す。

```text
起動:      claude -p "<taskPrompt>" --session-id <uuid> --output-format json
追加指示:  claude -p --resume <uuid> "<message>" --output-format json
```

制約:

* 動的な許可要求は処理できない(headlessでは即denyされ `permission_denials` に記録される)
* 許可はsettings.jsonのallow/denyルールで事前定義できる範囲に限定する
* denyされた場合はジョブを「判断待ち」にし、Slackへ通知して人間の指示を待つ

tmux / PTY による対話セッション制御は実装しない。

コマンド実行は必ず`execFile`を使用し、ユーザー入力を`sh -c`へ渡さない。

---

# 10. タスク作成

## 10.1 入力項目

```ts
type CreateJobInput = {
  projectId: string;
  task: string;

  mode:
    | "investigate"
    | "fix"
    | "review"
    | "test";

  workspaceMode:
    | "worktree"
    | "existing";

  baseBranch?: string;

  options: {
    runTests: boolean;
    allowDependencyInstall: boolean;
    createCommit: boolean;
  };
};
```

---

## 10.2 定型タスク

スマートフォンでの入力を簡単にするため、定型タスクを用意する。

```text
[エラー調査・修正]
[テスト失敗修正]
[コードレビュー]
[型エラー修正]
[Lint修正]
[依存関係更新]
[自由入力]
```

「エラー調査・修正」を選択した場合：

```text
発生している問題
[入力欄]

再現方法
[任意入力欄]

期待する動作
[任意入力欄]

[x] 原因を調査する
[x] 修正する
[x] 関連テストを実行する
[x] 変更内容を要約する
```

最終的なClaude Codeプロンプトはシステム側で生成する。

---

## 10.3 プロンプト生成

例：

```text
以下のタスクを実行してください。

プロジェクト:
MeGo API

依頼:
ユーザー登録画面で500エラーが発生しています。
原因を調査して修正してください。

実行方針:
- まず原因を調査してください
- 修正前に関連コードを確認してください
- 必要な範囲だけ変更してください
- 既存仕様との互換性を維持してください
- 修正後に関連テストを実行してください
- 新たな型エラーやLintエラーがないことを確認してください
- 最後に原因、変更内容、テスト結果を要約してください
- 判断が必要な場合は勝手に大きな設計変更をせず質問してください

禁止事項:
- mainまたはdevelopへ直接pushしない
- force pushしない
- 本番環境へデプロイしない
- 秘密情報を出力しない
- 登録リポジトリ外のファイルを変更しない
```

---

# 11. Git Worktree

## 11.1 worktree作成

ジョブID：

```text
job_20260727_001
```

ブランチ：

```text
claude/job-20260727-001
```

worktree：

```text
~/.claude-remote/worktrees/mego-api/job-20260727-001
```

概念コマンド：

```bash
git -C /Users/koki/develop/mego-api fetch origin

git -C /Users/koki/develop/mego-api worktree add \
  -b claude/job-20260727-001 \
  ~/.claude-remote/worktrees/mego-api/job-20260727-001 \
  origin/develop
```

コマンド実行は`execFile`で行う。

---

## 11.2 ベースブランチ

初期値はプロジェクト設定の`defaultBranch`とする。

Web画面から変更できる場合も、リモート上に存在するブランチだけを選択肢として表示する。

自由入力はさせない。

---

## 11.3 未コミット変更

既存作業ディレクトリに未コミット変更があっても、専用worktreeなら基本的に影響を受けない。

ただし、以下を開始前に確認する。

* worktree対象ブランチが存在する
* 同名ブランチが存在しない
* worktreeパスが存在しない
* Gitリポジトリが正常
* `.git`が壊れていない
* fetchに失敗していない

---

## 11.4 完了後

MVPでは次の選択肢を提供する。

```text
[作業ブランチを保持]
[コミットを作成]
[worktreeを破棄]
```

自動マージは実装しない。

「コミットを作成」は、Claude Code自身ではなくJob Manager側で行ってもよい。

コミット前に差分が存在することを確認する。

---

# 12. ジョブ状態

```ts
type JobStatus =
  | "queued"
  | "preparing"
  | "starting"
  | "running"
  | "waiting_permission"
  | "waiting_input"
  | "completed"
  | "failed"
  | "cancel_requested"
  | "cancelled"
  | "expired"
  | "orphaned";
```

状態遷移：

```text
queued
  ↓
preparing
  ↓
starting
  ↓
running
  ├─ waiting_permission
  │      ↓
  │    running
  │
  ├─ waiting_input
  │      ↓
  │    running
  │
  ├─ completed
  ├─ failed
  └─ cancelled
```

`orphaned`は、Job Manager再起動後に対応プロセスが見つからない場合に使用する。

---

# 13. データモデル

## 13.1 Project

```ts
type Project = {
  id: string;
  name: string;
  repositoryPath: string;
  defaultBranch: string;
  enabled: boolean;

  packageManager:
    | "pnpm"
    | "npm"
    | "yarn"
    | "bun"
    | "unknown";

  createdAt: string;
  updatedAt: string;
};
```

---

## 13.2 Job

```ts
type Job = {
  id: string;
  projectId: string;

  title: string;
  task: string;
  mode: string;

  status: JobStatus;

  baseBranch: string;
  worktreePath: string | null;
  worktreeBranch: string | null;

  claudeMode:
    | "sdk"
    | "process";

  claudeSessionId: string; // ジョブ作成時に生成し --session-id / SDK へ渡す
  processId: number | null;
  processStartedAt: string | null; // PID再利用誤検知の防止(21.3)

  resultSummary: string | null;
  errorMessage: string | null;

  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};
```

---

## 13.3 JobEvent

```ts
type JobEvent = {
  id: string;
  jobId: string;

  type:
    | "created"
    | "started"
    | "log"
    | "permission_requested"
    | "permission_answered"
    | "input_requested"
    | "input_answered"
    | "completed"
    | "failed"
    | "cancelled";

  payloadJson: string;
  createdAt: string;
};
```

---

## 13.4 PendingAction

```ts
type PendingAction = {
  id: string;
  jobId: string;

  type:
    | "permission"
    | "user_input"
    | "confirmation";

  status:
    | "pending"
    | "answered"
    | "expired"
    | "cancelled";

  requestJson: string;
  responseJson: string | null;

  slackChannelId: string | null;
  slackMessageTs: string | null;
  slackThreadTs: string | null;

  createdAt: string;
  expiresAt: string | null;
  answeredAt: string | null;
};
```

---

# 14. Web画面

## 14.1 ダッシュボード

```text
Claude Remote

実行中
┌──────────────────────────────┐
│ MeGo API                     │
│ ユーザー登録500エラー修正      │
│ 状態: 調査中                 │
│ 12分経過                     │
│                 [詳細を見る] │
└──────────────────────────────┘

判断待ち
┌──────────────────────────────┐
│ Ananke                       │
│ API認証方式の確認             │
│                 [回答する]   │
└──────────────────────────────┘

[新しいタスク]
```

---

## 14.2 プロジェクト一覧

カード表示にする。

```text
MeGo API
develop
最終実行: 2時間前

[タスクを開始]
```

プロジェクト数が増えた場合に検索できるようにする。

---

## 14.3 新規タスク

入力項目：

* プロジェクト
* タスクテンプレート
* タスク本文
* ベースブランチ
* 調査のみ／修正
* テスト実行
* コミット作成
* worktree利用

主要操作ボタンは画面下部へ固定する。

```text
[キャンセル] [Claude Codeを開始]
```

---

## 14.4 ジョブ詳細

```text
MeGo API
ユーザー登録500エラー修正

状態
● 実行中

経過時間
12分34秒

現在の処理
関連する認証処理を調査しています。

Claudeからの最新メッセージ
原因はリクエストボディが空の場合に……

[Claudeの提案で続行]
[追加指示]
[停止]

変更ファイル
4件

[Git差分を見る]
[ログを見る]
[Remote Controlを開く]
```

Remote Controlのenvironment URLはマシン単位で1つ(ジョブ単位ではない)。
Remote Controlが起動していない場合はボタンを表示しない。

---

## 14.5 Git差分

スマートフォン向けに以下を用意する。

* ファイル単位の一覧
* 追加・削除行数
* ファイルごとの展開
* 長いdiffの折りたたみ
* バイナリファイル非表示
* 秘密情報の簡易マスキング

```text
src/routes/register.ts
+24 / -8

[差分を表示]
```

MVPではシンタックスハイライトを最低限にしてよい。

---

## 14.6 ログ画面

全ターミナル出力を無制限に保存しない。

次を分けて扱う。

* Claude Codeの状態イベント
* 最新メッセージ
* stderr
* Job Managerのイベントログ
* コマンド実行履歴の概要

最大保持行数または最大ファイルサイズを設定する。

---

# 15. Slack設計

## 15.1 専用チャンネル

例：

```text
#claude-remote
```

Botは専用チャンネルだけに投稿する。

---

## 15.2 ジョブ開始通知

```text
🚀 Claude Codeジョブを開始しました

プロジェクト
MeGo API

タスク
ユーザー登録画面の500エラーを調査して修正してください。

ベースブランチ
develop

作業ブランチ
claude/job-20260727-001

[Webで状況を見る]
[停止]
```

---

## 15.3 許可要求(canUseTool)

```text
🔐 実行許可が必要です

ツール
Bash

コマンド
pnpm add zod

リスク
依存関係が変更されます。

[今回のみ許可]
[拒否]
[詳細]
```

action ID：

```text
permission_allow_once
permission_deny
permission_show_details
```

ボタンの`value`にはランダムな`pendingActionId`だけを入れる。

生のコマンドを含めない。

---

## 15.4 判断待ち

```text
🤔 Claude Codeが判断を求めています

既存の認証処理を修正するか、共通化するか確認しています。

Claudeの推奨
共通化して修正

[提案どおり進める]
[指示を入力]
[Webで開く]
[停止]
```

---

## 15.5 完了

```text
✅ Claude Codeジョブが完了しました

プロジェクト
MeGo API

結果
・原因を特定
・修正完了
・テスト成功

変更
4ファイル
+86 / -21

[結果を見る]
[追加修正]
[差分を見る]
[閉じる]
```

---

## 15.6 エラー

```text
❌ Claude Codeジョブが停止しました

エラー
API rate limit

最後の処理
テスト実行前

[再試行]
[指示を入力]
[Webで確認]
[閉じる]
```

再試行は、同じコマンドを無条件に再実行するのではなく、Claude Codeへ次を送る。

```text
直前のエラー内容を確認し、安全に再試行できる場合は再試行してください。
再試行すべきでない場合は理由を説明してください。
```

---

# 16. Claudeイベント処理(旧: Claude Code Hooks)

Phase 0 で入力JSON・戻り値・timeout挙動を実測済み(`docs/capability-report.md` §6〜§10)。
SDK経由ではこれらをコールバックとして受け取るため、外部Hookプロセスは使わない。

使用するイベント:

* `system/init`(セッション開始、session_id確認)
* `canUseTool`(許可要求)
* `Stop`(応答完了、`last_assistant_message` 付き)
* `Notification`(`notification_type` 付き)
* `result`(ターン完了・エラー)

---

## 16.1 許可要求(canUseTool)

処理：

```text
Claude Code (SDK)
  ↓ canUseTool(toolName, input, suggestions)
Job Manager
  ↓ PendingAction作成 + Slackへ通知
ユーザーが許可または拒否
  ↓
Job Manager が Promise を resolve
  ↓
Claude Codeへ allow / deny を返す
```

最大待機時間は設定可能にする。

```env
PERMISSION_TIMEOUT_SECONDS=3600
```

期限切れ時は自動許可せず、denyを返してジョブを「判断待ち」にする。

実測済みの参考情報:

* Hook方式の場合のtimeoutデフォルトは600秒。timeout時は対話ダイアログへフォールバックし自動許可されない
* 許可要求入力には `tool_name` / `tool_input` に加え `permission_suggestions`(Claude自身の許可提案)が含まれ、Slackの「詳細」表示に使える

---

## 16.2 Stop(応答完了)

実測により、Stopイベントの入力に `last_assistant_message`(最終メッセージ全文)が
直接含まれることを確認済み。transcript解析は不要。
(ドキュメント外フィールドのため、欠落時は `transcript_path` のJSONL末尾を読むフォールバックを実装する。)

Stopだけでは「タスク完了」と「質問待ち」の区別が曖昧なため、MVPでは以下のように扱う。

```text
Claude Codeが応答を終了しました。
完了したか、追加指示を待っています。
```

Slack操作：

```text
[提案どおり続行]
[追加指示]
[完了として閉じる]
```

分類機能は後から追加する。

---

## 16.3 Notification

実測済みの入力: `message`(人間可読文字列)と `notification_type`。

公式ドキュメント記載の種別:

* `permission_prompt`(許可待ち)
* `idle_prompt`(入力待ち)
* `auth_success`
* `elicitation_*`(MCPのユーザー入力要求)

処理方針:

* `permission_prompt` は canUseTool と重複するため通知を抑制する
* `idle_prompt` は「判断待ち」通知に使う
* 完了は Notification ではなく Stop / result で扱う
* `notification_type` はドキュメント未記載フィールドのため、欠落時は `message` 文字列で判定する

---

# 17. Claudeへのメッセージ送信

## 17.1 実行中セッション(SDK)

実行中のジョブへは SDK の `streamInput()` で追加メッセージを送る。

## 17.2 アイドル状態のセッション(resume)

応答完了(Stop)後のジョブへは、`options.resume` + セッションID
(縮退運用では `claude -p --resume <sessionId> "<message>"`)で送る。
文脈が保持されることは実測確認済み。

同一セッションに対する resume の同時実行は排他制御する
(実行中プロセスがある session に並行して resume しない)。

入力例：

```text
提案どおり進めてください。
```

自由入力：

```text
B案で進めてください。ただし既存APIのレスポンス形式は変更しないでください。
```

入力文字数は最大4000文字とする。

Remote Control経由のメッセージ送信APIは存在しないため使用しない。

---

# 18. 同時実行

初期設定：

```env
MAX_CONCURRENT_JOBS=2
```

理由：

* MacBook ProのCPU・メモリ消費
* Claude Code API利用量
* 複数worktreeでの依存インストール
* 同時に多数の許可要求が発生する可能性

上限を超えたジョブは`queued`にする。

同一プロジェクトでの同時実行はデフォルト1件とする。

```env
MAX_CONCURRENT_JOBS_PER_PROJECT=1
```

専用worktreeを使っていても、DBやローカルサービスのポート競合が起きる可能性があるためである。

---

# 19. セキュリティ

## 19.1 Web認証

Tailscaleだけを利用する場合でも、アプリ内で最低限の認証を持たせる。

候補：

* パスキー
* ワンタイムログイン
* 長い管理用トークン
* Tailscale identity headerの検証

MVPでは長いランダムトークンでもよいが、URLクエリには含めない。

Cookieは以下を設定する。

```text
HttpOnly
Secure
SameSite=Strict
```

---

## 19.2 Slackユーザー制限

```env
ALLOWED_SLACK_USER_IDS=U0123456789
SLACK_CHANNEL_ID=C0123456789
```

許可されたユーザーとチャンネルだけ操作可能にする。

---

## 19.3 リポジトリ制限

操作対象はRepository Registryに登録されたパスだけとする。

`realpath`で解決後、登録パスと一致することを確認する。

シンボリックリンクによる登録範囲外への脱出を防止する。

---

## 19.4 シェル実行

禁止：

```ts
exec(`cd ${path} && ${command}`);
spawn(command, { shell: true });
```

使用：

```ts
execFile("git", ["-C", repositoryPath, "status", "--porcelain"]);
```

---

## 19.5 秘密情報マスキング

Slack、Web、ログへ表示する前に以下をマスクする。

```text
API_KEY
TOKEN
PASSWORD
SECRET
Authorization
Bearer
xoxb-
xapp-
sk-
private_key
client_secret
```

完全な検出は不可能であるため、READMEに注意事項を書く。

---

## 19.6 危険コマンド

危険性の高い操作には目立つ警告を表示する。

例：

```text
sudo
rm -rf
git push --force
git reset --hard
git clean -fd
npm publish
pnpm publish
terraform destroy
kubectl delete
DROP DATABASE
DROP TABLE
DELETE FROM
curl ... | sh
```

自動許可しない。

---

## 19.7 ブランチ保護

初期バージョンでは以下を禁止する。

* mainへの直接push
* masterへの直接push
* developへの直接push
* force push
* remote branch削除
* 本番デプロイ

---

# 20. Macのスリープ対策

MacがスリープするとClaude CodeやJob Managerが停止する可能性がある。

Job Manager起動時に`caffeinate`を利用できるようにする。

例：

```bash
caffeinate -dimsu pnpm start
```

LaunchAgentで常駐させる場合は、macOSのスリープ設定と電源接続時の動作をREADMEに記載する。

MacBookの蓋を閉じた状態で動作を継続できるかは、使用環境に依存するため保証しない。

Web画面にはMacの最終ハートビートを表示する。

```text
Mac状態
オンライン

最終確認
20秒前
```

一定時間ハートビートがなければ以下を表示する。

```text
Macがオフライン、スリープ、またはネットワーク切断状態の可能性があります。
```

---

# 21. 異常系

## 21.1 Slack切断

* Socket Mode再接続
* 未送信通知をキューへ保存
* 許可要求は自動許可しない
* Web管理画面では操作可能な状態を維持する

---

## 21.2 Webアクセス不能

Slack操作をフォールバックとして利用する。

---

## 21.3 Claude Codeプロセス消失

ジョブを`failed`または`orphaned`へ変更する。

PIDだけでプロセスを信用せず、起動時刻やセッション識別子も確認する。

---

## 21.4 Job Manager再起動

起動時に以下を確認する。

* `running`状態のジョブ
* PIDの存在(起動時刻も突合し、PID再利用を誤検知しない)
* `claude agents --json` の実行中セッション一覧との突合(実測でpid / sessionId / cwd / statusを取得可能)
* worktreeの存在
* トランスクリプト(`~/.claude/projects/<cwd-encoded>/<sessionId>.jsonl`)の存在

プロセスは失われたがトランスクリプトが残っているジョブは、resumeで再開可能として「判断待ち」に戻す。

復旧できないものは`orphaned`とする。

---

## 21.5 Git fetch失敗

古いローカルブランチを無断で使用しない。

ユーザーへ通知する。

```text
リモートブランチの更新に失敗しました。
ローカル状態のまま実行するか選択してください。
```

MVPでは安全のためジョブ開始を中止してもよい。

---

## 21.6 依存インストール失敗

Claude Codeへエラー内容を戻す。

Slackには要約だけ通知する。

---

# 22. ディレクトリ構成

```text
claude-remote-job-manager/
├── apps/
│   └── web/
│       ├── app/
│       │   ├── page.tsx
│       │   ├── projects/
│       │   ├── jobs/
│       │   │   ├── page.tsx
│       │   │   └── [jobId]/
│       │   ├── new/
│       │   └── api/
│       ├── components/
│       └── lib/
│
├── packages/
│   ├── core/
│   │   ├── jobs/
│   │   ├── projects/
│   │   ├── events/
│   │   └── types/
│   │
│   ├── claude/
│   │   ├── adapter.ts
│   │   ├── capabilities.ts
│   │   ├── sdk-adapter.ts
│   │   ├── process-adapter.ts
│   │   ├── mock-adapter.ts
│   │   ├── permission-broker.ts
│   │   └── event-schemas.ts
│   │
│   ├── git/
│   │   ├── repository.ts
│   │   ├── worktree.ts
│   │   ├── diff.ts
│   │   └── branch.ts
│   │
│   ├── slack/
│   │   ├── app.ts
│   │   ├── actions.ts
│   │   ├── modals.ts
│   │   ├── messages.ts
│   │   └── blocks/
│   │
│   ├── db/
│   │   ├── client.ts
│   │   ├── schema.ts
│   │   ├── migrations/
│   │   └── repositories/
│   │
│   ├── security/
│   │   ├── auth.ts
│   │   ├── authorization.ts
│   │   ├── redaction.ts
│   │   └── risk-detector.ts
│   │
│   └── config/
│       ├── env.ts
│       └── projects.ts
│
├── services/
│   └── job-worker/
│       ├── src/
│       └── package.json
│
├── config/
│   └── projects.example.yaml
│
├── slack/
│   └── manifest.yaml
│
├── launchd/
│   └── com.local.claude-remote.plist.template
│
├── data/
│   └── .gitkeep
│
├── scripts/
│   ├── setup.ts
│   ├── install-launch-agent.ts
│   ├── doctor.ts
│   └── uninstall.ts
│
├── .env.example
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── eslint.config.js
└── README.md
```

モノレポが過剰であれば、MVPでは単一アプリ構成に簡略化してよい。

ただし、Claude Adapter、Git Adapter、Slack、DBの境界は維持する。

---

# 23. 環境変数

```env
NODE_ENV=development

WEB_HOST=127.0.0.1
WEB_PORT=32146

DATABASE_PATH=./data/claude-remote.sqlite

SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_CHANNEL_ID=C...
ALLOWED_SLACK_USER_IDS=U...

WEB_AUTH_TOKEN=...

PROJECT_CONFIG_PATH=./config/projects.yaml
WORKTREE_ROOT=/Users/koki/.claude-remote/worktrees

CLAUDE_COMMAND=claude
GIT_COMMAND=git

MAX_CONCURRENT_JOBS=2
MAX_CONCURRENT_JOBS_PER_PROJECT=1
PERMISSION_TIMEOUT_SECONDS=3600

LOG_LEVEL=info
```

Zodで起動時に検証する。

---

# 24. CLI

## 24.1 起動

```bash
pnpm start
```

開発：

```bash
pnpm dev
```

---

## 24.2 doctor

```bash
pnpm doctor
```

確認内容：

* Node.js
* pnpm
* git
* Claude Code(バージョン 2.1.x 以上)
* Claude Agent SDK(canUseToolの動作確認)
* Remote Control(任意。起動中ならenvironment URLを表示)
* SQLite書き込み
* Repository Registry
* worktree root
* Slack接続
* `CLAUDE*` 系環境変数の混入警告(transcript保存が壊れるため)
* Tailscale状態
* Macスリープ設定の警告

---

## 24.3 プロジェクト検査

```bash
pnpm project:check mego-api
```

確認内容：

* パスが存在する
* Gitリポジトリ
* default branchが存在する
* remoteが存在する
* worktreeが利用可能
* Claude Codeが対象ディレクトリで起動可能

---

# 25. API

## 25.1 プロジェクト

```text
GET /api/projects
GET /api/projects/:projectId
```

---

## 25.2 ジョブ

```text
POST /api/jobs
GET /api/jobs
GET /api/jobs/:jobId
POST /api/jobs/:jobId/messages
POST /api/jobs/:jobId/cancel
POST /api/jobs/:jobId/retry
POST /api/jobs/:jobId/commit
DELETE /api/jobs/:jobId/worktree
```

---

## 25.3 差分

```text
GET /api/jobs/:jobId/diff
GET /api/jobs/:jobId/files
GET /api/jobs/:jobId/files/*
```

任意ファイルパスをそのまま受け取らず、job worktree配下であることを検証する。

---

## 25.4 内部Hook API(廃止)

旧設計の `/internal/hooks/*` エンドポイントは廃止する。
Claudeイベントは SDK コールバックとして Job Manager プロセス内で完結する(8.6参照)。

---

# 26. MVP

## 26.1 必須機能

1. Repository Registry
2. Web認証
3. プロジェクト一覧
4. 新規タスク画面
5. Git worktree作成
6. Claude Code起動(Agent SDK)
7. ジョブ一覧
8. ジョブ詳細
9. Slack Socket Mode
10. 開始通知
11. 許可要求通知(canUseTool)
12. 許可／拒否ボタン
13. 応答完了通知(Stop / result)
14. 追加指示Modal(streamInput / resume)
15. 完了通知
16. エラー通知
17. ジョブ停止
18. Git差分表示
19. SQLite状態管理
20. LaunchAgent設定
21. README
22. doctorコマンド

---

## 26.2 後回し

* 自動選択肢抽出
* LLMによる状態分類
* 自動コミットメッセージ生成
* Pull Request作成
* 自動マージ
* 複数Mac
* 音声入力
* 添付画像からのタスク作成
* GitHub Issue連携
* Sentry連携
* Slack Slash Command
* Slack App Home
* Web Push通知
* リアルタイム全ログ配信
* プロジェクトのWeb登録

---

# 27. 実装フェーズ

## Phase 0：成立性調査【完了 2026-07-28】

調査結果は`docs/capability-report.md`に記録済み。

主要な結論:

```text
1. Claude Code v2.1.220 で調査
2. headless(--print)では PermissionRequest Hook が発火しない(即deny)
   → 許可制御は Agent SDK の canUseTool を採用
3. Stop イベントに last_assistant_message が直接含まれる
4. --session-id でセッションIDを事前指定できる(取得ではなく指定)
5. Remote Control は利用可能だが URL は environment 単位・非対話起動不可
   → オプション機能に格下げ
6. tmux 不要(未インストールでもあった)
7. CLAUDE* 系環境変数の子プロセスへの継承に注意(transcript保存が壊れる)
```

---

## Phase 1：基盤

* プロジェクト初期化
* 環境変数
* SQLite
* Repository Registry
* ロギング
* doctorコマンド

---

## Phase 2：Web UI

* 認証
* プロジェクト一覧
* 新規タスク
* ジョブ一覧
* ジョブ詳細
* モバイル対応

この段階ではダミージョブで動作確認してよい。

---

## Phase 3：Git worktree

* worktree作成
* ブランチ作成
* 状態取得
* diff取得
* 削除
* 異常系テスト

---

## Phase 4：Claude Code起動

* Capability Detection(claudeバージョン・SDK動作確認)
* SdkClaudeAdapter / MockClaudeAdapter
* ジョブ起動(query + セッションID指定 + env サニタイズ)
* メッセージストリーム取得(system/init, assistant, result)
* 終了検知
* 停止(interrupt)
* 状態保存

---

## Phase 5：Slack

* Socket Mode
* 開始通知
* ボタン受信
* Modal
* 許可ユーザー制限
* 専用チャンネル制限

---

## Phase 6：許可・イベントフロー

* canUseTool → PendingAction → Slack通知 → 回答反映
* Stop(last_assistant_message)通知
* Notification(idle_prompt)通知
* 重複通知防止(permission_promptの抑制)
* PERMISSION_TIMEOUT_SECONDS(期限切れはdeny + 判断待ち)
* 追加指示(streamInput / resume + 排他制御)

---

## Phase 7：安定化

* LaunchAgent
* caffeinate
* 再起動復旧
* ログローテーション
* Slack再接続
* エラーハンドリング
* セキュリティ確認

---

# 28. テスト

## 28.1 単体テスト

* 環境変数検証
* Project ID検証
* repository path検証
* realpath検証
* worktree path生成
* branch name生成
* Git引数生成
* Claude引数生成
* Slackユーザー認証
* Slackチャンネル認証
* 秘密情報マスキング
* 危険コマンド検出
* Permission decision生成
* PendingAction二重回答防止
* 状態遷移
* timeout
* job recovery

---

## 28.2 結合テスト

* ダミーCLIをClaude Codeの代わりに起動
* 質問待ち
* 許可待ち
* 正常終了
* 異常終了
* 強制停止
* Job Manager再起動
* Slack二重クリック
* worktree作成と削除

---

## 28.3 E2E

Playwrightでモバイル幅を使用する。

シナリオ：

1. ログイン
2. プロジェクト選択
3. タスク入力
4. ジョブ開始
5. ジョブ詳細表示
6. 判断待ち
7. 追加指示
8. 完了
9. diff確認
10. worktree保持

---

# 29. 受け入れ条件

## シナリオA：外出先から開始

1. MacBook ProでJob Managerが起動している
2. スマートフォンが別ネットワークにいる
3. Web管理画面へアクセスする
4. MeGo APIを選ぶ
5. タスクを入力する
6. 実行開始する
7. Mac上でworktreeが作成される
8. Claude Codeが起動する
9. Slackへ開始通知が届く

---

## シナリオB：許可

1. Claude CodeがBash許可を求める
2. Slackへ通知が届く
3. 「今回のみ許可」を押す
4. Claude Codeが続行する
5. 同じボタンを再度押しても二重処理されない

---

## シナリオC：判断

1. Claude Codeがユーザー判断を求める
2. Slackへ通知が届く
3. 「指示を入力」を押す
4. 日本語で追加指示を送る
5. Claude Codeが回答を受け取り続行する

---

## シナリオD：完了

1. Claude Codeが修正を完了する
2. Slackへ完了通知が届く
3. Webで結果概要を確認できる
4. WebでGit差分を確認できる
5. 作業ブランチを保持できる
6. ベースブランチには自動マージされない

---

## シナリオE：停止

1. 実行中ジョブで停止を押す
2. 確認画面が表示される
3. 停止を確定する
4. Claude Codeプロセスが終了する
5. ジョブが`cancelled`になる
6. worktreeは勝手に削除されない

---

## シナリオF：不正アクセス

1. 未認証のWebアクセスが拒否される
2. 許可されていないSlackユーザーの操作が拒否される
3. 登録されていないパスでジョブを作成できない
4. Slack入力から任意シェルコマンドを直接実行できない

---

# 30. README

以下を記載する。

1. システム概要
2. アーキテクチャ
3. 必要環境
4. Claude Codeインストール
5. Remote Control設定(任意機能)
6. 許可フロー(canUseTool)の仕組み
7. Slack App作成
8. Socket Mode設定
9. Slack Manifest適用
10. Tailscale設定
11. Repository Registry
12. 環境変数
13. SQLite初期化
14. 開発起動
15. 本番起動
16. LaunchAgent
17. caffeinate
18. スマートフォンからのアクセス
19. 動作確認
20. セキュリティ上の注意
21. トラブルシューティング
22. バックアップ
23. アンインストール

---

# 31. 実装上の重要方針

* Phase 0の実測結果(docs/capability-report.md)を仕様の正とする
* Claude連携の主経路はAgent SDK(canUseTool / streamInput / resume)とする
* Remote Controlはオプション機能(environment URL提示のみ)とする
* Claude Code CLI/SDKのオプションを想像で実装しない(実装時に型定義・ヘルプで確認)
* 既存のClaude Code設定(~/.claude/settings.json等)を書き換えない
* Claude Code起動時に CLAUDE* 系環境変数をサニタイズする
* Slack回答の失敗時に自動許可しない
* 自動マージ・自動push・自動デプロイをしない
* 任意シェル実行APIを作らない
* 登録済みリポジトリだけを扱う
* 作業は原則専用worktreeで行う
* Web UIはスマートフォン操作を最優先する
* ボタン操作を自由入力より優先する
* 詳細操作はWeb、緊急操作はSlackに分ける
* 完成後は実際のセットアップ手順まで確認する

---

# 32. Claude Codeへの実装指示

この設計書に基づいて実装してください。

Phase 0の成立性調査は完了済みです(`docs/capability-report.md`)。
本設計書はその結果を反映済みのため、Phase 1から順に実装してください。

実装中にこの設計書と実際のCLI/SDKの挙動が食い違った場合は、
実測を正としてcapability-reportと設計書の両方を更新してください。

Slack Token、App Token、チャンネルID、ユーザーIDなど、利用者しか用意できない値は`.env.example`へ定義してください。

ユーザー固有値がなくても実装とテストを進められるよう、Slack AdapterとClaude Adapterにはモック実装を用意してください。

MVP完了時には、以下を必ず提示してください。

```text
- 作成した機能
- 未実装機能
- Slack Appの設定手順
- Tailscale経由でWeb画面を開く手順
- Repository Registryの設定方法
- Job Managerの起動方法
- LaunchAgentの設定方法
- スマートフォンからタスクを開始する手順
- 許可要求(canUseTool)の確認方法
- Git差分の確認方法
- 停止方法
- アンインストール方法
```

実装しただけで完了とせず、ダミーリポジトリを使って次のE2E確認を行ってください。

```text
1. Webからプロジェクトを選ぶ
2. タスクを送信する
3. worktreeを作成する
4. Claude CodeまたはモックCLIを起動する
5. Slackへ開始通知を送る
6. 許可要求へ回答する
7. 追加指示を送る
8. ジョブを完了させる
9. WebでGit差分を見る
10. worktreeを保持または破棄する
```

不明点が発生した場合、秘密情報や外部アカウント設定を除き、合理的な初期値を選択して進めてください。

大きな設計変更、自動マージ、自動push、外部公開方式の変更が必要な場合だけ、選択肢・メリット・リスク・推奨案を提示して判断を求めてください。
