'use client'

import { useState } from 'react'
import { Question, X } from '@phosphor-icons/react'

const helpSections = [
  {
    title: 'bizUとは？',
    content:
      'bizUは、日本のエンタープライズ企業の経営層・キーマンに向けたパーソナライズドレターを自動生成するABMインテリジェンスSaaSです。',
  },
  {
    title: 'はじめ方',
    items: [
      {
        q: 'まず何をすればいい？',
        a: '「リスト管理」から対象企業・担当者のリストをインポートしてください。Excel/CSVファイルをアップロードするだけで、AIが列を自動マッピングします。',
      },
      {
        q: 'ナレッジとは？',
        a: '自社サービスの資料・URL・PDFを登録する機能です。登録された情報をもとに、AIが手紙の中でプロダクトの優位性を適切に表現します。',
      },
      {
        q: '手紙はどう作成する？',
        a: '「手紙作成」からプロジェクトを作成し、リストから優先度の高い5社を選んで生成を開始します。企業のIR・中期計画・人事異動をリアルタイムでリサーチし、一人ひとりに個別化された手紙を生成します。',
      },
    ],
  },
  {
    title: 'リスト管理',
    items: [
      {
        q: 'どんなファイルが使える？',
        a: 'Excel (.xlsx, .xls) とCSV (.csv) に対応しています。Shift-JISのCSVも自動判定されます。テンプレートをダウンロードして、そのフォーマットに合わせると簡単です。',
      },
      {
        q: '重複チェックはどうなる？',
        a: '3段階で判定します：①完全一致（会社名+氏名）→スキップ or 上書き選択、②会社一致・別人→新規追加、③新規企業→そのまま追加。送付済みコンタクトの除外も可能です。',
      },
    ],
  },
  {
    title: 'ナレッジ登録',
    items: [
      {
        q: 'どんな情報を登録すればいい？',
        a: '自社サービスの特長、導入事例、競合優位性、ターゲット企業の課題に対する解決策などを登録してください。URLやPDFからAIが自動で要約・抽出します。',
      },
      {
        q: 'クライアントごとにナレッジを分けられる？',
        a: 'はい。プロジェクト単位でナレッジを紐付けることも、クライアント全体で共通のナレッジを設定することもできます。',
      },
    ],
  },
  {
    title: '手紙作成・プロジェクト',
    items: [
      {
        q: '1回に何通作れる？',
        a: '1回のバッチで5通まで同時に生成できます。各手紙ごとに、企業リサーチ→人物リサーチ→適合性分析→Why You分析→手紙生成の5ステップが実行されます。',
      },
      {
        q: 'ディープリサーチとは？',
        a: 'Web検索を活用して、企業のIR情報・中期経営計画・人事異動・最新ニュースをリアルタイムで収集し、手紙のパーソナライズに活用する機能です。',
      },
      {
        q: '手紙の編集はできる？',
        a: 'はい。生成された手紙は手紙一覧ページから内容を確認・編集してから送付できます。',
      },
    ],
  },
  {
    title: '反応記録・分析',
    items: [
      {
        q: '反応はどう記録する？',
        a: '手紙一覧で各手紙の行を展開するか、手紙詳細ページから記録できます。反応タイプ（返信あり・商談化・不在返送・反応なし・辞退）を選んで保存してください。',
      },
      {
        q: 'ダッシュボードの「要アクション」とは？',
        a: '送付から14日経過で反応未記録の手紙、次回アクション期日超過、情報が180日以上古いコンタクトをアラートで表示します。',
      },
      {
        q: 'インテリジェンスでは何が見れる？',
        a: 'Why You切り口×業種のヒートマップ、トリガーから送付までの最適タイミング分析、事例×業種の転換率ランキングなど、レター施策全体のPDCAを回すためのデータが確認できます。',
      },
    ],
  },
  {
    title: 'エクスポート',
    items: [
      {
        q: 'データのエクスポートは？',
        a: 'インテリジェンスページの各セクションからCSVでエクスポートできます。コンタクト・手紙・反応・分析データに対応しています。',
      },
    ],
  },
]

export default function HelpOverlay() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {/* Floating Help Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-6 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg transition-transform hover:scale-105 hover:bg-neutral-800 active:scale-95"
        title="ヘルプ"
      >
        <Question size={22} weight="bold" />
      </button>

      {/* Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-start p-6">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <div
            className="relative flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-neutral-200 bg-white shadow-2xl"
            style={{
              animation: 'helpSlideUp 0.2s ease-out',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Question size={20} weight="bold" className="text-neutral-900" />
                <h2 className="text-base font-semibold text-neutral-900">ヘルプ・使い方ガイド</h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-6">
                {helpSections.map((section) => (
                  <div key={section.title}>
                    <h3 className="text-sm font-semibold text-neutral-900">{section.title}</h3>

                    {section.content && (
                      <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
                        {section.content}
                      </p>
                    )}

                    {section.items && (
                      <div className="mt-2.5 space-y-3">
                        {section.items.map((item) => (
                          <div key={item.q}>
                            <p className="text-sm font-medium text-neutral-700">{item.q}</p>
                            <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-500">
                              {item.a}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-neutral-100 px-5 py-3">
              <p className="text-center text-xs text-neutral-400">
                ご不明な点がございましたらサポートまでお問い合わせください
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Animation keyframes */}
      <style jsx global>{`
        @keyframes helpSlideUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  )
}
