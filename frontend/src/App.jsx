import { useState } from 'react'

// The API base URL. In dev it's localhost; in production set VITE_API_URL
// as an environment variable on Vercel to point at your deployed backend.
const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// The fields the user fills in. We group them so the form isn't a wall of 23 inputs.
// PAY_x are repayment-status codes: -1 = paid duly, 0 = revolving, 1..8 = months late.
const FIELDS = {
  Profile: [
    ['LIMIT_BAL', 'Credit limit', 50000],
    ['AGE', 'Age', 30],
    ['SEX', 'Sex (1=M, 2=F)', 2],
    ['EDUCATION', 'Education (1-4)', 2],
    ['MARRIAGE', 'Marriage (1-3)', 1],
  ],
  'Repayment status (months back)': [
    ['PAY_0', 'This month', 0], ['PAY_2', '1 mo ago', 0], ['PAY_3', '2 mo ago', 0],
    ['PAY_4', '3 mo ago', 0], ['PAY_5', '4 mo ago', 0], ['PAY_6', '5 mo ago', 0],
  ],
  'Bill amounts': [
    ['BILL_AMT1', 'This month', 20000], ['BILL_AMT2', '1 mo ago', 19000], ['BILL_AMT3', '2 mo ago', 18000],
    ['BILL_AMT4', '3 mo ago', 17000], ['BILL_AMT5', '4 mo ago', 16000], ['BILL_AMT6', '5 mo ago', 15000],
  ],
  'Payment amounts': [
    ['PAY_AMT1', 'This month', 2000], ['PAY_AMT2', '1 mo ago', 2000], ['PAY_AMT3', '2 mo ago', 2000],
    ['PAY_AMT4', '3 mo ago', 2000], ['PAY_AMT5', '4 mo ago', 2000], ['PAY_AMT6', '5 mo ago', 2000],
  ],
}

// Build the initial form state from the defaults above.
const initialForm = Object.values(FIELDS).flat()
  .reduce((acc, [key, , def]) => ({ ...acc, [key]: def }), {})

export default function App() {
  const [form, setForm] = useState(initialForm)   // all 23 input values
  const [result, setResult] = useState(null)       // API response
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // update one field when the user types
  const update = (key, value) =>
    setForm(prev => ({ ...prev, [key]: value === '' ? '' : Number(value) }))

  // call the backend
  const submit = async () => {
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await fetch(`${API}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setResult(await res.json())
    } catch (e) {
      setError('Could not reach the API. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  // pick a colour for the decision badge
  const decisionColor = { APPROVE: '#16a34a', 'MANUAL REVIEW': '#d97706', DECLINE: '#dc2626' }

  return (
    <div className="wrap">
      <header>
        <h1>Credit Default Risk Scorer</h1>
        <p>Enter a customer's profile to get a real-time default-risk score, an
           explanation of the drivers, and a cost-based lending decision.</p>
      </header>

      <div className="layout">
        {/* ---------- input form ---------- */}
        <section className="card">
          {Object.entries(FIELDS).map(([group, fields]) => (
            <div key={group} className="group">
              <h3>{group}</h3>
              <div className="grid">
                {fields.map(([key, label]) => (
                  <label key={key}>
                    <span>{label}</span>
                    <input type="number" value={form[key]}
                           onChange={e => update(key, e.target.value)} />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button onClick={submit} disabled={loading}>
            {loading ? 'Scoring…' : 'Score this customer'}
          </button>
          {error && <p className="error">{error}</p>}
        </section>

        {/* ---------- results ---------- */}
        <section className="card result">
          {!result && <p className="hint">Results will appear here.</p>}
          {result && (
            <>
              <div className="score" style={{ color: decisionColor[result.decision] }}>
                {result.risk_percent}%
                <small>default risk</small>
              </div>
              <div className="badge" style={{ background: decisionColor[result.decision] }}>
                {result.decision}
              </div>
              <p className="thresh">
                Decision threshold {result.threshold_used} — set from a 5:1 cost ratio
                (a missed default costs ~5× a false alarm), not a naive 0.5 cutoff.
              </p>
              <h4>Why this score</h4>
              <ul className="factors">
                {result.top_factors.map(f => (
                  <li key={f.feature}>
                    <span className="fname">{f.feature}</span>
                    <span className={f.impact > 0 ? 'up' : 'down'}>
                      {f.impact > 0 ? '▲' : '▼'} {f.direction}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
