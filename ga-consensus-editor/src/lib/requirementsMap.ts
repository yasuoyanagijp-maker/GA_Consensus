export type RequirementMapItem = {
  file: string;
  taskName: string;
  chapterTitle: string;
  matchedIssues: string[];
  expectedConsensusStatements: string[];
  subItems: {
    title: string;
    whoseProblem: string[];
    cause: string;
    possibleSolutions: string;
    futurePerspective: string;
  }[];
};

/**
 * IZV Pts-J課題（2026-04-27）から、現行 ga_*.md 9章への対応を同定したマップ。
 * 章横断テーマは複数章に重複配置している。
 */
export const REQUIREMENT_MAP: RequirementMapItem[] = [
  {
    file: "ga_early_detection_symptoms_consensus_report.md",
    taskName: "受診・紹介 - 早期発見・症状顕在化",
    chapterTitle: "早期発見・症状顕在化",
    matchedIssues: [
      "早期GA患者の自覚症状の乏しさ",
      "GAを見つける意識の低さ",
      "患者さんの困りごとの把握不足",
    ],
    expectedConsensusStatements: [
      "早期GAは自覚症状が乏しくても受診トリガーとなる生活変化（読書・暗所視・運転）を問診で能動的に拾うべきである。",
      "BCVAが保たれていてもGA疑いを否定せず、視力外の機能低下を受診勧奨に結びつけるべきである。",
      "短時間で再現可能なGA問診フレームを一般眼科でも標準運用すべきである。",
    ],
    subItems: [
      {
        title: "自覚症状に乏しく受診につながらない",
        whoseProblem: ["患者"],
        cause:
          "GAは緩徐進行で初期は自覚症状に乏しく、視力以外の見えにくさが言語化されにくいため、受診理由として顕在化しにくい。",
        possibleSolutions:
          "自覚症状以外の訴え方、受診勧奨トリガー、問診で拾う生活変化を整理し、加齢変化との差を説明できるようにする。",
        futurePerspective: "受診勧奨につながる生活変化・訴えの整理",
      },
      {
        title: "受診機会・検診機会の不足／潜在患者顕在化の未整備",
        whoseProblem: ["その他（仕組み）"],
        cause:
          "無症状段階でGAを拾う導線が限定的で、眼底異常から一般眼科受診・専門医紹介への接続運用が標準化されていない。",
        possibleSolutions:
          "眼底異常をどの機会で拾い、どの条件で一般眼科・専門医へ接続するかを整理する。",
        futurePerspective: "眼底異常の発見から眼科受診へつなぐ導線",
      },
    ],
  },
  {
    file: "ga_referral_shared_care_consensus_report.md",
    taskName: "受診・紹介 - 紹介・逆紹介フロー",
    chapterTitle: "紹介・逆紹介フロー",
    matchedIssues: ["紹介・逆紹介フローの未確立"],
    expectedConsensusStatements: [
      "GA疑い時の紹介基準（病変位置・進行速度・必要検査）を地域で明文化すべきである。",
      "紹介状必須項目と逆紹介後の役割分担を定義し、紹介の再現性を確保すべきである。",
      "紹介しても返されるという既存バイアスを解消する運用設計が必要である。",
    ],
    subItems: [
      {
        title: "紹介基準が不明確・地域連携ネットワーク未整備",
        whoseProblem: ["AMD専門医", "非専門眼科医"],
        cause:
          "紹介基準、紹介先、逆紹介後の役割分担が地域で定まらず、施設間の期待診療範囲も不統一で患者導線が安定しない。",
        possibleSolutions:
          "紹介基準、必要検査、紹介状記載項目、逆紹介後の分担を整理し、地域モデル（エリア完結/中核集約）を設計する。",
        futurePerspective: "GA疑い時の紹介基準と必要検査",
      },
      {
        title: "紹介しても返されるという過去経験による抑制",
        whoseProblem: ["AMD専門医", "非専門眼科医"],
        cause:
          "紹介後すぐ返された経験や介入につながらなかった記憶により、紹介行動が抑制される。",
        possibleSolutions:
          "紹介タイミングと逆紹介後の役割を明確化し、紹介が患者利益につながる運用設計を共有する。",
        futurePerspective: "紹介・逆紹介のタイミングと役割分担",
      },
    ],
  },
  {
    file: "ga_consensus_draft.md",
    taskName: "診断 - 問診",
    chapterTitle: "診断 - 問診",
    matchedIssues: ["GAを見つける意識の低さ", "患者さんの困りごとの把握不足"],
    expectedConsensusStatements: [
      "視力だけでは捉えられない機能低下を問診で定型的に拾うべきである。",
      "nAMDとの症状時間軸の違いを明示してGAの疾患想起を高めるべきである。",
      "ADLの質的低下を治療説明と継続判断に接続すべきである。",
    ],
    subItems: [
      {
        title: "GAを意識した問診がされず気づかない",
        whoseProblem: ["AMD専門医", "非専門眼科医"],
        cause:
          "GAを治療前提で見つける疾患として想起していないため、視力以外の訴えをGA疑いにつなげにくい。",
        possibleSolutions:
          "GAを疑う問診項目と、nAMD/加齢変化との違和感を拾う質問例を整理し、短時間運用できる問診フレーム化を行う。",
        futurePerspective: "GAを疑う問診項目・短時間で使える問診フレーム",
      },
      {
        title: "患者の困りごとの把握不足",
        whoseProblem: ["AMD専門医", "非専門眼科医"],
        cause:
          "視力だけでは読書・運転・趣味・家事など生活影響を捉えきれず、治療意義や緊急度判断材料が不足する。",
        possibleSolutions:
          "運転、読書、家事、趣味など把握すべき生活機能を整理し、治療判断とICへの反映方法を定義する。",
        futurePerspective: "生活機能の確認項目、治療判断基準",
      },
    ],
  },
  {
    file: "ga_multimodal_imaging_consensus_report.md",
    taskName: "診断 - 検査習慣・モニタリング手法",
    chapterTitle: "検査習慣・モニタリング手法",
    matchedIssues: [
      "GAを発見する検査習慣の未確立",
      "GAを発見・モニタリングする検査手法の未浸透",
    ],
    expectedConsensusStatements: [
      "初診・経過観察・nAMDフォローの各場面で、GA検出のための標準検査セット（OCT/FAF等）を定義すべきである。",
      "FAFは実施目的・対象・頻度を明示し、OCTとの役割分担で運用すべきである。",
      "nAMDフォローでは滲出評価に加え、GA併存を疑うトリガーを同一フローで評価すべきである。",
    ],
    subItems: [
      {
        title: "GA疑いでの検査習慣が未確立",
        whoseProblem: ["AMD専門医"],
        cause:
          "どの患者にどの検査をするかが診療フローに組み込まれておらず、OCT・眼底のみで止まりやすい。",
        possibleSolutions:
          "初診・経過観察・nAMDフォローなど場面別に必要検査を整理し、実施順序を運用モデル化する。",
        futurePerspective: "診療プロセスごとの必要検査と実施順序",
      },
      {
        title: "nAMDフォローでGA疑いモニタリング不足",
        whoseProblem: ["AMD専門医"],
        cause:
          "滲出評価が優先され、GA併存を疑う契機や確認プロセスが体系化されていない。",
        possibleSolutions:
          "構造・視機能変化をトリガーとするGA確認プロセスをnAMDフォロー内に明確に位置づける。",
        futurePerspective: "nAMDフォローでGAを疑うトリガー",
      },
      {
        title: "FAF実施の位置づけ・意義が未浸透",
        whoseProblem: ["AMD専門医"],
        cause:
          "FAFを診断・進行評価・継続判断のどこで使うかが明確でなく、読影/患者説明への接続も不十分。",
        possibleSolutions:
          "FAFの目的・対象・頻度、OCTとの使い分け、典型所見と活用場面を整理する。",
        futurePerspective: "FAFの目的・対象・頻度／典型所見と活用場面",
      },
    ],
  },
  {
    file: "ga_diagnosis_differential_consensus_report.md",
    taskName: "診断 - 鑑別・確定診断",
    chapterTitle: "鑑別・確定診断",
    matchedIssues: ["鑑別疾患への自信不足", "検査結果の読影スキルの不足"],
    expectedConsensusStatements: [
      "鑑別で最低限確認すべき所見（ドルーゼン有無、病変分布、境界、経時変化）を標準化すべきである。",
      "境界症例では追加検査・経時評価・専門施設相談の判断手順を明確化すべきである。",
      "読影スキルの施設差を縮小するため、症例画像集と症例ベース学習を整備すべきである。",
    ],
    subItems: [
      {
        title: "他萎縮性疾患との鑑別への不安",
        whoseProblem: ["AMD専門医"],
        cause:
          "cRORA/iRORAや他疾患鑑別が難しく、誤診回避意識から判断が保守化しやすい。",
        possibleSolutions:
          "最低限の鑑別所見、追加検査、専門医間ばらつきを整理する。",
        futurePerspective: "鑑別に必要な最低限の所見",
      },
      {
        title: "境界不明瞭症例への不安",
        whoseProblem: ["AMD専門医"],
        cause:
          "境界不明瞭や除外診断症例で画像だけでは判断し切れず、治療提案が遅れる。",
        possibleSolutions:
          "境界症例の判断手順、経時変化の見方、追加検査・専門施設相談基準を整理する。",
        futurePerspective: "境界症例での判断手順",
      },
      {
        title: "読影スキルの経験依存",
        whoseProblem: ["AMD専門医", "その他（スタッフ）"],
        cause:
          "症例数が限られ読影経験が蓄積しにくく、FAF/OCT統合診断が個人依存になる。",
        possibleSolutions:
          "鑑別に役立つ症例画像集と症例ベース学習、一般医/専門医の到達点を整理する。",
        futurePerspective: "症例画像集と症例学習内容",
      },
    ],
  },
  {
    file: "ga_treatment_ic_consensus_report.md",
    taskName: "治療 - 投薬判断とIC",
    chapterTitle: "投与判断とIC",
    matchedIssues: ["薬剤投与の判断基準の欠如", "進行抑制という概念の価値伝達の困難さ"],
    expectedConsensusStatements: [
      "投与判断は病変位置・進行速度・片眼/両眼・生活機能への影響を統合評価して行うべきである。",
      "進行抑制の価値は『改善』ではなく『将来の機能喪失回避』として説明すべきである。",
      "患者・家族が納得可能な比喩と経時説明資材を用いたICが必要である。",
    ],
    subItems: [
      {
        title: "投与判断基準が不明確",
        whoseProblem: ["AMD専門医"],
        cause:
          "年齢・病変左右差・視機能・生活背景・併存nAMD等の判断要素が多く、優先順位が統一されない。",
        possibleSolutions:
          "評価項目と重み付けを整理し、症例プロファイル別の判断軸を提示する。",
        futurePerspective: "投与判断に用いる評価項目と重み付け",
      },
      {
        title: "中心窩進展例の治療価値説明が難しい",
        whoseProblem: ["AMD専門医"],
        cause: "残存視機能や進行抑制余地の見通しが不明確で、侵襲性・費用とのバランス説明が難しい。",
        possibleSolutions:
          "中心窩病変例での投与検討条件、期待価値、見送り基準を整理し、生活機能/患者希望の扱いを定義する。",
        futurePerspective: "中心窩病変例での投与検討条件",
      },
      {
        title: "進行抑制の価値伝達が難しい",
        whoseProblem: ["AMD専門医", "患者"],
        cause:
          "進行抑制は体感改善に直結しづらく、ICで便益を言語化しにくい。",
        possibleSolutions:
          "進行抑制の説明ストーリーと将来の生活機能との接続を整理する。",
        futurePerspective: "進行抑制を伝える説明ストーリー",
      },
      {
        title: "変化がないことが成果という概念共有不足",
        whoseProblem: ["AMD専門医", "患者"],
        cause:
          "患者は効果実感が乏しく、注射負担・通院負担が先に認識されやすい。",
        possibleSolutions:
          "患者向け比喩、経時説明資材、家族同席タイミング、提示指標を整理する。",
        futurePerspective: "患者向け比喩・説明資材・提示指標",
      },
    ],
  },
  {
    file: "ga_complement_safety_ae_consensus_report.md",
    taskName: "治療 - 安全性リスクとAE管理",
    chapterTitle: "安全性リスクとAE管理",
    matchedIssues: ["安全性リスクに対する不安"],
    expectedConsensusStatements: [
      "IOP上昇・MNV・IOIの説明項目とモニタリング計画を投与前に標準化すべきである。",
      "AE発生時の休薬・再開・中止判断基準と院内連携フローを明文化すべきである。",
      "MNV発症時の対応手順（検出・抗VEGF介入・継続可否）を事前共有すべきである。",
    ],
    subItems: [
      {
        title: "眼圧上昇への懸念",
        whoseProblem: ["AMD専門医"],
        cause: "安全性リスクへの不安が投与開始・継続判断の障壁になる。",
        possibleSolutions:
          "モニタリング方法、初期対応、継続可否判断を整理し、事前説明必須項目と担当を明確化する。",
        futurePerspective: "安全性事象の説明項目・モニタリング方法・初期対応基準",
      },
      {
        title: "MNV発症リスクへの不安",
        whoseProblem: ["AMD専門医"],
        cause: "便益よりリスクが想起されやすく、発症時対応見通しの共有が不足する。",
        possibleSolutions:
          "MNV検出法、介入、IZV継続可否、患者説明方針を整理する。",
        futurePerspective: "MNV検出方法と対応手順／IZV継続可否の考え方",
      },
      {
        title: "発症時の休薬・再開基準が不明確",
        whoseProblem: ["AMD専門医"],
        cause: "AE発生時フロー不足により施設間で対応が揺れる。",
        possibleSolutions:
          "院内フロー、連携先、再開基準、緊急受診指導を標準化し、個別判断範囲を切り分ける。",
        futurePerspective: "AE発生時の休薬・再開基準と受診指導",
      },
    ],
  },
  {
    file: "ga_treatment_outcome_monitoring_consensus_report.md",
    taskName: "治療 - 効果判定・継続判断",
    chapterTitle: "効果判定・継続判断",
    matchedIssues: ["継続判断に用いる評価指標の不足・不明確さ"],
    expectedConsensusStatements: [
      "継続判断はBCVA/面積だけでなく、LLVA・読書・ADLを含む機能指標で評価すべきである。",
      "継続・中止・再開の判断時点と確認項目を明確化すべきである。",
      "中止後フォロー条件と再紹介基準を一般眼科と共有すべきである。",
    ],
    subItems: [
      {
        title: "視力・面積以外の評価指標不足",
        whoseProblem: ["AMD専門医"],
        cause:
          "視野、読書、日常生活機能など臨床的に重要な変化を捉える枠組みが不足し、治療価値可視化が難しい。",
        possibleSolutions:
          "継続判断指標群を整理し、実臨床で測定可能なものと研究的指標を分けて運用する。",
        futurePerspective: "継続判断に用いる指標群",
      },
      {
        title: "継続・中止判断基準が確立されていない",
        whoseProblem: ["AMD専門医"],
        cause:
          "医師経験や患者希望への依存が大きく、中止後再評価・フォロー方法も体系化されていない。",
        possibleSolutions:
          "継続・中止・再開の判断時点と確認項目、中止後の一般眼科フォロー条件・再紹介基準を整理する。",
        futurePerspective: "継続・中止・再開時期／中止後フォロー条件と再紹介基準",
      },
    ],
  },
  {
    file: "ga_logistics_continuity_consensus_report.md",
    taskName: "そのほか - 通院継続・体制負荷",
    chapterTitle: "通院継続・体制負荷",
    matchedIssues: ["通院・診療体制における継続負担の大きさ"],
    expectedConsensusStatements: [
      "通院継続可能性（患者・家族の移動/介護負担）を投与前評価に組み込むべきである。",
      "検査・説明・投与の院内オペレーションを標準化し、スタッフ負荷を平準化すべきである。",
      "地域連携・逆紹介を活用した継続可能な診療モデルを設計すべきである。",
    ],
    subItems: [
      {
        title: "毎月通院が高齢患者・家族に大きな負担",
        whoseProblem: ["患者"],
        cause:
          "毎月通院と反復注射は移動・時間・介護負担が大きく、医学的妥当性があっても継続困難になりやすい。",
        possibleSolutions:
          "患者選択、家族支援、地域連携、逆紹介活用の方向性を整理する。",
        futurePerspective: "継続可能性を踏まえた患者選択の観点",
      },
      {
        title: "検査運用・スタッフ負荷への懸念",
        whoseProblem: ["その他（スタッフ）"],
        cause:
          "FAFやモニタリング検査、注射前後対応が外来滞留と負荷増大を招き、導入障壁になる。",
        possibleSolutions:
          "検査・説明・投与の担当分担と院内オペレーション標準化、教育・配置・収支前提を整理する。",
        futurePerspective: "院内オペレーション標準化とスタッフ教育項目",
      },
    ],
  },
];
