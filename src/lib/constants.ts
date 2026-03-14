// 業種選択肢
export const INDUSTRIES = [
  '製造', '商社', '小売', 'HR Tech', '物流', '建設', '金融', 'IT', '食品', 'その他',
] as const

// 役職レベル選択肢
export const ROLE_LEVELS = [
  '取締役', '執行役員', '部長', '課長', 'マネージャー', 'その他',
] as const

// 機能タグ選択肢
export const FUNCTION_TAGS = [
  '人事', '経営', 'IT', '財務', '営業', 'その他',
] as const

// 従業員規模選択肢
export const EMPLOYEE_SCALES = [
  '~500名', '500~1000名', '1000~5000名', '5000名~',
] as const

// 売上規模選択肢
export const REVENUE_SCALES = [
  '~100億', '100~500億', '500億~',
] as const

// 上場区分選択肢
export const LISTING_TYPES = [
  '東証P', '東証S', '非上場',
] as const

// 情報ソース選択肢
export const INFO_SOURCES = [
  'Infobox', 'HP', '登記', 'LinkedIn', '紹介', 'その他',
] as const

// Why Youの切り口選択肢
export const WHY_YOU_ANGLES = [
  '採用強化', 'コスト削減', '競合対策', '組織拡大', 'DX推進', 'その他',
] as const

// 送付トリガー選択肢
export const SEND_TRIGGERS = [
  '役員交代', '決算発表', '採用急増', '新規事業', '定期接触', 'その他',
] as const

// 反応種別選択肢
export const REACTION_TYPES = [
  '返信あり', '商談化', '失注', '無反応', '再送希望',
] as const

// 反応チャネル選択肢
export const REACTION_CHANNELS = [
  '電話', 'メール', '手紙返信', '紹介経由',
] as const

// 次のアクション選択肢
export const NEXT_ACTIONS = [
  '追送', '電話', '提案', 'クローズ',
] as const

// ケーススタディ公開状態
export const AVAILABILITY_OPTIONS = [
  'public', 'restricted', 'unavailable',
] as const

// 課題タグのプリセット（ケーススタディ用）
export const CHALLENGE_TAG_PRESETS = [
  '採用工数削減',
  '面接品質向上',
  '内定辞退防止',
  '面接標準化',
  '候補者体験向上',
  '録画面接導入',
  '遠隔地採用強化',
  'AI分析活用',
  '採用精度向上',
  '現場負担軽減',
  '技術者採用強化',
  '採用ブランディング',
  '離職率改善',
  'オンボーディング改善',
] as const
