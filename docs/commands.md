# コマンド一覧

すべてのコマンドはサーバー内専用です。実行にはサーバーの管理者権限が必要です。

## `/activity`

Bot の「プレイ中」表示を管理します。設定は Bot 全体で共通です。

| コマンド           | 引数   | 説明                                                            |
| ------------------ | ------ | --------------------------------------------------------------- |
| `/activity set`    | `name` | Bot のプレイ中表示を設定し、即時反映します。最大 128 文字です。 |
| `/activity status` | なし   | 現在のプレイ中表示を確認します。                                |
| `/activity reset`  | なし   | プレイ中表示をデフォルトの `サーバーを管理中。` に戻します。    |

設定は PostgreSQL に保存されます。

## `/welcome`

サーバー参加時に送信する welcome 画像と本文を管理します。

| コマンド           | 引数      | 説明                                                                 |
| ------------------ | --------- | -------------------------------------------------------------------- |
| `/welcome set`     | `channel` | welcome 画像の送信先チャンネルを設定し、welcome 投稿を有効にします。 |
| `/welcome message` | `content` | welcome 画像と一緒に送る本文を設定します。最大 1500 文字です。       |
| `/welcome status`  | なし      | welcome 投稿の有効状態、送信先、本文を確認します。                   |
| `/welcome test`    | なし      | 設定済みチャンネルにテスト投稿します。                               |
| `/welcome disable` | なし      | welcome 投稿を無効にします。                                         |

`/welcome message` で使えるプレースホルダー:

| プレースホルダー | 内容                           |
| ---------------- | ------------------------------ |
| `{mention}`      | 参加したユーザーへのメンション |
| `{username}`     | 参加したユーザーのユーザー名   |
| `{displayName}`  | サーバー内での表示名           |
| `{guildName}`    | サーバー名                     |
| `{memberCount}`  | 現在のメンバー数               |

本文が Discord のメッセージ上限を超える場合は、送信時に 2000 文字以内へ省略されます。設定は PostgreSQL に保存されます。

## `/sticky`

チャンネルの最新位置に固定表示される sticky メッセージを管理します。対象チャンネルに新しい投稿があると、指定秒数後に古い sticky メッセージを削除し、同じ内容を再投稿します。

| コマンド         | 引数                       | 説明                                                                                               |
| ---------------- | -------------------------- | -------------------------------------------------------------------------------------------------- |
| `/sticky text`   | `channel`, `delay_seconds` | テキスト形式の sticky メッセージを設定します。本文は表示される入力画面で複数行入力できます。       |
| `/sticky embed`  | `channel`, `delay_seconds` | Embed 形式の sticky メッセージを設定します。タイトル、色、説明文は表示される入力画面で指定します。 |
| `/sticky status` | `channel`                  | sticky メッセージ設定を確認します。                                                                |
| `/sticky remove` | `channel`                  | sticky メッセージを解除し、現在表示中の sticky メッセージも削除します。                            |

sticky メッセージ本文と Embed 説明文は、入力画面のテキストエリアでそのまま複数行にできます。

`delay_seconds` は 1 秒から 3600 秒まで指定できます。省略時は 5 秒です。

`/sticky embed` の色は入力画面で `FF0000`、`#00FF00`、`0x3366FF` の形式で指定できます。設定は PostgreSQL に保存されます。

## `/bump`

DISBOARD とディス速報の bump 成功を検知し、2 時間後にリマインドします。bump 実行者が `Server Bumper` ロールを持っている場合のみリマインダーを設定します。

| コマンド                  | 引数 | 説明                                                                       |
| ------------------------- | ---- | -------------------------------------------------------------------------- |
| `/bump setup`             | なし | 実行したチャンネルを bump 監視チャンネルに設定します。履歴同期も行います。 |
| `/bump status`            | なし | 監視チャンネル、サービス別の通知状態、通知ロール、次回時刻を表示します。   |
| `/bump sync`              | なし | 監視チャンネル履歴から前回 bump を判定して次回通知を設定します。           |
| `/bump sync-from-history` | なし | `/bump sync` と同じです。                                                  |
| `/bump disable`           | なし | bump 監視とリマインダーを停止します。                                      |

通知メッセージや `/bump status` に表示されるボタンから、サービスごとの通知 ON/OFF と通知先ロールを変更できます。ロール未設定時は `Server Bumper`、該当ロールがない場合は `@here` で通知します。設定とリマインダーは PostgreSQL に保存されます。

## `/automod`

サーバー参加時の AutoMod を管理します。アバター未設定ユーザーと、作成から指定期間未満のアカウントを検知し、BAN/KICK/タイムアウトを実行できます。

| コマンド                       | 引数                                   | 説明                                                                  |
| ------------------------------ | -------------------------------------- | --------------------------------------------------------------------- |
| `/automod log set`             | `channel`                              | AutoMod 実行ログの送信先チャンネルを設定します。                      |
| `/automod log disable`         | なし                                   | AutoMod 実行ログのチャンネル送信を無効にします。DB 保存は継続します。 |
| `/automod no-avatar set`       | `action`, `timeout_minutes`            | アバター未設定ユーザーへの AutoMod を有効にします。                   |
| `/automod no-avatar disable`   | なし                                   | アバター未設定ルールを無効にします。                                  |
| `/automod account-age set`     | `minutes`, `action`, `timeout_minutes` | 作成から指定分数未満のアカウントへの AutoMod を有効にします。         |
| `/automod account-age disable` | なし                                   | アカウント作成期間ルールを無効にします。                              |
| `/automod status`              | なし                                   | AutoMod のログ送信先とルール設定を確認します。                        |

`action` は `BAN`、`KICK`、`タイムアウト` から選択します。`timeout_minutes` は action がタイムアウトの場合だけ使われ、省略時は 60 分です。

設定時に、選択した action に必要な Bot 権限も確認します。AutoMod の設定、ルール、実行ログは PostgreSQL に保存されます。実行ログには成功/失敗ステータスも記録されます。

## `/eventlog`

サーバー内イベントのログ送信を管理します。

| コマンド             | 引数                  | 説明                                                                 |
| -------------------- | --------------------- | -------------------------------------------------------------------- |
| `/eventlog set`      | `channel`             | イベントログの送信先チャンネルを設定し、イベントログを有効にします。 |
| `/eventlog category` | `category`, `enabled` | カテゴリ単位でイベントログの送信を切り替えます。                     |
| `/eventlog status`   | なし                  | イベントログの有効状態、送信先、有効カテゴリを確認します。           |
| `/eventlog test`     | なし                  | 設定済みチャンネルにテストログを送信します。                         |
| `/eventlog disable`  | なし                  | イベントログを無効にします。                                         |

`/eventlog category` のカテゴリ:

| 値           | 表示名         |
| ------------ | -------------- |
| `message`    | メッセージ     |
| `member`     | メンバー       |
| `moderation` | モデレーション |
| `server`     | サーバー変更   |
| `voice`      | ボイス         |

設定は PostgreSQL に保存されます。

## 初期設定例

```text
/activity set name:サーバーを管理中。
/welcome set channel:#welcome
/welcome message content:Welcome, {mention}!
/welcome test
/sticky text channel:#notice
/bump setup
/automod log set channel:#server-log
/automod account-age set minutes:1440 action:BAN
/eventlog set channel:#server-log
/eventlog test
```
