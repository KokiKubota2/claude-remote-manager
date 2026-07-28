# Claude Code Remote Job Manager

## スマートフォンからClaude Codeタスクを起動・監視・操作するシステム設計書

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

許可要求は可能な限りClaude Codeの`PermissionRequest` Hookを使用して処理する。

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
│  │ Hook Receiver                     │  │
│  │ Git Worktree Manager              │  │
│  │ SQLite                            │  │
│  └──────────────┬────────────────────┘  │
│                 │                       │
│      ┌──────────▼──────────┐            │
│      │ Claude Code         │            │
│      │                     │            │
│      │ ・Remote Control    │            │
│      │ ・Hooks             │            │
│      │ ・CLI process       │            │
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
- 必要に応じてtmux

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

実装候補：

```text
RemoteControlClaudeAdapter
ProcessClaudeAdapter
TmuxClaudeAdapter
```

優先順位：

1. Remote Controlが現在の環境で利用可能なら使用
2. CLIプロセスを直接spawnして管理
3. 対話入力が必要な場合はtmuxまたはPTYを使用

Remote ControlのCLIオプションやセッションURL取得方法は、実装時点のClaude Code公式仕様とローカルCLIのヘルプで確認すること。

存在を確認せずにオプションを決め打ちしない。

---

## 8.5 Slack Bridge

責務：

* Socket Mode接続
* ジョブ開始通知
* PermissionRequest通知
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

## 8.6 Claude Code Hook CLI

Claude Code Hooksから呼び出される短命CLI。

例：

```bash
node /absolute/path/dist/hook-cli.js permission-request
node /absolute/path/dist/hook-cli.js notification
node /absolute/path/dist/hook-cli.js stop
node /absolute/path/dist/hook-cli.js stop-failure
node /absolute/path/dist/hook-cli.js session-start
node /absolute/path/dist/hook-cli.js session-end
```

標準入力からHook JSONを受け取り、ローカルJob Managerへ渡す。

通信候補：

1. Unix Domain Socket
2. localhost HTTP
3. SQLite

MVPではlocalhost HTTPでもよい。

```text
POST http://127.0.0.1:32145/internal/hooks/permission-request
POST http://127.0.0.1:32145/internal/hooks/notification
POST http://127.0.0.1:32145/internal/hooks/stop
```

外部インターフェースでは公開しない。

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

## 9.1 基本方針

Claude Codeを対象リポジトリまたは専用worktreeで起動し、最初のプロンプトとしてタスク本文を渡す。

概念例：

```ts
spawn(
  "claude",
  [
    "--print",
    taskPrompt,
  ],
  {
    cwd: worktreePath,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      CLAUDE_REMOTE_JOB_ID: jobId,
    },
  },
);
```

実際のCLI引数は現在のClaude Code CLI仕様に合わせる。

対話継続、Remote Control、セッション再開などに必要なオプションは、以下で検出する。

```bash
claude --version
claude --help
claude remote-control --help
```

CLIの存在しないオプションを仮定しない。

---

## 9.2 Remote Control優先

Remote Controlが利用できる場合は、次の目的で優先利用する。

* スマートフォンから詳細なClaudeセッションを開く
* Claudeとの継続会話
* 実行状況確認
* 公式UIでの権限操作
* Remote Control URLまたはセッション識別子の取得

ただし、独自Web画面から指定リポジトリでセッションを起動できるか、起動後のURLを機械的に取得できるかは、現在のCLI仕様を確認する。

機械的取得ができない場合は、Remote Control連携をオプション機能とし、独自のHooksとプロセス管理を継続使用する。

---

## 9.3 フォールバック

Remote Controlが利用できない場合は、Claude CodeをPTYまたはtmux内で起動する。

```text
Job Manager
  ↓
tmux new-session
  ↓
対象worktreeへcd
  ↓
claude起動
  ↓
SlackまたはWebからtmux send-keys
```

文字入力は必ず`execFile`を使用する。

```ts
await execFileAsync("tmux", [
  "send-keys",
  "-t",
  tmuxTarget,
  "-l",
  "--",
  message,
]);

await execFileAsync("tmux", [
  "send-keys",
  "-t",
  tmuxTarget,
  "Enter",
]);
```

ユーザー入力を`sh -c`へ渡さない。

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
    | "remote_control"
    | "process"
    | "tmux";

  claudeSessionId: string | null;
  remoteControlUrl: string | null;
  tmuxSessionName: string | null;
  processId: number | null;

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

Remote Control URLがない場合はボタンを表示しない。

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

## 15.3 PermissionRequest

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

# 16. Claude Code Hooks

使用候補：

* `SessionStart`
* `PermissionRequest`
* `Notification`
* `Stop`
* `StopFailure`
* `SessionEnd`

実装前に、ローカルにインストールされたClaude Codeのバージョンで利用可能なHook名、入力JSON、戻り値、timeout設定を確認する。

確認用：

```bash
claude --version
claude --help
```

加えてClaude Code公式ドキュメントを確認する。

---

## 16.1 PermissionRequest

許可確認は可能な限りHookの正式なdecisionレスポンスを利用する。

処理：

```text
Claude Code
  ↓
PermissionRequest Hook
  ↓
Hook CLI
  ↓
Job Manager
  ↓
Slackへ通知
  ↓
ユーザーが許可または拒否
  ↓
Job Manager
  ↓
Hook CLI
  ↓
Claude Codeへdecisionを返す
```

Hook CLIはSlack回答待ちの間だけ待機する。

最大待機時間は設定可能にする。

```env
PERMISSION_TIMEOUT_SECONDS=3600
```

期限切れ時は自動許可しない。

拒否またはClaude CodeのローカルUIへの安全なフォールバックを行う。

---

## 16.2 Stop

Claude Codeの応答完了時に、最終メッセージを取得できる場合はJob Managerへ送信する。

Stopだけでは「タスク完了」と「質問待ち」の区別が曖昧な可能性がある。

MVPでは以下のように扱う。

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

利用可能な通知種別を確認し、以下に相当するイベントを処理する。

* 入力待ち
* 許可待ち
* エージェント完了
* アイドル状態

PermissionRequestと同時に通知される場合は重複を除去する。

---

# 17. Claudeへのメッセージ送信

## 17.1 Remote Control

Remote Control APIまたはCLIで公式にメッセージ送信できる場合は、その方式を利用する。

---

## 17.2 PTY／tmux

公式経路が利用できない場合は、起動済みセッションへPTYまたはtmux経由で送信する。

入力例：

```text
提案どおり進めてください。
```

自由入力：

```text
B案で進めてください。ただし既存APIのレスポンス形式は変更しないでください。
```

入力文字数は最大4000文字とする。

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
* PIDの存在
* tmuxセッションの存在
* worktreeの存在
* Claudeセッションの存在

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
│   │   ├── remote-control-adapter.ts
│   │   ├── process-adapter.ts
│   │   ├── tmux-adapter.ts
│   │   └── hook-schemas.ts
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
│   ├── job-worker/
│   │   ├── src/
│   │   └── package.json
│   │
│   └── hook-cli/
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
│   ├── install-hooks.ts
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

INTERNAL_HOOK_HOST=127.0.0.1
INTERNAL_HOOK_PORT=32145

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
TMUX_COMMAND=tmux

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
* Claude Code
* Claude Codeバージョン
* Claude Code Remote Control
* tmux
* SQLite書き込み
* Repository Registry
* worktree root
* Slack接続
* Hooks設定
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

## 25.4 内部Hook

```text
POST /internal/hooks/session-start
POST /internal/hooks/permission-request
POST /internal/hooks/notification
POST /internal/hooks/stop
POST /internal/hooks/stop-failure
POST /internal/hooks/session-end
```

localhost以外からの接続を拒否する。

可能ならUnix Domain Socketへ移行する。

---

# 26. MVP

## 26.1 必須機能

1. Repository Registry
2. Web認証
3. プロジェクト一覧
4. 新規タスク画面
5. Git worktree作成
6. Claude Code起動
7. ジョブ一覧
8. ジョブ詳細
9. Slack Socket Mode
10. 開始通知
11. PermissionRequest通知
12. 許可／拒否ボタン
13. Stop通知
14. 追加指示Modal
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

## Phase 0：成立性調査

実装前に必ず確認する。

```text
1. Claude Codeのバージョン
2. claude --help
3. claude remote-control --help
4. 利用可能なHooks
5. Hook入力JSON
6. PermissionRequest戻り値
7. Hook timeout
8. Stop時に取得できるデータ
9. セッションID
10. Remote Control URLの取得方法
11. 非対話起動と対話継続の方法
```

調査結果を`docs/capability-report.md`へ記録する。

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

* Capability Detection
* Claude Adapter
* ジョブ起動
* 標準出力取得
* 終了検知
* 停止
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

## Phase 6：Hooks

* PermissionRequest
* Notification
* Stop
* StopFailure
* Slack回答反映
* 重複通知防止
* timeout

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
5. Remote Control確認
6. Claude Code Hooks設定
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

* まずPhase 0で現在のClaude Code仕様を検証する
* Remote Controlを無条件に前提としない
* Remote Controlが利用できる場合は積極的に活用する
* 利用できない処理はHooks、PTY、tmuxで補完する
* Claude Code CLIオプションを想像で実装しない
* 既存のClaude Code設定を破壊しない
* Hooks設定を書き換える前にバックアップする
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

最初にコードを書き始めるのではなく、Phase 0の成立性調査を行ってください。

以下を実際のローカル環境と公式ドキュメントで確認してください。

```text
- Claude Codeの現在のバージョン
- Remote Controlの利用可否
- Remote Controlセッションの起動方法
- セッションURLまたは識別子の取得方法
- 外部から既存セッションへメッセージを送る方法
- PermissionRequest Hookの入力と戻り値
- PermissionRequest Hookの最大待機時間
- Stop Hookで取得可能な最終メッセージ
- Notificationイベントの種類
- ClaudeセッションIDとジョブIDの紐づけ方法
- CLIプロセスを非対話で開始し、後から対話を継続する方法
```

調査結果を以下へ記録してください。

```text
docs/capability-report.md
```

各項目について、次の形式で記載してください。

```text
機能:
利用可否:
確認したコマンド:
確認した公式資料:
採用する実装方法:
フォールバック:
注意点:
```

調査後、実装計画を更新し、Phase 1から順に実装してください。

Slack Token、App Token、チャンネルID、ユーザーIDなど、利用者しか用意できない値は`.env.example`へ定義してください。

ユーザー固有値がなくても実装とテストを進められるよう、Slack AdapterとClaude Adapterにはモック実装を用意してください。

MVP完了時には、以下を必ず提示してください。

```text
- 作成した機能
- 未実装機能
- Slack Appの設定手順
- Tailscale経由でWeb画面を開く手順
- Repository Registryの設定方法
- Claude Code Hooksの設定方法
- Job Managerの起動方法
- LaunchAgentの設定方法
- スマートフォンからタスクを開始する手順
- PermissionRequestの確認方法
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
