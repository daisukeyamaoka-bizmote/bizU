'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Profile = {
  id: string
  name: string
  role: string
  is_active: boolean
  email?: string
}

export default function UserManagementPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'member' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)

  useEffect(() => {
    loadProfiles()
  }, [])

  async function loadProfiles() {
    const supabase = createClient()

    // Check current user's role
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      setCurrentUserRole(myProfile?.role ?? 'member')
    }

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true })

    setProfiles(data ?? [])
    setLoading(false)
  }

  async function addUser() {
    if (!newUser.name || !newUser.email || !newUser.password) return
    if (newUser.password.length < 8) {
      setError('パスワードは8文字以上にしてください')
      return
    }

    setSaving(true)
    setError(null)

    const supabase = createClient()

    // Create auth user via Supabase
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: newUser.email,
      password: newUser.password,
      email_confirm: true,
    })

    if (authError) {
      // Fallback: try signup if admin API not available
      const { data: signupData, error: signupError } = await supabase.auth.signUp({
        email: newUser.email,
        password: newUser.password,
      })

      if (signupError) {
        setError(signupError.message)
        setSaving(false)
        return
      }

      if (signupData.user) {
        await supabase.from('profiles').insert({
          id: signupData.user.id,
          name: newUser.name,
          role: newUser.role,
        })
      }
    } else if (authData.user) {
      await supabase.from('profiles').insert({
        id: authData.user.id,
        name: newUser.name,
        role: newUser.role,
      })
    }

    // Log the action
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .single()

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        user_name: myProfile?.name ?? user.email ?? '',
        action: 'CREATE_USER',
        target_type: 'profiles',
        detail: { email: newUser.email, role: newUser.role },
      })
    }

    setSaving(false)
    setShowAddModal(false)
    setNewUser({ name: '', email: '', password: '', role: 'member' })
    loadProfiles()
  }

  async function toggleActive(profile: Profile) {
    const supabase = createClient()
    await supabase
      .from('profiles')
      .update({ is_active: !profile.is_active, updated_at: new Date().toISOString() })
      .eq('id', profile.id)

    // Audit log
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .single()

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        user_name: myProfile?.name ?? '',
        action: profile.is_active ? 'DEACTIVATE_USER' : 'ACTIVATE_USER',
        target_type: 'profiles',
        target_id: profile.id,
        detail: { target_name: profile.name },
      })
    }

    loadProfiles()
  }

  if (currentUserRole !== null && currentUserRole !== 'admin') {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-neutral-500">この機能は管理者のみ利用できます</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">ユーザー管理</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          + ユーザーを追加
        </button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">名前</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">役割</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">状態</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-neutral-500">
                  読み込み中...
                </td>
              </tr>
            ) : profiles.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-neutral-500">
                  ユーザーが登録されていません
                </td>
              </tr>
            ) : (
              profiles.map((p) => (
                <tr key={p.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-sm font-medium text-neutral-900">{p.name}</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.role === 'admin' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
                    }`}>
                      {p.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`text-xs ${p.is_active ? 'text-emerald-600' : 'text-red-500'}`}>
                      {p.is_active ? '有効' : '無効'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => toggleActive(p)}
                      className="text-xs text-neutral-500 hover:text-neutral-700 hover:underline"
                    >
                      {p.is_active ? '無効化' : '有効化'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-neutral-900">ユーザーを追加</h2>

            {error && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700">表示名 *</label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder="山田 太郎"
                  className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">メールアドレス *</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="yamada@bizmote.co.jp"
                  className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">パスワード *</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
                />
                <p className="mt-1 text-xs text-neutral-400">8文字以上</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">役割</label>
                <div className="mt-2 flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="role"
                      value="member"
                      checked={newUser.role === 'member'}
                      onChange={() => setNewUser({ ...newUser, role: 'member' })}
                      className="h-4 w-4"
                    />
                    <span className="text-sm text-neutral-700">member</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="role"
                      value="admin"
                      checked={newUser.role === 'admin'}
                      onChange={() => setNewUser({ ...newUser, role: 'admin' })}
                      className="h-4 w-4"
                    />
                    <span className="text-sm text-neutral-700">admin（ユーザー管理が可能）</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={addUser}
                disabled={saving || !newUser.name || !newUser.email || !newUser.password}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {saving ? '追加中...' : '追加する'}
              </button>
              <button
                onClick={() => { setShowAddModal(false); setError(null) }}
                className="text-sm text-neutral-500 hover:underline"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
