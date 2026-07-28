# Claude Code Capability Report(Phase 0 成立性調査)

調査日: 2026-07-28
調査環境: macOS (Darwin 25.4.0) / Claude Code v2.1.220 (native build, arm64) / Claude Max サブスクリプション

本レポートは `docs/design.md` の Phase 0 で要求された成立性調査の結果である。
「実測」と記載した項目は、本マシン上で実際にコマンドを実行して確認した。

---

## 調査結果サマリー

| # | 調査項目 | 結果 |
|---|---|---|
| 1 | Claude Code バージョン | **2.1.220**(実測) |
| 2 | Remote Control 利用可否 | **利用可能**(実測。`claude remote-control` 実行・接続成功) |
| 3 | Remote Control 起動方法 | `claude remote-control [--name <name>]` または `claude --remote-control`。初回に対話確認 (y/n) あり |
| 4 | セッションURL/識別子の取得 | URL は端末出力に表示される(`https://claude.ai/code?environment=env_...`)。機械的取得は端末出力のパースが必要 |
| 5 | 既存セッションへのメッセージ送信 | **可能**(実測)。`claude -p --resume <session_id> "<msg>"` で対話モード起源のセッションも再開できる |
| 6 | 利用可能な Hooks | PermissionRequest / Stop / StopFailure / Notification / SessionStart / SessionEnd / PreToolUse / PostToolUse ほか(実測+バイナリ内文字列で確認) |
| 7 | PermissionRequest Hook 入出力 | **実測で確認**。入力: tool_name / tool_input / permission_suggestions 等。出力: `hookSpecificOutput.decision.behavior: "allow"` で実際にツール実行が許可された |
| 8 | PermissionRequest Hook の待機と timeout | per-hook で `timeout`(秒)設定可。**timeout 時は自動許可されず、通常の対話許可ダイアログにフォールバック**(実測) |
| 9 | Stop Hook で取得できる情報 | session_id / transcript_path / **last_assistant_message**(最終メッセージが直接入る)/ stop_hook_active 等(実測) |
| 10 | Notification イベント | `notification_type` フィールドあり。`permission_prompt`(許可待ち)を実測確認。他に idle 等 |
| 11 | 非対話起動と対話継続 | **可能**(実測)。`-p --output-format json` が session_id を返し、`-p --resume <id>` で継続。`--input-format stream-json` で 1 プロセス複数ターンも可 |
| 12 | ジョブID・セッションID・プロセスの紐づけ | **`--session-id <uuid>` でセッションIDを事前指定可能**(実測)。環境変数も Hook まで伝播(実測) |

**結論: 設計書のシステムは技術的に成立する。** ただし後述のとおり、headless(`-p`)モードでは PermissionRequest Hook が発火しない(即 deny される)という重大な制約があり、実行方式の選択に直結する。

---

## 1. Claude Code のバージョン

```text
機能: Claude Code CLI
利用可否: 利用可能
確認したコマンド: claude --version → 2.1.220 (Claude Code)
確認した公式資料: (ローカル実測)
採用する実装方法: doctor コマンドで 2.1.x 以上を要求し、起動時にバージョン検出する
フォールバック: なし(必須要件)
注意点: バイナリは ~/.local/bin/claude → ~/.local/share/claude/versions/2.1.220 のシンボリックリンク。自動更新でバージョンが変わるため、Capability Detection は起動ごとに行う
```

---

## 2. Remote Control の利用可否

```text
機能: Remote Control(claude.ai/code・モバイルアプリからローカルセッションを操作)
利用可否: 利用可能(実測で接続成功)
確認したコマンド:
  claude remote-control --help
  claude remote-control --name p0-feasibility-test(実行し Connected を確認)
確認した公式資料: https://code.claude.com/docs/en/remote-control.md
採用する実装方法: オプション機能として提供(設計書 9.2 の方針どおり)
フォールバック: Hooks + プロセス管理(本レポートの推奨主経路)
注意点: 下記参照
```

実測で確認した `claude remote-control` の仕様:

- サブスクリプション必須。対象ディレクトリで事前に workspace trust を承認しておく必要がある。
- **起動時に「Enable Remote Control? (y/n)」の対話確認がある**(PTY 経由で `y` を送れば通過できるが、完全な非対話起動は不可)。
- 接続後、端末に以下が表示される:
  ```text
  ·✔︎· Connected · hook-test · HEAD
      Capacity: 0/32 · New sessions will be created in the current directory
  Continue coding in the Claude mobile app or https://claude.ai/code?environment=env_XXXX...(マスク済み)
  ```
- URL は **セッション単位ではなく environment(接続環境)単位**。`?environment=env_...` を開くとそのマシン上でセッションを作成・操作できる。
- `--spawn <same-dir|worktree|session>` があり、**`--spawn=worktree` は Claude 側が自動で worktree を作る**(要 git リポジトリ)。
- `--session-id <id>` で既存セッションの再開、`--capacity <N>` で同時セッション数を制御できる。

**判断: Remote Control は「スマートフォンから公式UIで詳細操作する」用途には有効だが、本システムの主経路にはしない。**
理由: (1) URL 取得が TUI 出力のパース頼みで機械的取得の公式手段がない、(2) 起動確認プロンプトがある、(3) ジョブごとの独立セッション管理・Hook 連携・Slack 通知は独自機構が必要なことに変わりがない。設計書 9.2 の「機械的取得ができない場合はオプション機能とする」の条件に該当する。

---

## 3. Remote Control の起動方法

```text
機能: Remote Control の起動
利用可否: 利用可能
確認したコマンド: claude remote-control --help / 実起動
確認した公式資料: https://code.claude.com/docs/en/remote-control.md
採用する実装方法: ユーザーが手動で `claude remote-control` を起動する運用とし、Job Manager からの自動起動は MVP では行わない
フォールバック: —
注意点: 対話確認 (y/n) の存在。--spawn=worktree は本システムの Git Worktree Manager と競合しうるため併用しない
```

---

## 4. セッションURLまたは識別子の取得方法

```text
機能: Remote Control URL / セッション識別子の機械的取得
利用可否: 部分的に可能
確認したコマンド: claude remote-control 実行時の端末出力 / claude agents --json
確認した公式資料: https://code.claude.com/docs/en/remote-control.md(機械的取得のAPIは公式に文書化されていない)
採用する実装方法:
  - Remote Control URL: 起動出力から `https://claude.ai/code?environment=env_...` を正規表現で抽出(オプション機能)
  - セッションID: 自前起動では --session-id で「事前指定」するため取得不要
フォールバック: URL 抽出に失敗した場合は Remote Control 連携を無効化し、Web/Slack 経路のみで運用
注意点: environment URL は固定的(セッション単位ではない)。TUI の再描画で同じ行が繰り返し出力されるため、抽出はべき等に行う
```

補足: `claude agents --json` は実行中の全セッション(interactive / background)を JSON で返し、`pid` / `sessionId` / `cwd` / `status`(idle/busy)/ `state` が取得できる(実測)。プロセス監視・復旧判定に有用。

---

## 5. 既存セッションへメッセージを送る方法

```text
機能: 既存セッションへの追加メッセージ送信
利用可否: 利用可能(実測)
確認したコマンド:
  claude -p "..." --output-format json                → session_id 取得
  claude -p --resume <session_id> "..." --output-format json → 文脈を保持したまま応答
  (対話モード起源のセッションに対しても resume 成功を実測)
確認した公式資料: claude --help(--resume / --continue / --fork-session / --session-id)
採用する実装方法: ジョブがアイドル(Stop 後)のとき、追加指示は `claude -p --resume <session_id> "<指示>"` の新プロセスで送る
フォールバック: PTY 起動中のセッションには PTY への直接書き込み(tmux send-keys 相当)
注意点:
  - 実行中プロセスがある session に対して同時に resume しない(排他制御が必要)
  - resume は transcript(~/.claude/projects/<cwd-encoded>/<session_id>.jsonl)に依存する。
    後述の CLAUDE_CODE_CHILD_SESSION 環境変数が入っていると transcript 保存が無効になり resume 不能になる(実測でハマった)
```

---

## 6. 利用可能な Hooks

```text
機能: Claude Code Hooks
利用可否: 利用可能
確認したコマンド:
  実測: settings.json に各 Hook を設定し stdin JSON をログ収集
  バイナリ検証: strings <claude binary> | grep(イベント名の存在確認)
確認した公式資料:
  https://code.claude.com/docs/en/hooks.md
  https://code.claude.com/docs/en/agent-sdk/hooks.md
採用する実装方法: SessionStart / PermissionRequest / Notification / Stop / SessionEnd を使用
フォールバック: —
注意点: 設計書の「StopFailure」も実在する
```

バイナリ内に存在を確認した Hook イベント名(v2.1.220、本システムに関係するもののみ検索):

```text
PreToolUse, PostToolUse, PermissionRequest, Notification,
Stop, StopFailure, SubagentStop, UserPromptSubmit,
SessionStart, SessionEnd, PreCompact,
TaskCompleted, TeammateIdle, WorktreeCreate, WorktreeRemove
```

公式ドキュメントにはさらに多数のイベントがある(PostToolUseFailure, PostToolBatch, UserPromptExpansion, MessageDisplay, SubagentStart, PostCompact, PermissionDenied, Setup, TaskCreated, Elicitation 系, ConfigChange, FileChanged 等)が、本システムでは使用しない。

実測で発火を確認したもの:

| Hook | headless (-p) | 対話 (PTY) |
|---|---|---|
| SessionStart | ○ | ○ |
| PreToolUse | ○ | ○ |
| PostToolUse | ○ | ○ |
| **PermissionRequest** | **× 発火せず(ツールは即 deny)** | ○ |
| Notification (permission_prompt) | × | ○ |
| Stop | ○ | ○ |
| SessionEnd | ○ | ○ |

**最重要の発見: `-p`(headless)モードでは、許可が必要なツールは PermissionRequest Hook を経由せず即座に拒否され、`permission_denials` に記録される。** 「Slack で許可を待つ」フローを Hook で実現するには、対話モード(PTY)で起動するか、Agent SDK / `--permission-prompt-tool` を使う必要がある(§8・§13 参照)。

---

## 7. PermissionRequest Hook の入力と戻り値

```text
機能: PermissionRequest Hook による許可判断の外部化
利用可否: 利用可能(対話モードで実測)
確認したコマンド: PTY 起動した対話セッションで Bash(touch)を実行させ、Hook の stdin/stdout を記録
確認した公式資料: https://code.claude.com/docs/en/hooks.md / https://code.claude.com/docs/en/agent-sdk/hooks.md
採用する実装方法: Hook CLI が stdin JSON を Job Manager へ転送し、Slack 回答を decision として stdout に返す
フォールバック: timeout 時は対話ダイアログへフォールバック(自動許可なし)
注意点: headless モードでは発火しない
```

実測した入力 JSON(stdin):

```json
{
  "session_id": "56f2fdea-...",
  "transcript_path": "/Users/k.kubota/.claude/projects/<cwd-encoded>/<session_id>.jsonl",
  "cwd": "/path/to/workdir",
  "prompt_id": "cc00b627-...",
  "permission_mode": "default",
  "hook_event_name": "PermissionRequest",
  "tool_name": "Bash",
  "tool_input": {
    "command": "touch created-by-test.txt",
    "description": "Create a test file"
  },
  "permission_suggestions": [
    { "type": "addDirectories", "directories": ["..."], "destination": "session" },
    { "type": "setMode", "mode": "acceptEdits", "destination": "session" }
  ]
}
```

実測で動作を確認した戻り値(stdout、allow の場合):

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow",
      "updatedInput": { "command": "touch created-by-test.txt", "description": "..." }
    }
  }
}
```

この出力を返すと**対話ダイアログは表示されず、ツールが即実行された**(ファイル作成を確認)。

公式ドキュメント上の decision は `behavior: "allow" | "deny"` の二択で、PreToolUse と異なり **`ask` は存在しない**。deny 時は `"behavior": "deny"`(理由メッセージを添えられる)。「回答保留のまま Claude Code のローカルUIに委ねたい」場合は decision を返さず終了すればよい(timeout と同じフォールバック動作、§8 で実測)。

---

## 8. PermissionRequest Hook の待機時間と timeout

```text
機能: Hook の待機時間制御
利用可否: 利用可能(実測)
確認したコマンド: hook 設定に "timeout": 5 を指定し、30 秒 sleep する Hook で検証
確認した公式資料: https://code.claude.com/docs/en/agent-sdk/hooks.md(デフォルト timeout: 一般 Hook 600 秒、UserPromptSubmit 30 秒、MessageDisplay 10 秒。最大値の明示的制限は記載なし)
採用する実装方法: PermissionRequest Hook の timeout を PERMISSION_TIMEOUT_SECONDS に合わせて設定(例 3600)
フォールバック: timeout 後は Claude Code 標準の対話ダイアログが表示される(実測)
注意点: 下記参照
```

実測結果(timeout=5 秒、Hook は 30 秒 sleep):

1. Hook プロセスは 5 秒で**強制終了された**(sleep 完了ログが残らない)。
2. その後、**通常の対話許可ダイアログ(`Do you want to proceed? 1. Yes / 2. Yes, and always allow... / 3. No`)が表示された**。
3. **自動許可はされない**。ツールも実行されない(ファイル未作成を確認)。

設計書 16.1 の「期限切れ時は自動許可しない。ローカルUIへの安全なフォールバック」は**そのまま成立する**。Hook 内で Slack 回答を長時間ブロッキング待機する方式は、timeout を長く設定すれば実現可能(デフォルトは 600 秒のため、PERMISSION_TIMEOUT_SECONDS=3600 のような設定には per-hook timeout の明示指定が必須)。

---

## 9. Stop Hook で取得できる情報

```text
機能: 応答完了検知と最終メッセージ取得
利用可否: 利用可能(実測)
確認したコマンド: Stop Hook の stdin JSON をログ収集
確認した公式資料: https://code.claude.com/docs/en/hooks.md
採用する実装方法: Stop Hook の last_assistant_message をそのまま Slack 通知に使用
フォールバック: transcript_path の JSONL を末尾から読んで assistant メッセージを抽出
注意点: Stop は「タスク完了」と「質問して停止」を区別しない(設計書 16.2 の想定どおり)
```

実測した入力 JSON:

```json
{
  "session_id": "...",
  "transcript_path": "...",
  "cwd": "...",
  "prompt_id": "...",
  "permission_mode": "default",
  "hook_event_name": "Stop",
  "stop_hook_active": false,
  "last_assistant_message": "ファイルが正常に作成されました。...",
  "background_tasks": [],
  "session_crons": []
}
```

**`last_assistant_message` に最終メッセージ全文が直接含まれる**(実測)。設計書が想定していた「transcript を読んで最終メッセージを取得」は不要で、大幅に簡単になる。
なお公式ドキュメントの Stop Hook 入力スキーマには `last_assistant_message` が記載されていない(実測 v2.1.220 では存在)。ドキュメント外フィールドのため、フィールド欠落時は transcript_path の JSONL 末尾から assistant メッセージを読むフォールバックを実装しておく。

---

## 10. Notification イベントの種類

```text
機能: Notification Hook
利用可否: 利用可能(実測)
確認したコマンド: Notification Hook の stdin JSON をログ収集
確認した公式資料: https://code.claude.com/docs/en/agent-sdk/hooks.md
採用する実装方法: notification_type で分岐。permission_prompt は PermissionRequest と重複するため通知抑制(設計書 16.3 のとおり)
フォールバック: —
注意点: headless モードでは permission_prompt Notification は発火しない(許可待ち自体が発生しないため)
```

実測した入力 JSON(許可待ち時):

```json
{
  "session_id": "...",
  "transcript_path": "...",
  "cwd": "...",
  "prompt_id": "...",
  "hook_event_name": "Notification",
  "message": "Claude needs your permission",
  "notification_type": "permission_prompt"
}
```

公式ドキュメントに記載の通知イベント種別:

```text
permission_prompt   許可待ち
idle_prompt         入力待ち(アイドル)
auth_success        認証完了
elicitation_dialog / elicitation_complete / elicitation_response  MCPのユーザー入力要求まわり
```

注意: `notification_type` フィールド自体は公式ドキュメントに明記されていないが、実測(v2.1.220)では stdin JSON に含まれていた。判定は notification_type を第一とし、欠落時は `message` 文字列で判定するフォールバックを持たせる。設計書 16.3 の「入力待ち/許可待ち/完了/アイドル」のうち、完了は Notification ではなく Stop Hook で扱う。

---

## 11. 非対話起動した Claude Code と対話を継続する方法

```text
機能: 非対話起動 + 後からの対話継続
利用可否: 利用可能(実測)
確認したコマンド:
  claude -p "..." --output-format json          → session_id を含む JSON が返る
  claude -p --resume <id> "..."                 → 文脈保持で継続(実測: 前回の答え2に+10→12)
  (echo <user-json>; ...) | claude -p --input-format stream-json --output-format stream-json --verbose
                                                → 1 プロセスで複数ターン(実測)
確認した公式資料:
  https://code.claude.com/docs/en/headless.md
  https://code.claude.com/docs/en/agent-sdk/typescript.md(SDK の streamInput / resume)
採用する実装方法: §13 の推奨アーキテクチャ参照
フォールバック: PTY 起動 + 標準入力書き込み
注意点:
  - --output-format stream-json は --verbose がないと出力が空になる(実測でハマった)
  - stream-json 入力の形式: {"type":"user","message":{"role":"user","content":"..."}} を 1 行 JSON で送る
  - stream-json 出力には hook_started/hook_response、init(session_id)、assistant、result イベントが流れ、進行状況の機械的把握に使える
```

---

## 12. ジョブID・ClaudeセッションID・実行プロセスを紐づける方法

```text
機能: ジョブ ⇔ セッション ⇔ プロセスの対応付け
利用可否: 利用可能(実測)
確認したコマンド:
  claude -p "..." --session-id <自前生成UUID>   → そのUUIDがそのまま session_id になる(実測)
  CLAUDE_REMOTE_JOB_ID=job_001 claude ...       → 全 Hook の実行環境に環境変数が伝播(実測)
  claude agents --json                          → pid / sessionId / cwd / status の一覧(実測)
確認した公式資料: claude --help(--session-id)
採用する実装方法:
  1. Job Manager がジョブ作成時に UUID を生成し、--session-id で Claude Code に与える(決定的な 1:1 対応)
  2. spawn 時に CLAUDE_REMOTE_JOB_ID=<jobId> を環境変数で渡す → Hook CLI は env から jobId を、stdin から session_id を得るため照合が二重化できる
  3. プロセスは spawn の戻り値 PID + 起動時刻を DB に保存(設計書 21.3 のとおり PID 単独を信用しない)
フォールバック: session_id → jobId の対応表を SQLite に保存(--session-id が使えない場合)
注意点: transcript は ~/.claude/projects/<cwd をエンコードしたディレクトリ>/<session_id>.jsonl に保存される。worktree パスから transcript パスも決定的に導出できる
```

---

## 13. 推奨アーキテクチャ(調査結果に基づく実行方式の決定)

### 13.1 実行方式の選択肢と評価

| 方式 | 許可制御 | 追加指示 | 実装コスト | 評価 |
|---|---|---|---|---|
| A. `-p` 単発 + `--resume` 連鎖 | Hook 不可。settings の allow ルールのみ | ○(resume) | 低 | 許可フローが成立しない |
| B. PTY(または tmux)+ PermissionRequest Hook | ○(実測済) | ○(PTY 書き込み or アイドル時 resume) | 中 | 成立。ただし TUI 出力のパースが不要な設計にすべき |
| C. **Claude Agent SDK(TypeScript)** | ○(canUseTool コールバック) | ○(streaming input / resume) | 低〜中 | **推奨** |
| D. stream-json 直接制御(`--permission-prompt-tool` / control protocol) | ○ | ○ | 中〜高 | C の下位レイヤーを手書きする形。SDK があるなら不要 |

### 13.2 推奨: Claude Agent SDK を主経路にする

本システムは Node.js/TypeScript 常駐プロセス(Job Manager)が前提のため、CLI を spawn して PTY・Hook・プロセス管理を自作するより、**公式の Claude Agent SDK(`@anthropic-ai/claude-agent-sdk`)を Job Manager に組み込む方が単純かつ堅牢**である。

- `query()` がプロセス生成・stream-json 制御を内包する
- **`canUseTool` コールバックで許可要求を Promise として受け取れる** → Slack ボタン回答で resolve するだけ。Hook CLI・localhost HTTP・長時間ブロッキング Hook が全て不要になる
- session_id の取得(`system/init` メッセージ)・`options.resume` による再開・interrupt がプログラマブル
- `streamInput()` で実行中セッションへの追加メッセージ送信が可能
- Hooks も SDK 経由で(プロセス外部でなくコールバックとして)扱える

公式ドキュメント: https://code.claude.com/docs/en/agent-sdk/typescript.md
(docs-research 調査でも「複数ターン・詳細制御が必要な場合は CLI spawn より SDK 推奨」と確認)

この場合、設計書のコンポーネントのうち **Hook Receiver / Hook CLI / 内部 Hook HTTP API(8.6, 25.4)は丸ごと削除できる**。

### 13.3 フォールバック順位(設計書 8.4 の改訂案)

1. `SdkClaudeAdapter`(Agent SDK / canUseTool)← 主経路
2. `ProcessClaudeAdapter`(`-p --resume` 連鎖。許可は settings.json の allow ルールで事前定義できる範囲のみ)← SDK 不調時の縮退運用
3. Remote Control 連携はどちらとも独立したオプション機能(URL 提示のみ)

tmux アダプタは不要(§14-3 参照)。

---

## 14. 設計書への指摘事項

### 14-1. 技術的に成立しない/修正が必要な点

1. **「`--print` で起動して PermissionRequest Hook で許可を待つ」構成は成立しない(重大)。**
   設計書 9.1 は `spawn("claude", ["--print", taskPrompt])` を概念例とし、16.1 で PermissionRequest Hook による許可フローを想定しているが、実測では `-p` モードで PermissionRequest Hook は発火せず、許可が必要なツールは即 deny される。headless 起動と Hook 許可フローは両立しない。→ 対話モード(PTY)起動にするか、Agent SDK の canUseTool を使う(推奨)。

2. **Remote Control URL はセッション単位ではなく environment 単位。**
   設計書 13.2 の `remoteControlUrl` をジョブごとに保存する前提は成り立たない。マシン(接続)単位の URL を 1 つ保存し、全ジョブ共通で提示する形になる。

3. **Remote Control の完全な非対話起動は不可。**
   起動時に「Enable Remote Control? (y/n)」の確認がある。Job Manager からの自動起動を前提にしない(手動起動 + URL 抽出のオプション機能とする)。

4. **worktree ごとの workspace trust ダイアログ。**
   対話モードの Claude Code は新しいディレクトリで trust 確認を表示する(実測。自動化中にプロンプト入力がダイアログに吸われた)。ジョブごとに新規 worktree を作る設計では毎回これに当たる。`-p` モードや SDK では trust は確認されないため、これも SDK 採用の理由になる。PTY 経路を残す場合は trust ダイアログの自動応答処理が必須。

5. **Job Manager 自身の環境変数の伝播に注意。**
   `CLAUDECODE` / `CLAUDE_CODE_CHILD_SESSION` 等が子プロセスに渡ると transcript 保存が無効化され、`--resume` が壊れる(実測でハマった)。spawn 時に `CLAUDE*` 系環境変数をサニタイズすること。開発中に Claude Code の中から Job Manager をテストする場合に特に発生しやすい。

### 14-2. 過剰な点(削除・縮小できる)

1. **Hook Receiver / Hook CLI / 内部 Hook HTTP API(8.6, 25.4)一式。**
   Agent SDK の canUseTool・フックコールバックを使えば、短命 CLI + localhost HTTP + Unix Domain Socket の議論ごと不要になる。MVP の必須機能 22 項目のうち「PermissionRequest 通知」「Stop 通知」は SDK コールバック → Slack 直結で実装できる。

2. **Stop Hook からの transcript 解析。**
   `last_assistant_message` が Hook 入力(および SDK の result)に直接含まれるため、transcript JSONL の解析は不要。

3. **tmux アダプタ(8.4, 9.3, 17.2)。**
   tmux は本マシンに未インストールであり、SDK / stream-json / `--resume` で対話継続が完結するため、tmux 経路は丸ごと削除してよい。PTY 直接制御(node-pty)も SDK があれば不要。「アイドル時は `-p --resume` で追加指示を送る」だけで設計書 17 章の要件を満たす。

4. **ClaudeAdapter の 3 実装(RemoteControl / Process / Tmux)。**
   Remote Control はセッション制御 API を公開しておらず「アダプタ」になり得ない(URL 提示のみ)。実装すべきアダプタは実質 SdkClaudeAdapter 1 つ + テスト用モックで足りる。

### 14-3. より単純にできる点

1. **セッションIDは取得ではなく指定する。** `--session-id <uuid>`(SDK では options.sessionId 相当)でジョブIDから決定的に生成した UUID を与えれば、「セッションID取得→紐づけ」という工程自体が消える。

2. **`claude agents --json` を復旧判定に使える。** 再起動後の orphan 判定(21.4)は、PID テーブルとの突合に加えて `claude agents --json` の実行中セッション一覧で検証できる。

3. **待機ジョブの実行に `claude --bg` という選択肢がある。** バックグラウンドエージェント(`--bg` / `claude agents` / `claude logs <id>` / `claude stop <id>` / `claude attach <id>`)が存在する(実測)。ただし logs は ANSI 付き端末出力でパースに不向きなため、Job Manager 管理下のジョブには SDK を推奨。`--bg` は「手動運用の緊急脱出口」として README に記載する程度でよい。

4. **worktree 作成は自前実装でよいが、`claude -w`(--worktree)や remote-control の `--spawn=worktree` という公式機能もある。** MVP は設計書どおり自前の Git Worktree Manager(ブランチ命名・ベースブランチ制御・保持/破棄が要件のため)とし、公式機能には依存しない。

5. **危険コマンド検出(19.6)は permission_suggestions を活用できる。** PermissionRequest 入力に Claude Code 自身の許可提案(addDirectories / setMode 等)が含まれるため、Slack UI の「詳細」表示に流用できる。

---

## 15. 実測に使用した主な検証手順(再現用)

```bash
# 1. バージョン・ヘルプ
claude --version
claude --help
claude remote-control --help

# 2. headless + session_id
claude -p "1+1の答えだけを数字で返してください" --output-format json --model haiku
# → {"session_id":"7a0b802f-...","result":"2",...}

# 3. resume による継続
claude -p --resume 7a0b802f-... "先ほどの答えに10を足した数だけを返してください" --output-format json
# → result: "12"(文脈保持を確認)

# 4. Hook 検証: 全 Hook の stdin をログするスクリプトを settings.json に登録し、
#    headless / PTY(python pty モジュール)の両方で Bash(touch)を実行させて比較

# 5. PermissionRequest allow decision:
#    Hook stdout に {"hookSpecificOutput":{"hookEventName":"PermissionRequest",
#    "decision":{"behavior":"allow","updatedInput":{...}}}} を返し、ツールが実行されることを確認

# 6. timeout 検証: hook 設定 "timeout": 5 + sleep 30 の Hook
#    → 5 秒で Hook 強制終了 → 対話ダイアログにフォールバック、自動許可なし

# 7. セッションID事前指定
claude -p "OKとだけ返してください" --session-id <uuid> --output-format json
# → 指定した UUID がそのまま session_id になる

# 8. stream-json 複数ターン
(echo '{"type":"user","message":{"role":"user","content":"1+1は?"}}'; sleep 15) | \
  claude -p --input-format stream-json --output-format stream-json --verbose

# 9. Remote Control(PTY 経由で y を応答)
claude remote-control --name p0-feasibility-test
# → https://claude.ai/code?environment=env_... が出力される

# 10. バックグラウンドエージェント
claude --bg "..." / claude agents --json / claude logs <id> / claude stop <id>
```

---

## 16. 公式ドキュメント参照(索引)

docs-research(公式ドキュメント調査エージェント)による確認結果の索引。

| トピック | URL |
|---|---|
| Hooks リファレンス | https://code.claude.com/docs/en/hooks.md |
| Hooks(Agent SDK 版・イベント一覧/timeout) | https://code.claude.com/docs/en/agent-sdk/hooks.md |
| Headless / print モード | https://code.claude.com/docs/en/headless.md |
| Remote Control | https://code.claude.com/docs/en/remote-control.md |
| Agent SDK (TypeScript) | https://code.claude.com/docs/en/agent-sdk/typescript.md |
| Permissions(settings.json の allow/deny/ask) | https://code.claude.com/docs/en/permissions.md |
| Settings(env キー) | https://code.claude.com/docs/en/settings.md |

### 16.1 公式ドキュメントと実測の食い違い(v2.1.220)

実装時は「実測が正、ドキュメントは追従遅れの可能性あり」として、以下はランタイム検証(doctor / Capability Detection)でカバーする。

| 項目 | 公式ドキュメント | 実測 (v2.1.220) |
|---|---|---|
| Stop Hook の `last_assistant_message` | 記載なし | **存在する**(全文が入る) |
| Notification の `notification_type` | 記載なし(message で判定と読める) | **存在する**(`permission_prompt` を確認) |
| PermissionRequest 入力の `tool_name` / `tool_input` / `permission_suggestions` | 最小スキーマのみ記載 | **存在する** |
| `--permission-prompt-tool` | 記載なし | バイナリ内に実在(隠しオプション)。依存しない |
| Hook への環境変数伝播 | 明示的記載なし | **親プロセスの env が Hook に継承される**(Unix 標準どおり) |
| headless での PermissionRequest Hook | 明示的記載なし | **発火しない**(許可が必要なツールは即 deny) |

---

## 17. Phase 0 の結論

1. **設計書のシステムは成立する。** 必須ゴール(3.1)を阻む致命的な欠落はない。
2. ただし実行方式は設計書 9.1 の「`--print` で起動 + PermissionRequest Hook」から、**「Claude Agent SDK(canUseTool / streamInput / resume)を主経路とする」構成へ変更すべき**(§13・§14-1-1)。
3. これに伴い Hook CLI / Hook Receiver / 内部 Hook HTTP API / tmux アダプタは MVP から削除できる(§14-2)。設計は当初想定より単純になる。
4. Remote Control は成立するがオプション機能(URL 提示のみ)に留める(§2)。
5. 次のステップ: 設計書 8.4 / 8.6 / 9 / 16 / 25.4 を本レポートに合わせて改訂したうえで Phase 1 に進む。
