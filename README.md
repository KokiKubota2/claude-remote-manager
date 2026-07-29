# Claude Remote Job Manager

スマートフォンのWeb画面からMacBook上のClaude Codeジョブを起動・監視し、Slackから通知・許可・追加指示を行うローカル実行システム。

- 設計書: [docs/design.md](docs/design.md)
- Phase 0 成立性調査: [docs/capability-report.md](docs/capability-report.md)

## アーキテクチャ

```text
スマートフォン ──HTTPS──> MacBook (Next.jsサーバー 1プロセス)
  Web管理画面                ├ Web UI / API(認証つき)
  Slack                      ├ Job Manager(常駐・キュー・状態遷移)
                             ├ Permission Broker(許可の仲介)
                             ├ Slack Bridge(Socket Mode・公開URLなし)
                             ├ Git Worktree Manager
                             └ SQLite
                                  │ Claude Agent SDK (canUseTool / resume)
                                  └ Claude Code → ジョブ専用 git worktree
```

- ジョブごとに専用worktree(`~/.claude-remote/worktrees/<project>/<job>`)を作成し、既存の作業ディレクトリに影響を与えない
- 許可要求はSlackボタンまたはWeb画面から回答する。無回答・タイムアウト時は**必ず拒否**(自動許可なし)
- 自動push・自動マージ・自動デプロイは行わない

## 必要環境

- macOS / Node.js 22+ / pnpm 9+ / git
- Claude Code 2.1+(`claude --version` で確認)+ サブスクリプションでログイン済み
- (任意)Slackワークスペース、Tailscale

## セットアップ

```bash
git clone https://github.com/KokiKubota2/claude-remote-manager.git
cd claude-remote-manager
pnpm install
pnpm setup        # .env(トークン自動生成)と config/projects.yaml を作成
```

### 1. Repository Registry

`config/projects.yaml` にClaude Codeを実行してよいリポジトリを登録する。**ここに登録したパス以外は一切操作されない。**

```yaml
projects:
  - id: my-api          # kebab-case
    name: My API
    path: /Users/you/develop/my-api   # 絶対パス
    defaultBranch: develop
    packageManager: pnpm
    enabled: true
```

各リポジトリは `origin` リモートを持ち、`defaultBranch` がリモートに存在する必要がある(ジョブ開始時に `git fetch origin` する)。

### 2. Slack App(任意。未設定でもWebのみで動作)

1. https://api.slack.com/apps → **Create New App** → **From an app manifest** → `slack/manifest.yaml` を貼り付け
2. **App-Level Token** を作成(scope: `connections:write`)→ `SLACK_APP_TOKEN`(xapp-)
3. **Install to Workspace** → `SLACK_BOT_TOKEN`(xoxb-)
4. 通知用チャンネル(例 `#claude-remote`)を作りBotを招待、チャンネルIDを `SLACK_CHANNEL_ID` へ
5. 自分のSlackユーザーIDを `ALLOWED_SLACK_USER_IDS` へ(このユーザー以外の操作はすべて拒否される)

### 3. 環境変数(.env)

`pnpm setup` が生成した `.env` を確認。主な項目:

| 変数 | 説明 |
|---|---|
| `WEB_AUTH_TOKEN` | Webログイン用トークン(32文字以上。setupが自動生成) |
| `WEB_BASE_URL` | Slack通知内リンクのベースURL(例 `http://macbook-name:32146`) |
| `SLACK_*` | Slack設定(未設定ならモック動作) |
| `PERMISSION_TIMEOUT_SECONDS` | 許可要求の最大待機秒数(超過で拒否。既定3600) |
| `MAX_CONCURRENT_JOBS` / `MAX_CONCURRENT_JOBS_PER_PROJECT` | 同時実行数(既定 2 / 1) |
| `CLAUDE_JOB_MODEL` | ジョブ用モデル(例 `haiku`。空ならClaude Codeのデフォルト) |
| `CLAUDE_ADAPTER` | `mock` にするとClaudeなしで動作確認できる |

### 4. 動作確認と起動

```bash
pnpm doctor       # 環境チェック(Claude Codeバージョン、DB、Registry等)
pnpm build
pnpm start        # http://127.0.0.1:32146
```

開発時は `pnpm dev`。

### 5. スマートフォンからのアクセス(Tailscale推奨)

1. MacとスマートフォンにTailscaleを導入し同一Tailnetへ
2. `.env` の `WEB_HOST=0.0.0.0` に変更(Tailscale経由でのみ到達可能にするなら `WEB_HOST=<TailscaleのIP>` を推奨)
3. スマートフォンで `http://<macのTailscale名>:32146` を開き、`WEB_AUTH_TOKEN` でログイン

ポート開放は不要。公開インターネットには露出しない。Cloudflare Tunnelを使う場合は必ずCloudflare Accessで保護すること。

### 6. 常駐化(LaunchAgent + caffeinate)

```bash
pnpm launchagent:install    # caffeinate -dims 経由で常駐、ログはlogs/へ
pnpm launchagent:uninstall  # 解除
```

注意: MacBookの蓋を閉じた状態での動作は電源接続・macOS設定に依存する。`システム設定 > バッテリー > 電源アダプタ接続時にスリープしない` を推奨。

## 使い方

### ターミナルから始めて、外出先のスマホで判断する

`crm` CLIで起動したジョブは管理下ジョブになるため、**Macのターミナルで始めたタスクの許可・追加指示をスマホやSlackから行える**。

```bash
# 一度だけ: PATHへ登録
ln -s /path/to/claude-remote-manager/bin/crm /usr/local/bin/crm

# 対象リポジトリのディレクトリで(プロジェクトは自動判定)
crm run "認証まわりのテストが落ちているので調査して直して"
```

ターミナルには進捗・Claudeのメッセージ・許可要求が流れる。そのまま外出してよい:

- 許可要求 → スマホのWeb画面/Slackの「今回のみ許可」で回答すると、Macで実行が続行される
- 判断・追加指示 → Slackの「追加修正」Modal、Webの追加指示欄、または `crm say "<指示>"`
- ターミナルを閉じてもジョブは止まらない(`crm watch` で再表示、`crm list` で一覧)

```text
crm run <タスク>     ジョブ開始(--investigate 調査のみ / --test / --commit / --detach)
crm say [id] <指示>  追加指示
crm watch [id]       進捗表示
crm allow / deny     許可要求への回答(ターミナル側から答える場合)
crm stop [id]        停止
crm list             一覧
```

### Web画面から始める

1. **タスク開始**: Web画面 → 新しいタスク → プロジェクト選択 → 依頼内容入力 → 開始。専用worktreeが作られClaude Codeが起動、Slackに開始通知が届く
2. **許可**: Claudeがツール実行許可を求めるとSlackに🔐通知。`今回のみ許可` / `拒否` / `詳細`。Slackが使えない時はWebのジョブ詳細画面からも回答できる。危険コマンド(sudo, rm -rf, force push等)には警告と確認ダイアログが付く
3. **完了**: ✅通知。Webで結果要約・Git差分(ファイル単位、展開可)を確認
4. **追加指示**: Slackの`追加修正`ボタン(Modal)またはWebの追加指示欄から送信。同一セッションを`resume`するため文脈が保持される
5. **停止**: Web/Slackの停止ボタン(確認つき)。worktreeは削除されない
6. **後始末**: ジョブ詳細から「コミット作成」またはworktree破棄(ブランチ保持可)。自動マージはしない
7. **ローカルセッション監視**: ターミナルから起動したClaude Codeセッションも「ローカルセッション」画面で一覧・監視できる(読み取り専用: 状態・作業ディレクトリ・最後のメッセージ)。セッションが実行中→入力待ちに変わるとSlackへ💤通知が届く。操作したい場合はターミナルまたは `claude remote-control` を使う

## セキュリティ上の注意

- 操作できるのは登録済みリポジトリのみ(realpath検証・パストラバーサル対策済み)
- Slack操作は許可ユーザー+専用チャンネルのみ。ボタンvalueにコマンドを含めない
- 表示前に秘密情報の簡易マスキングを行うが、**完全な検出は不可能**。秘密情報を扱うリポジトリでの利用は注意
- 許可要求の失敗・タイムアウト・再起動時はすべて「拒否」に倒れる(自動許可なし)
- Claudeへのプロンプトでpush/デプロイ/秘密情報出力を禁止しているが、最終的な防御は許可フローでの人間の判断

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| ジョブが `Not logged in` で失敗 | サーバーを起動したシェルでClaude Codeにログインしているか確認(`claude` を一度起動)。`env -i` などでHOME/キーチェーン情報を落とさない |
| ジョブが「worktree作成に失敗: fetch failed」 | 対象リポジトリに `origin` があるか、ネットワークが有効か確認 |
| resumeできない / セッションが見つからない | `pnpm doctor` でCLAUDE*環境変数の混入警告を確認(Claude Code内から起動しない) |
| Slack通知が来ない | `.env` のSLACK_*が揃っているか。未設定時はモック動作(ログのみ) |
| 再起動後にジョブが「判断待ち」になっている | 正常動作。実行中に再起動されたジョブはセッションが残っていれば追加指示で再開できる |

## 再起動時の復旧

Job Manager起動時に実行中扱いのジョブを検査する:

- セッション記録(トランスクリプト)が残っていれば → `waiting_input`(追加指示で再開可能)
- 残っていなければ → `orphaned`
- 未回答の許可要求はすべて失効(自動許可しない)

## バックアップ / アンインストール

- データはすべて `data/claude-remote.sqlite`(+ `config/projects.yaml`, `.env`)。この3つをコピーすればバックアップ完了
- アンインストール: `pnpm launchagent:uninstall` → リポジトリ削除 → `~/.claude-remote/worktrees` を削除(必要なブランチはリポジトリ側に残る)

## 開発

```bash
pnpm test        # 単体・結合テスト(実gitリポジトリ・モックClaude使用)
pnpm e2e         # Playwright E2E(iPhoneビューポート・mockアダプタ・要 playwright install)
pnpm lint
pnpm --filter @claude-remote/core typecheck
CLAUDE_ADAPTER=mock pnpm dev   # Claudeなしで画面開発
```

## 実装状況(MVP)

実装済み: Repository Registry / Web認証 / プロジェクト一覧 / 新規タスク / worktree作成 / Claude起動(Agent SDK) / ジョブ一覧・詳細 / Slack Socket Mode / 開始・完了・エラー通知 / 許可要求通知+許可・拒否ボタン(二重回答防止) / 追加指示Modal / ジョブ停止 / Git差分表示 / SQLite / LaunchAgent / doctor / 再起動復旧 / 画面の自動更新 / Playwright E2E / Slack切断時の通知キュー(ライフサイクル通知の再送)

未実装(設計書 §26.2 の後回し項目): 自動状態分類 / PR作成 / 音声入力 / Web Push / プロジェクトのWeb登録 ほか
