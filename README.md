# 3地点お天気ナビ（tenki.jp版）

スマホ向けのPWA試作です。初期地点は八千代市、志村坂上、京橋（東京）です。

## データについて
- 予報データは日本気象協会の tenki.jp を使用します。
- tenki.jp には公開APIがなく、ブラウザから直接取得もできないため、GitHub Actions（`.github/workflows/update-weather.yml`）が毎時 `scripts/fetch_tenki.py` を実行し、市区町村ページから予報を読み取って `weather.json` を生成・コミットします。アプリはその `weather.json` を表示します（リアルタイム取得ではありません）。
- 表示地点は `places.json` で管理します。各地点の tenki.jp 市区町村ページURLを指定してください。志村坂上は板橋区、京橋は東京都中央区のページを使います。
- tenki.jp の利用条件は個人の範囲で確認してください。公開規模を拡大する場合は、データ提供元の最新の利用条件を必ず確認してください。

## PCで動作確認
1. ZIPを展開します。
2. Python 3がインストールされたPCで、フォルダ内を開いて次を実行します。
   `python -m http.server 8000`
3. ブラウザで `http://localhost:8000` を開きます。
4. `weather.json` を手元で作り直す場合は `python3 scripts/fetch_tenki.py` を実行します。

HTMLファイルを直接ダブルクリックしても、PWAの一部機能が正常に動かない場合があります。

## スマホで使う
スマホのホーム画面に追加するには、HTTPS対応のWebサーバーに配置してください。PCのlocalhostはスマホからそのまま開けません。GitHub Pagesなどに公開する場合は、リポジトリを公開することになるため、個人情報や秘密情報を含めないでください。

## 初期地点（tenki.jpのページ）
- 八千代市：https://tenki.jp/forecast/3/15/4510/12221/
- 志村坂上（板橋区）：https://tenki.jp/forecast/3/16/4410/13119/
- 京橋（東京）（中央区）：https://tenki.jp/forecast/3/16/4410/13102/
