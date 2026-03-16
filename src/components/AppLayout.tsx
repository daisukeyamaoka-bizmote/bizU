export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', height: '100vh', background: '#fafafa' }}>
      <aside style={{ width: '208px', borderRight: '1px solid #e5e5e5', background: '#fff', padding: '20px' }}>
        <p style={{ fontWeight: 'bold', fontSize: '17px' }}>bizU</p>
        <nav style={{ marginTop: '16px' }}>
          <a href="/" style={{ display: 'block', padding: '6px 0', fontSize: '13px', color: '#525252' }}>ダッシュボード</a>
          <a href="/contacts" style={{ display: 'block', padding: '6px 0', fontSize: '13px', color: '#525252' }}>取引先管理</a>
          <a href="/knowledge" style={{ display: 'block', padding: '6px 0', fontSize: '13px', color: '#525252' }}>ナレッジ</a>
          <a href="/projects" style={{ display: 'block', padding: '6px 0', fontSize: '13px', color: '#525252' }}>手紙作成</a>
          <a href="/letters" style={{ display: 'block', padding: '6px 0', fontSize: '13px', color: '#525252' }}>手紙一覧</a>
          <a href="/reactions" style={{ display: 'block', padding: '6px 0', fontSize: '13px', color: '#525252' }}>反応記録</a>
        </nav>
      </aside>
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ maxWidth: '1152px', margin: '0 auto', padding: '32px' }}>
          {children}
        </div>
      </main>
    </div>
  )
}
