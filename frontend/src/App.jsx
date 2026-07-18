import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, PieChart, Pie, Legend, ReferenceLine
} from 'recharts'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const DEFAULT_CUSTOMER = {
  LIMIT_BAL:50000, SEX:2, EDUCATION:2, MARRIAGE:1, AGE:30,
  PAY_0:0, PAY_2:0, PAY_3:0, PAY_4:0, PAY_5:0, PAY_6:0,
  BILL_AMT1:20000, BILL_AMT2:19000, BILL_AMT3:18000, BILL_AMT4:17000, BILL_AMT5:16000, BILL_AMT6:15000,
  PAY_AMT1:2000, PAY_AMT2:2000, PAY_AMT3:2000, PAY_AMT4:2000, PAY_AMT5:2000, PAY_AMT6:2000,
}

const PRESETS = {
  'Prime borrower':   { ...DEFAULT_CUSTOMER, LIMIT_BAL:300000, AGE:45, PAY_0:-1,PAY_2:-1,PAY_3:-1,PAY_4:-1,PAY_5:-1,PAY_6:-1,
                        BILL_AMT1:5000,BILL_AMT2:4000,BILL_AMT3:3000,BILL_AMT4:2000,BILL_AMT5:1000,BILL_AMT6:1000,
                        PAY_AMT1:5000,PAY_AMT2:4000,PAY_AMT3:3000,PAY_AMT4:2000,PAY_AMT5:1000,PAY_AMT6:1000 },
  'Average customer': { ...DEFAULT_CUSTOMER },
  'Distressed':       { ...DEFAULT_CUSTOMER, LIMIT_BAL:30000, AGE:26, PAY_0:3,PAY_2:3,PAY_3:2,PAY_4:2,PAY_5:1,PAY_6:1,
                        BILL_AMT1:29500,BILL_AMT2:29000,BILL_AMT3:28000,BILL_AMT4:27000,BILL_AMT5:26000,BILL_AMT6:25000,
                        PAY_AMT1:400,PAY_AMT2:400,PAY_AMT3:500,PAY_AMT4:400,PAY_AMT5:300,PAY_AMT6:300 },
}

const GROUPS = {
  'Applicant profile': [['LIMIT_BAL','Credit limit'],['AGE','Age'],['SEX','Sex (1 M / 2 F)'],
                        ['EDUCATION','Education (1–4)'],['MARRIAGE','Marital status (1–3)']],
  'Repayment history': [['PAY_0','Current'],['PAY_2','1 mo ago'],['PAY_3','2 mo ago'],
                        ['PAY_4','3 mo ago'],['PAY_5','4 mo ago'],['PAY_6','5 mo ago']],
  'Bill amounts':      [['BILL_AMT1','Current'],['BILL_AMT2','1 mo ago'],['BILL_AMT3','2 mo ago'],
                        ['BILL_AMT4','3 mo ago'],['BILL_AMT5','4 mo ago'],['BILL_AMT6','5 mo ago']],
  'Payment amounts':   [['PAY_AMT1','Current'],['PAY_AMT2','1 mo ago'],['PAY_AMT3','2 mo ago'],
                        ['PAY_AMT4','3 mo ago'],['PAY_AMT5','4 mo ago'],['PAY_AMT6','5 mo ago']],
}

const GRADE_COLOR = { A:'#1e8e3e', B:'#34a853', C:'#f9ab00', D:'#f29900', E:'#e8710a', F:'#d93025' }
const DEC_COLOR   = { APPROVE:'#1e8e3e', REVIEW:'#f9ab00', DECLINE:'#d93025' }

export default function App() {
  const [tab, setTab]   = useState('score')
  const [form, setForm] = useState(DEFAULT_CUSTOMER)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState(null)
  const [toast, setToast] = useState('')

  useEffect(()=>{ fetch(`${API}/model-info`).then(r=>r.json()).then(setInfo).catch(()=>{}) },[])
  const notify = m => { setToast(m); setTimeout(()=>setToast(''),2600) }

  const score = async (payload=form) => {
    setLoading(true); setErr('')
    try {
      const r = await fetch(`${API}/predict`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      if (!r.ok) throw new Error(r.status)
      setResult(await r.json())
    } catch { setErr('Could not reach the scoring service.') }
    finally { setLoading(false) }
  }
  useEffect(()=>{ score(DEFAULT_CUSTOMER) },[])   // score once on load

  const applyPreset = name => { setForm(PRESETS[name]); score(PRESETS[name]); notify(`Loaded "${name}"`) }

  return (
    <div className="app">
      <header className="appbar">
        <div className="bar-inner">
          <div className="brand">
            <div className="mark">◈</div>
            <div>
              <h1>Credit Risk Intelligence</h1>
              <p>Explainable default scoring &amp; portfolio analytics</p>
            </div>
          </div>
          {info && <div className="modelchip">
            <span>AUC {info.auc}</span><i/><span>{info.n_features} features</span>
          </div>}
        </div>
        <nav className="tabs">
          {[['score','Score applicant'],['portfolio','Portfolio'],
            ['simulate','What-if'],['model','Model']].map(([k,l])=>(
            <button key={k} className={tab===k?'tab active':'tab'} onClick={()=>setTab(k)}>{l}</button>
          ))}
        </nav>
      </header>

      <main className="content">
        {err && <div className="banner error">{err}</div>}
        {tab==='score'     && <ScoreTab {...{form,setForm,result,loading,score,applyPreset}}/>}
        {tab==='portfolio' && <PortfolioTab notify={notify}/>}
        {tab==='simulate'  && <SimulateTab form={form}/>}
        {tab==='model'     && <ModelTab info={info}/>}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

/* ============================ SCORE TAB ============================ */
function ScoreTab({ form, setForm, result, loading, score, applyPreset }) {
  const set = (k,v)=> setForm(p=>({...p,[k]: v===''?'':Number(v)}))
  return (
    <div className="grid-2">
      <section className="card">
        <div className="card-head">
          <h2>Applicant details</h2>
          <div className="presets">
            {Object.keys(PRESETS).map(p=>(
              <button key={p} className="chip" onClick={()=>applyPreset(p)}>{p}</button>))}
          </div>
        </div>
        {Object.entries(GROUPS).map(([g,fields])=>(
          <div className="fieldgroup" key={g}>
            <h4>{g}</h4>
            <div className="fields">
              {fields.map(([k,label])=>(
                <label key={k} className="field">
                  <span>{label}</span>
                  <input type="number" value={form[k]} onChange={e=>set(k,e.target.value)}/>
                </label>
              ))}
            </div>
          </div>
        ))}
        <button className="btn primary full" onClick={()=>score()} disabled={loading}>
          {loading?'Scoring…':'Score applicant'}
        </button>
        <p className="note">Repayment status: −1 = paid duly, 0 = revolving, 1–8 = months delinquent.</p>
      </section>

      <section className="stack">
        {!result ? <div className="card skeleton-card"/> : <>
          <div className="card result-card">
            <div className="ring-wrap">
              <Ring pct={result.risk_percent} color={DEC_COLOR[result.decision]}/>
              <div className="ring-mid">
                <b style={{color:DEC_COLOR[result.decision]}}>{result.risk_percent}%</b>
                <span>default risk</span>
              </div>
            </div>
            <div className="verdict">
              <span className="pill" style={{background:DEC_COLOR[result.decision]}}>{result.decision}</span>
              <span className="gradebadge" style={{borderColor:GRADE_COLOR[result.grade],color:GRADE_COLOR[result.grade]}}>
                Grade {result.grade}</span>
            </div>
            <div className="thresh-line">
              <div className="tl-track">
                <div className="tl-zone approve" style={{width:`${result.thresholds.review*100}%`}}/>
                <div className="tl-zone review"  style={{width:`${(result.thresholds.decline-result.thresholds.review)*100}%`}}/>
                <div className="tl-zone decline" style={{width:`${(1-result.thresholds.decline)*100}%`}}/>
                <div className="tl-marker" style={{left:`${result.risk_percent}%`}}/>
              </div>
              <div className="tl-labels"><span>Approve</span><span>Review</span><span>Decline</span></div>
            </div>
            <p className="note center">Review cutoff {(result.thresholds.review*100).toFixed(1)}% —
              derived from a 5:1 cost ratio, not a naive 50% split.</p>
          </div>

          <div className="card">
            <h3>Why this score</h3>
            <p className="sub">SHAP contribution of each factor to this individual decision</p>
            <div className="waterfall">
              {result.factors.map(f=>{
                const max = Math.max(...result.factors.map(x=>Math.abs(x.impact)))
                const w = Math.abs(f.impact)/max*100
                return (
                  <div className="wf-row" key={f.feature}>
                    <span className="wf-label">{f.label}</span>
                    <div className="wf-track">
                      <div className={`wf-bar ${f.impact>0?'pos':'neg'}`} style={{width:`${w}%`}}/>
                    </div>
                    <span className={`wf-val ${f.impact>0?'down':'up'}`}>
                      {f.impact>0?'+':''}{f.impact.toFixed(3)}</span>
                  </div>)})}
            </div>
          </div>

          <div className="card">
            <h3>Derived indicators</h3>
            <div className="kpis">
              <KPI k="Utilization" v={`${(result.engineered.utilization*100).toFixed(0)}%`}
                   warn={result.engineered.utilization>0.7}/>
              <KPI k="Pay / bill" v={result.engineered.pay_to_bill.toFixed(2)}
                   warn={result.engineered.pay_to_bill<0.1}/>
              <KPI k="Worst delinquency" v={`${result.engineered.max_delay} mo`}
                   warn={result.engineered.max_delay>=2}/>
              <KPI k="Months in arrears" v={result.engineered.n_months_late}
                   warn={result.engineered.n_months_late>=3}/>
            </div>
          </div>
        </>}
      </section>
    </div>
  )
}

/* ============================ PORTFOLIO TAB ============================ */
function PortfolioTab({ notify }) {
  const [data,setData] = useState(null)
  const [busy,setBusy] = useState(false)

  const randomCustomer = () => {
    const r=(a,b)=>Math.floor(a+Math.random()*(b-a))
    const delay=()=> Math.random()<0.65?r(-1,1):r(1,5)
    const lim=r(20000,400000)
    const bill=r(0,lim)
    return { LIMIT_BAL:lim, SEX:r(1,3), EDUCATION:r(1,5), MARRIAGE:r(1,4), AGE:r(21,60),
      PAY_0:delay(),PAY_2:delay(),PAY_3:delay(),PAY_4:delay(),PAY_5:delay(),PAY_6:delay(),
      BILL_AMT1:bill,BILL_AMT2:r(0,lim),BILL_AMT3:r(0,lim),BILL_AMT4:r(0,lim),BILL_AMT5:r(0,lim),BILL_AMT6:r(0,lim),
      PAY_AMT1:r(0,8000),PAY_AMT2:r(0,8000),PAY_AMT3:r(0,8000),PAY_AMT4:r(0,8000),PAY_AMT5:r(0,8000),PAY_AMT6:r(0,8000) }
  }

  const run = async (n) => {
    setBusy(true)
    try {
      const customers = Array.from({length:n}, randomCustomer)
      const r = await fetch(`${API}/predict/batch`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({customers})})
      setData(await r.json()); notify(`Scored ${n} applicants`)
    } catch { notify('Batch scoring failed') }
    finally { setBusy(false) }
  }

  const exportCsv = () => {
    if(!data) return
    const rows = [['index','risk_percent','decision','grade'],
      ...data.results.map(r=>[r.index,r.risk_percent,r.decision,r.grade])]
    const blob = new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'})
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob)
    a.download='portfolio_scores.csv'; a.click(); notify('CSV exported')
  }

  const p = data?.portfolio
  const gradeData = p ? Object.entries(p.grades).map(([g,c])=>({grade:g,count:c})) : []
  const decData   = p ? Object.entries(p.decisions).map(([d,c])=>({name:d,value:c})) : []

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <div><h2>Portfolio scoring</h2>
            <p className="sub">Score an entire book at once and view aggregate risk analytics</p></div>
          <div className="row-gap">
            {[100,500,1000].map(n=>(
              <button key={n} className="btn" disabled={busy} onClick={()=>run(n)}>
                {busy?'…':`Score ${n}`}</button>))}
            {data && <button className="btn primary" onClick={exportCsv}>Export CSV</button>}
          </div>
        </div>
        {!data && <p className="empty">Generate a synthetic portfolio to see distribution analytics.</p>}
      </section>

      {p && <>
        <div className="kpi-row">
          <BigKPI k="Applicants"     v={data.count}/>
          <BigKPI k="Average risk"   v={`${p.avg_risk}%`}/>
          <BigKPI k="High risk"      v={p.high_risk_count} tone="down"/>
          <BigKPI k="Total exposure" v={`$${(p.total_exposure/1e6).toFixed(1)}M`}/>
          <BigKPI k="Expected loss"  v={`$${(p.expected_loss/1e6).toFixed(2)}M`} tone="down"/>
        </div>

        <div className="grid-2">
          <section className="card">
            <h3>Risk distribution</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={p.histogram}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" vertical={false}/>
                <XAxis dataKey="bucket" tick={{fontSize:10,fill:'#5f6368'}} interval={1} tickLine={false} axisLine={false}/>
                <YAxis tick={{fontSize:11,fill:'#5f6368'}} tickLine={false} axisLine={false}/>
                <Tooltip contentStyle={{borderRadius:8,fontSize:13,border:'1px solid #e8eaed'}}/>
                <Bar dataKey="count" radius={[6,6,0,0]}>
                  {p.histogram.map((_,i)=><Cell key={i} fill={i<2?'#1e8e3e':i<5?'#f9ab00':'#d93025'}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </section>

          <section className="card">
            <h3>Decision mix</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={decData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                  {decData.map(d=><Cell key={d.name} fill={DEC_COLOR[d.name]}/>)}
                </Pie>
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{fontSize:12}}/>
                <Tooltip contentStyle={{borderRadius:8,fontSize:13}}/>
              </PieChart>
            </ResponsiveContainer>
          </section>
        </div>

        <section className="card">
          <h3>Grade bands</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={gradeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" vertical={false}/>
              <XAxis dataKey="grade" tick={{fontSize:12,fill:'#5f6368'}} tickLine={false} axisLine={false}/>
              <YAxis tick={{fontSize:11,fill:'#5f6368'}} tickLine={false} axisLine={false}/>
              <Tooltip contentStyle={{borderRadius:8,fontSize:13}}/>
              <Bar dataKey="count" radius={[6,6,0,0]}>
                {gradeData.map(g=><Cell key={g.grade} fill={GRADE_COLOR[g.grade]}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>
      </>}
    </div>
  )
}

/* ============================ SIMULATE TAB ============================ */
function SimulateTab({ form }) {
  const SWEEPS = {
    PAY_0:       { label:'Current repayment status', values:[-1,0,1,2,3,4,5,6] },
    LIMIT_BAL:   { label:'Credit limit',   values:[20000,50000,100000,200000,300000,500000] },
    BILL_AMT1:   { label:'Current bill',   values:[0,10000,25000,50000,100000,200000] },
    PAY_AMT1:    { label:'Current payment',values:[0,500,2000,5000,10000,20000] },
    AGE:         { label:'Age',            values:[21,25,30,35,45,55,65] },
  }
  const [field,setField] = useState('PAY_0')
  const [data,setData]   = useState(null)
  const [busy,setBusy]   = useState(false)

  const run = async (f=field) => {
    setBusy(true)
    try{
      const r = await fetch(`${API}/simulate`,{method:'POST',headers:{'Content-Type':'application/json'},
        body: JSON.stringify({customer:form, field:f, values:SWEEPS[f].values})})
      setData(await r.json())
    } catch{} finally{ setBusy(false) }
  }
  useEffect(()=>{ run(field) },[field])

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <div><h2>What-if analysis</h2>
            <p className="sub">Hold the applicant fixed and sweep a single variable to see how risk responds</p></div>
          <div className="row-gap">
            {Object.entries(SWEEPS).map(([k,v])=>(
              <button key={k} className={`chip ${field===k?'on':''}`} onClick={()=>setField(k)}>{v.label}</button>))}
          </div>
        </div>
        {busy && <p className="empty">Simulating…</p>}
        {data && !busy &&
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data.points} margin={{top:10,right:24,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6"/>
              <XAxis dataKey="value" tick={{fontSize:11,fill:'#5f6368'}} tickLine={false} axisLine={false}/>
              <YAxis unit="%" tick={{fontSize:11,fill:'#5f6368'}} tickLine={false} axisLine={false}/>
              <Tooltip contentStyle={{borderRadius:8,fontSize:13}} formatter={v=>[`${v}%`,'Risk']}/>
              <ReferenceLine y={16.7} stroke="#f9ab00" strokeDasharray="4 4"
                             label={{value:'Review',position:'right',fontSize:10,fill:'#f9ab00'}}/>
              <ReferenceLine y={50} stroke="#d93025" strokeDasharray="4 4"
                             label={{value:'Decline',position:'right',fontSize:10,fill:'#d93025'}}/>
              <Line type="monotone" dataKey="risk_percent" stroke="#1a73e8" strokeWidth={3}
                    dot={{r:5,fill:'#1a73e8'}} isAnimationActive={false}/>
            </LineChart>
          </ResponsiveContainer>}
        {data && <p className="note">Each point re-scores the same applicant with only <b>{data.label}</b> changed —
          isolating that variable's marginal effect on default risk.</p>}
      </section>
    </div>
  )
}

/* ============================ MODEL TAB ============================ */
function ModelTab({ info }) {
  if (!info) return <div className="card skeleton-card"/>
  return (
    <div className="stack">
      <div className="kpi-row">
        <BigKPI k="ROC-AUC" v={info.auc}/>
        <BigKPI k="Features" v={info.n_features}/>
        <BigKPI k="Training rows" v="30,000"/>
        <BigKPI k="Default rate" v="22%"/>
      </div>
      <section className="card">
        <h3>Top default drivers</h3>
        <p className="sub">Global feature importance from the gradient-boosted model</p>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={info.drivers} layout="vertical" margin={{left:120}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" horizontal={false}/>
            <XAxis type="number" tick={{fontSize:11,fill:'#5f6368'}} tickLine={false} axisLine={false}/>
            <YAxis type="category" dataKey="label" width={130}
                   tick={{fontSize:11,fill:'#3c4043'}} tickLine={false} axisLine={false}/>
            <Tooltip contentStyle={{borderRadius:8,fontSize:13}}/>
            <Bar dataKey="importance" fill="#1a73e8" radius={[0,6,6,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </section>
      <section className="card">
        <h3>Methodology</h3>
        <div className="method">
          <Meth t="Why AUC, not accuracy"
                d="The book defaults at 22%, so a model predicting “never defaults” scores 78% accuracy while catching zero defaulters. AUC measures ranking quality, which is what actually matters for prioritising review."/>
          <Meth t="Cost-sensitive thresholds"
                d={`A missed default costs roughly ${info.cost_assumption.fn_cost}× a false alarm, so the review cutoff sits at ${info.cost_assumption.review_threshold} rather than a naive 0.5. The threshold is derived from the cost ratio, not chosen arbitrarily.`}/>
          <Meth t="Engineered features"
                d="Credit utilization, payment-to-bill ratio, worst delinquency and months-in-arrears are derived from raw statements — domain signals a raw column dump would miss."/>
          <Meth t="Per-decision explainability"
                d="SHAP values attribute each individual score to its contributing factors, so any decision can be justified to a customer or a regulator."/>
        </div>
      </section>
    </div>
  )
}

/* ============================ SMALL COMPONENTS ============================ */
function Ring({ pct, color }) {
  const R=64, C=2*Math.PI*R
  return (
    <svg width="160" height="160" className="ring">
      <circle cx="80" cy="80" r={R} fill="none" stroke="#e8eaed" strokeWidth="14"/>
      <circle cx="80" cy="80" r={R} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C-(pct/100)*C}
              transform="rotate(-90 80 80)" style={{transition:'stroke-dashoffset .7s ease'}}/>
    </svg>)
}
const KPI    = ({k,v,warn}) => <div className={`kpi ${warn?'warn':''}`}><span>{k}</span><b>{v}</b></div>
const BigKPI = ({k,v,tone}) => <div className="bigkpi"><span>{k}</span><b className={tone||''}>{v}</b></div>
const Meth   = ({t,d}) => <div className="meth"><b>{t}</b><p>{d}</p></div>
