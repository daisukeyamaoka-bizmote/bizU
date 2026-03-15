import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ReactionForm from './ReactionForm'

export default async function LetterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: letter } = await supabase
    .from('letters')
    .select(`
      *,
      contacts(full_name, department, title, target_companies(name)),
      clients(name, product_name)
    `)
    .eq('id', id)
    .single()

  if (!letter) notFound()

  const { data: reactions } = await supabase
    .from('reactions')
    .select('*')
    .eq('letter_id', id)
    .order('created_at', { ascending: false })

  const contact = Array.isArray(letter.contacts) ? letter.contacts[0] : letter.contacts
  const client = Array.isArray(letter.clients) ? letter.clients[0] : letter.clients
  const company = contact && 'target_companies' in contact
    ? (Array.isArray(contact.target_companies) ? contact.target_companies[0] : contact.target_companies)
    : null

  return (
    <div>
      <div className="flex items-center gap-4">
        <Link href="/letters" className="text-sm text-neutral-900 hover:underline">
          ← 手紙一覧
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900">手紙詳細</h1>
        {letter.is_approved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
            承認済み ({letter.approved_by})
          </span>
        ) : (
          <Link
            href={`/letters/${id}/review`}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            確認・承認へ
          </Link>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* メタ情報 */}
        <div className="space-y-4">
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-neutral-500">宛先</h3>
            <p className="mt-1 font-medium text-neutral-900">{contact?.full_name}</p>
            <p className="text-sm text-neutral-600">
              {company?.name} / {contact?.department} / {contact?.title}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-neutral-500">クライアント</h3>
            <p className="mt-1 text-sm text-neutral-900">{client?.name} / {client?.product_name}</p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-neutral-500">設計</h3>
            <p className="mt-1 text-sm text-neutral-900">切り口: {letter.why_you_angle}</p>
            <p className="text-sm text-neutral-900">トリガー: {letter.send_trigger ?? '-'}</p>
          </div>
        </div>

        {/* 手紙本文 */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-neutral-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-500">手紙本文</h3>
              <p className="text-xs text-neutral-400">{letter.body_text.length}文字</p>
            </div>
            <div className="mt-4 whitespace-pre-wrap font-serif text-sm leading-relaxed text-neutral-900">
              {letter.body_text}
            </div>
          </div>

          {/* 反応記録 */}
          <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-neutral-900">反応記録</h3>
            {(reactions ?? []).length > 0 && (
              <div className="mt-4 space-y-3">
                {(reactions ?? []).map((r) => (
                  <div key={r.id} className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-900">
                        {r.reaction_type}
                      </span>
                      <span className="text-xs text-neutral-500">{r.reacted_at}</span>
                      {r.reaction_channel && (
                        <span className="text-xs text-neutral-500">({r.reaction_channel})</span>
                      )}
                    </div>
                    {r.memo && <p className="mt-2 text-sm text-neutral-700">{r.memo}</p>}
                    {r.next_action && (
                      <p className="mt-1 text-xs text-neutral-500">
                        次のアクション: {r.next_action}
                        {r.next_action_date ? ` (${r.next_action_date})` : ''}
                      </p>
                    )}
                    {r.next_action_log && (
                      <p className="mt-1 text-xs text-neutral-400">根拠: {r.next_action_log}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            <ReactionForm letterId={id} sentAt={letter.sent_at} />
          </div>
        </div>
      </div>
    </div>
  )
}
