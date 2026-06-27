# kamakura-sim

「KAMAKURA SIM. | UNYIELDING FATE」 — 鎌倉沿岸津波避難マルチエージェントシミュレーション研究の紹介サイトです。

公開URL: https://masatosprojects.github.io/kamakura-sim/

## このリポジトリについて

南海トラフ巨大地震を想定し、鎌倉沿岸（由比ヶ浜・材木座・七里ガ浜）における津波避難行動を、約62,300人の仮想避難者（エージェント）でシミュレーションした研究プロジェクトの紹介サイトです。

主な発見である「混雑の罠」（マップ認知率が上がるほど生存率が下がる逆説）や、その知見を実装した避難ナビアプリ「TENDEN」についても紹介しています。

## 構成

- `index.html` — トップページ
- `archive.html` — 資料アーカイブ
- `city.html` — 対象地域（鎌倉）の紹介
- `manifesto.html` — プロジェクトの理念
- `news.html` — お知らせ
- `profile.html` — プロジェクト・メンバー紹介
- `contact.html` — お問い合わせ
- `simulator/` — シミュレーション関連コンテンツ

## 2026-06-27 更新

- シミュレーション試行回数を論文準拠の **242回**（BASE 50 + 24×8）に修正（旧表記 386 は誤り）
- TENDEN 紹介を **v7.0 / 30言語 / 2ルート / オフライン opt-in** に更新
- 分析ビューア同梱データを **v2.0 BASE 代表ラン**（60,794人・37.7%・4属性）に差し替え。タイムラプスは25%サンプリング・2ステップ間引き
- [TENDEN 開発履歴（v0.1〜v7.0）](https://masatosprojects.github.io/tenden-promo/version-history.html) へのリンクを追加

## 関連リンク

- 避難ナビアプリ TENDEN: https://masatosprojects.github.io/tenden-app/ （リポジトリ: [tenden-app](https://github.com/masatosprojects/tenden-app)）
- TENDEN紹介サイト: https://masatosprojects.github.io/tenden-promo/ （リポジトリ: [tenden-promo](https://github.com/masatosprojects/tenden-promo)）
