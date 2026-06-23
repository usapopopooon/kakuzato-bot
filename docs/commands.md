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
/eventlog set channel:#server-log
/eventlog test
```
