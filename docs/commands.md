# コマンド一覧

すべてのコマンドはサーバー内専用です。実行にはサーバーの管理者権限が必要です。

## `/activity`

Bot の「プレイ中」表示を管理します。設定は Bot 全体で共通です。

| コマンド           | 引数   | 説明                                                            |
| ------------------ | ------ | --------------------------------------------------------------- |
| `/activity set`    | `name` | Bot のプレイ中表示を設定し、即時反映します。最大 128 文字です。 |
| `/activity status` | なし   | 現在のプレイ中表示を確認します。                                |
| `/activity reset`  | なし   | プレイ中表示をデフォルトの `サーバーを管理中。` に戻します。    |

設定は `data/bot-activity-config.json` に保存されます。

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

本文が Discord のメッセージ上限を超える場合は、送信時に 2000 文字以内へ省略されます。設定は `data/welcome-configs.json` に保存されます。

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

`/sticky embed` の色は入力画面で `FF0000`、`#00FF00`、`0x3366FF` の形式で指定できます。設定は `data/sticky-message-configs.json` に保存されます。

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

設定は `data/event-log-configs.json` に保存されます。

## 初期設定例

```text
/activity set name:サーバーを管理中。
/welcome set channel:#welcome
/welcome message content:Welcome, {mention}!
/welcome test
/sticky text channel:#notice
/eventlog set channel:#server-log
/eventlog test
```
