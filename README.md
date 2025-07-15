# 文字スクロール動画ジェネレーター

ブラウザ上で動作するテキストスクロール動画ジェネレーター

**🎬 [デモを試す](https://cho45.stfuawsc.com/ticker-generator/)**

![サンプル動画](docs/dontpushtoproductiononfriday.gif)

## 特徴

- リアルタイムプレビュー
- フォント、色、サイズのカスタマイズ
- MP4出力
- ブラウザ完結
- (隠し機能) format=gif つけるとGIFで出力します

## 技術スタック

- Vue 3
- HTML5 Canvas
- ffmpeg.wasm
- Google Fonts

## 開発・実行

```bash
npm install
npx serve .
```

HTTP/HTTPSサーバー経由でアクセスが必要です。

## LICENSE

MIT
