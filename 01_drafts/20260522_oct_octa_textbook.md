# OCTとOCT angiography—技術進化と臨床応用

**著者:** 柳 靖雄 / 横浜市立大学 客員教授  
**用途:** 眼科領域・教科書用原稿  
**ステータス:** 下書き（完成版 → `02_published/textbook/retinal_imaging/`）  
**想定読者:** 医学生、研修医、眼科専門医候補者  
**文字数:** 約5,200字（本文）  
**関連原稿:** `20260522_fa_angiography_textbook.md`、`20260522_fa_octa_comparison_textbook.md`、`20260522_icga_octa_comparison_textbook.md`

---

## 学習目標

読了後、次のことができること。

1. 光干渉断層計（optical coherence tomography：OCT）の原理と、時間域・スペクトル域・スウェプトソースの各世代の違いを説明できる。
2. OCTの開発史の主要な節目を年代順に整理し、眼科診療がいかに変わったかを述べられる。
3. OCT angiography（OCTA）がドプラーOCTからモーションコントラストへと発展した流れを理解できる。
4. OCTAの技術的特徴・限界と、FA／ICGAとの補完関係を説明できる。
5. 広角SS-OCT／OCTA、定量解析、AI支援の動向の概要を述べられる。

---

## 1. はじめに

網膜専門医の外来で、黄斑疾患の初診に「蛍光眼底造影なし、OCTとOCTAのみ」というプロトコルが増えている—この変化は、単なる機器の入れ替えではなく、**眼科画像診断のパラダイムシフト**を反映しているのではないだろうか。

光干渉断層計（OCT）は1990年代初頭に眼科用の断層画像技術として登場し、スペクトル域（spectral-domain：SD）化、スウェプトソース（swept-source：SS）化を経て、いまや網膜・脈絡膜の**構造評価の標準検査**となった（Zysk et al., 2007; Fujimoto & Swanson, 2016; Zeppieri et al., 2023; Langlo et al., 2025）。その上に構築されたOCT angiography（OCTA）は、造影剤を用いずに3次元の血流像を得る手法として、おおよそ過去10年で急速に臨床へ浸透した（Spaide et al., 2017; Chen & Wang, 2017; Gao et al., 2016; Kashani et al., 2017）。

本稿では、OCTの技術進化とOCTA誕生の経緯を教科書用に整理する。FA・ICGAとの関係は別章（`20260522_fa_octa_comparison_textbook.md`、`20260522_icga_octa_comparison_textbook.md`）で論じるが、ここでは**構造（OCT）と血流構造（OCTA）**が、なぜ現代の網膜診療の「二本柱」となったかを、歴史と臨床の両面から捉える。

---

## 2. OCTの基礎

### 2.1 原理

OCTは、低コヒーレンス干渉（low-coherence interferometry）により、組織内の反射光の遅延時間（深度）を測定し、**非侵襲的な断面像（B-scan）**を得る。眼底では、網膜層構造、網膜下液・網膜内液、ドルーゼン、網膜色素上皮（retinal pigment epithelium：RPE）の異常などを、生体でリアルタイムに観察できる—「光学的生検（optical biopsy）」と称される理由はここにある（Fujimoto & Swanson, 2016; Fujimoto et al., 2019; Varghese et al., 2024）。

### 2.2 構造OCTと機能情報

従来のOCTは主に**形態（morphology）**を提供する。中心網膜厚（central retinal thickness：CRT）、網膜神経節細胞層（retinal ganglion cell layer：RGCL）厚、脈絡膜厚（choroidal thickness）などの定量が可能となり、加齢黄斑変性（age-related macular degeneration：AMD）、糖尿病網膜症（diabetic retinopathy：DR）、緑内障の経過観察の基盤となった。

OCTAは同じ干渉計プラットフォーム上に、**血流の存在**という第二の情報層を載せた拡張である—両者を分離して理解することが、現代の読影の出発点である。

**【臨床での含意】**  
すなわち、OCTで「厚み・液体・萎縮」を見、OCTAで「どこに血流があるか」を見、FA／ICGAで「何が漏れているか」を見る—この三層の棲み分けを頭に置かないと、新しい装置の数字に一喜一憂することになる。私が日々の診療で重視するのは、**主問いが形態か、灌流か、透過性か**という順序である。

---

## 3. OCTの開発と技術進化

### 3.1 主な技術マイルストーン

**表1** OCT世代ごとの技術進歩と臨床的意義

| 時期・世代 | 特徴的な進歩 | 臨床的インパクト |
|------------|--------------|------------------|
| **1991〜：時間域OCT（TD-OCT）** | 低コヒーレンス干渉による網膜断層像の初実証 | 眼科における構造評価の新標準の萌芽（Zysk et al., 2007） |
| **2000年代：SD-OCT** | スペクトルドメイン化で撮像速度・感度が大幅向上 | 3Dボリューム、網膜厚定量、微細層の可視化（Gao et al., 2016; Langlo et al., 2025） |
| **2010年代〜：SS-OCT** | スウェプトソースによる高速・長波長撮像 | 黄斑〜中周辺部／深部脈絡膜の広範・高画質画像（Zheng et al., 2022; Laíns et al., 2021） |

1991年のHuangらによるヒト網膜OCT報告以降、TD-OCTは研究・臨床の扉を開いた。2000年代のSD-OCT普及により、**「網膜を切らずに層別に見る」** がルーチン化し、2010年代以降のSS-OCTは、脈絡膜スペクトラム疾患や広角モニタリングの議論を加速させた（Zeppieri et al., 2023; Fujimoto & Swanson, 2016）。

### 3.2 応用領域の拡大

OCTは眼底にとどまらず、前眼部（anterior segment：AS-OCT）、視神経、さらには心臓・皮膚など他領域へ応用が拡大した（Toto et al., 2018; Fujimoto et al., 2019; Varghese et al., 2024）。眼科教科書の焦点は網膜・脈絡膜に置くが、**同一原理の横断的プラットフォーム**としてOCTが発展した事実は、技術史の理解に資する。

---

## 4. OCT angiography誕生までの流れ

### 4.1 ドプラーOCT期（1990年代〜2000年代）

血流をOCTで測定する発想は、OCT黎明期と並行して登場した。ドプラーOCT（Doppler OCT）は、血流速度・方向を可視化するが、**速度依存性・照射角度依存性・撮像速度の制約**が大きく、網膜微小血管のボリューム撮影には不向きであった（Spaide et al., 2017; Chen & Wang, 2017; Gao et al., 2016; Kashani et al., 2017）。

しかしながら、「造影剤なしで血管を見る」という方向性そのものは、この時代にすでに示されていた—後のOCTAへと続く思想の源流である。

### 4.2 フーリエドメインOCTへの移行とモーションコントラスト

SD-OCT・SS-OCTの登場により、A-scanの取得速度は従来の時間域方式と比較して**数十〜百倍**に向上した（Gao et al., 2016; Hormel et al., 2025）。撮像間隔が短くなれば、組織の静止成分は反復B-scan間で一致し、**赤血球の移動だけが位相・振幅の変動**として残る—この洞察が、モーションコントラスト（motion contrast）系の血流描出へとつながった。

光学コヒーレンス断層血管造影（optical microangiography：OMAG）など、A-scan間の位相差だけでなく振幅変化も利用するアルゴリズムが開発され、フロー検出の感度と頑健性が改善された（Chen & Wang, 2017; Kashani et al., 2017; Hormel & Jia, 2025）。

**表2** OCTA成立までの技術的流れ（概略）

| 段階 | 内容 |
|------|------|
| ドプラーOCT | 速度・方向の可視化；網膜広域には制約 |
| SD／SS-OCT | 高速反復撮像が可能に |
| モーションコントラスト | 静的組織と「動く赤血球」の分離 |
| 分割式アルゴリズム | OMAG、SSADA、複数の商用実装 |

---

## 5. OCTAの確立と眼科への臨床導入

### 5.1 技術的特徴

OCTAは、連続したOCT信号の変化から**動いている赤血球**と**静的組織**を識別し、造影剤なしで en face および3Dの血管像を生成する（Chen & Wang, 2017; Gao et al., 2016; Kashani et al., 2017）。スペクトル領域の分割振幅デコレレーション（split-spectrum amplitude-decorrelation angiography：SSADA）など、装置・ソフトウェアにより実装名は異なるが、臨床像の読影原理は共通である。

当初は視野が狭く、投影アーティファクト（projection artifact）、運動アーティファクトが目立つなどの課題があった。ハード（高速SS-OCT、広角光学）とソフト（アーティファクト低減、層分割の安定化）の両面の改良により、**網膜浅層・深層毛细血管、脈絡膜毛细血管（choriocapillaris）** の描出と定量が臨床グレードに近づいている（Spaide et al., 2017; Hormel & Jia, 2025; Hormel et al., 2025）。

### 5.2 短期間での臨床普及

おおよそ過去10年でOCTAは後極の網膜血管疾患のフォローに広く入り込んだ。鍵となったのは、**(1) 高速OCTハードウェア、(2) 効率的なフロー抽出アルゴリズム、(3) 既存OCTワークフローへの統合**の三つである（Spaide et al., 2017; Laíns et al., 2021）。

イタリアの多施設データでは、2014〜2018年にOCTA件数が急増し、FA件数が減少した—「実務上の置き換え」が進んだ時期と重なる（Savastano et al., 2020; Wylęgała et al., 2020）。ただし、漏出評価や炎症の広角マッピングではFA／ICGAが残る点は、比較章で論じたとおりである。

### 5.3 応用の拡大：前眼部・定量・AI

- **後極〜広角：** SS-OCTAにより、黄斑から中周辺部までの無灌流・新生血管評価が進展（Zheng et al., 2022; Laíns et al., 2021）。
- **前眼部OCTA（AS-OCTA）：** 角膜・虹彩・毛細血管の研究が初期段階ながら発展中（Luo et al., 2021; Yang et al., 2025）。
- **定量解析：** 血管密度、FAZ（foveal avascular zone）面積、脈絡膜フロー欠損などの指標が標準化されつつある（Hormel & Jia, 2025）。
- **AI：** 深層学習による層分割、病変検出、進行予測への応用が進んでいる（Zheng et al., 2022; Hormel et al., 2025）。

---

## 6. マルチモーダル時代における位置づけ

| モダリティ | 主に答える問い |
|------------|----------------|
| **OCT（構造）** | 厚み、液体、萎縮、層の破綻 |
| **OCTA** | 血流の有無、無灌流、層別血管構造 |
| **FA** | 漏出、透過性亢進、動態 |
| **ICGA** | 脈絡膜・ポリープ、遅延相 |
| **FAF** | RPE代謝・リポフスチン |

OCT／OCTAは、このマトリクスの**上半分（構造＋血流構造）**を非侵襲的に担う。造影検査を「なくす」のではなく、**オーダーの頻度とタイミングを変える**—そう捉えると、臨床現場の変化と矛盾しない。

**【私の見方】**  
多少大袈裟な表現になるかもしれないが、SD-OCTの普及は「網膜を層で読む文化」を、OCTAの普及は「層ごとの血流を読む文化」を、それぞれ植え付けた。私が若手に伝えたいのは、装置の世代（TD／SD／SS）を暗記すること以上に、**自分の主問いに合った世代とモダリティを選ぶ習慣**である。SS-OCTAが広角虚血を見せても、活動性漏出の最終判断にFAが要る場面は、今も残っている。

---

## 7. まとめ

OCTは1990年代の時間域OCTから、SD-OCT・SS-OCTへの高速化・高分解能化を経て、眼科診療の標準技術となった。その延長として、ドプラーOCT研究、フーリエドメインOCT、モーションコントラスト手法の確立という流れでOCTAが誕生し、おおよそ過去10年で造影剤を用いない3次元血管イメージングとして急速に普及した。

今後も、より広角・高精細・定量化・AI統合へと進化は続くと考えられる（Langlo et al., 2025; Hormel et al., 2025）。教科書学習では、技術史と**「何が、依然として見えないか」**を一体として押さえることが、FA・ICGA章、比較章への橋渡しとなる。

---

## 参考文献

1. Chen CL, Wang RK. Optical coherence tomography based angiography [Invited]. *Biomed Opt Express*. 2017;8(2):1056-1082. https://doi.org/10.1364/boe.8.001056
2. Fujimoto JG, Swanson EA. The development, commercialization, and impact of optical coherence tomography. *Invest Ophthalmol Vis Sci*. 2016;57:OCT1-OCT13. https://doi.org/10.1167/iovs.16-19963
3. Fujimoto JG, Schmitt JM, Swanson EA, Aguirre AD, Jang IH. The development of optical coherence tomography. In: *Cardiovascular OCT Imaging*. Springer; 2019. https://doi.org/10.1007/978-3-030-25711-8_1
4. Gao SS, Jia Y, Zhang M, et al. Optical coherence tomography angiography. *Invest Ophthalmol Vis Sci*. 2016;57:OCT27-OCT36. https://doi.org/10.1167/iovs.15-19043
5. Hormel TG, Jia Y. Advancing optical coherence tomography angiography to the clinic. *Taiwan J Ophthalmol*. 2025;15:333-343. https://doi.org/10.4103/tjo.tjo-d-25-00080
6. Hormel TG, Huang D, Jia Y. Advances in OCT angiography. *Transl Vis Sci Technol*. 2025;14. https://doi.org/10.1167/tvst.14.3.6
7. Kashani AH, Chen CL, Gahm J, et al. Optical coherence tomography angiography: a comprehensive review of current methods and clinical applications. *Prog Retin Eye Res*. 2017;60:66-100. https://doi.org/10.1016/j.preteyeres.2017.07.002
8. Laíns I, Wang J, Cui Y, et al. Retinal applications of swept source optical coherence tomography (OCT) and optical coherence tomography angiography (OCTA). *Prog Retin Eye Res*. 2021;100951. https://doi.org/10.1016/j.preteyeres.2021.100951
9. Langlo CS, Amin A, Park SP. Optical coherence tomography retinal imaging: narrative review of technological advancements and clinical applications. *Ann Transl Med*. 2025;13. https://doi.org/10.21037/atm-24-211
10. Luo M, Li Y, Zhuo Y. Advances and current clinical applications of anterior segment optical coherence tomography angiography. *Front Med*. 2021;8. https://doi.org/10.3389/fmed.2021.721442
11. Savastano MC, Rispoli M, Lumbroso B, et al. Fluorescein angiography versus optical coherence tomography angiography: FA vs OCTA Italian Study. *Eur J Ophthalmol*. 2020;31:514-520. https://doi.org/10.1177/1120672120909769
12. Spaide RF, Fujimoto JG, Waheed NK, Sadda SR, Staurenghi G. Optical coherence tomography angiography. *Prog Retin Eye Res*. 2017;64:1-55. https://doi.org/10.1016/j.preteyeres.2017.11.003
13. Toto L, Chauhan BC, Ishikawa H, Wollstein G, Schuman JS. Anterior segment optical coherence tomography. *Prog Retin Eye Res*. 2018;66:132-156. https://doi.org/10.1016/j.preteyeres.2018.04.002
14. Varghese M, Varghese S, Pandian P. Revolutionizing medical imaging: a comprehensive review of optical coherence tomography (OCT). *J Opt*. 2024;54:1178-1195. https://doi.org/10.1007/s12596-024-01765-6
15. Wylęgała A, Bolek B, Wylęgała E. Trends in optical coherence tomography angiography use in university clinic and private practice setting between 2014-2018. *Expert Rev Med Devices*. 2020;17:1109-1113. https://doi.org/10.1080/17434440.2020.1831384
16. Yang L, Chen P, Wen X, Zhao Q. Optical coherence tomography (OCT) and OCT angiography: technological development and applications in brain science. *Theranostics*. 2025;15:122-140. https://doi.org/10.7150/thno.97192
17. Zeppieri M, Marsili S, Enaholo E, et al. Optical coherence tomography (OCT): a brief look at the uses and technological evolution of ophthalmology. *Medicina*. 2023;59. https://doi.org/10.3390/medicina59122114
18. Zheng F, Deng X, Zhang Q, et al. Advances in swept-source optical coherence tomography and optical coherence tomography angiography. *Adv Ophthalmol Pract Res*. 2022;3:67-79. https://doi.org/10.1016/j.aopr.2022.10.005
19. Zysk AM, Nguyen FT, Oldenburg AL, Marks DL, Boppart SA. Optical coherence tomography: a review of clinical development from bench to bedside. *J Biomed Opt*. 2007;12(5):051403. https://doi.org/10.1117/1.2793736

---

## 教科書掲載メモ（編集用）

| 項目 | 内容 |
|------|------|
| **推奨章立て** | 網膜画像診断 › OCT・OCTA（造影章の前、または並章） |
| **図版候補** | TD／SD／SSの模式図；モーションコントラストの概念図；マルチモーダル問いの対応表 |
| **演習問題案** | ①TDとSS-OCTの臨床的差 ②OCTAが描出できない情報 ③主問いからモダリティを選ぶ症例 |
