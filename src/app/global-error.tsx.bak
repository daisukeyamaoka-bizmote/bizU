'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ja">
      <body>
        <div style={{ padding: '40px', fontFamily: 'monospace' }}>
          <h1 style={{ color: '#dc2626' }}>Client Error</h1>
          <pre style={{ background: '#f5f5f5', padding: '16px', borderRadius: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {error.message}
          </pre>
          <pre style={{ background: '#f5f5f5', padding: '16px', borderRadius: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: '8px', fontSize: '12px' }}>
            {error.stack}
          </pre>
          {error.digest && <p>Digest: {error.digest}</p>}
          <button
            onClick={reset}
            style={{ marginTop: '16px', padding: '8px 16px', background: '#171717', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      </body>
    </html>
  )
}
