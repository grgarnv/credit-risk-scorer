"""
Credit Risk Intelligence Platform — FastAPI backend.

Endpoints
  GET  /                  health + model metadata
  POST /predict           score one customer (+ SHAP explanation, decision)
  POST /predict/batch     score many customers at once (portfolio scoring)
  POST /simulate          what-if: vary one field, see how risk responds
  GET  /threshold-analysis  cost curve across thresholds (approve/review/decline mix)
  GET  /model-info        feature importances, metrics, drivers
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
import numpy as np, pandas as pd, joblib, shap, os

app = FastAPI(title="Credit Risk Intelligence API", version="2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

BUNDLE = joblib.load("model.joblib")
model, FEATURES = BUNDLE["model"], BUNDLE["features"]
AUC = BUNDLE.get("auc", 0.7826)
explainer = shap.TreeExplainer(model)

# Business cost assumptions — drive the decision thresholds
COST_FN, COST_FP = 5.0, 1.0                     # missed default vs false alarm
REVIEW_T = COST_FP / (COST_FP + COST_FN)        # 0.167
DECLINE_T = 0.50

FRIENDLY = {
    "LIMIT_BAL":"Credit limit", "AGE":"Age", "SEX":"Sex", "EDUCATION":"Education",
    "MARRIAGE":"Marital status", "PAY_0":"Repayment status (current)",
    "PAY_2":"Repayment status (-1mo)", "PAY_3":"Repayment status (-2mo)",
    "PAY_4":"Repayment status (-3mo)", "PAY_5":"Repayment status (-4mo)",
    "PAY_6":"Repayment status (-5mo)", "utilization":"Credit utilization",
    "pay_to_bill":"Payment-to-bill ratio", "max_delay":"Worst delinquency",
    "n_months_late":"Months in arrears",
}
for i in range(1,7):
    FRIENDLY[f"BILL_AMT{i}"] = f"Bill amount (-{i-1}mo)"
    FRIENDLY[f"PAY_AMT{i}"]  = f"Payment amount (-{i-1}mo)"

class Customer(BaseModel):
    LIMIT_BAL: float = 50000; SEX: int = 2; EDUCATION: int = 2
    MARRIAGE: int = 1; AGE: int = 30
    PAY_0: int = 0; PAY_2: int = 0; PAY_3: int = 0
    PAY_4: int = 0; PAY_5: int = 0; PAY_6: int = 0
    BILL_AMT1: float = 20000; BILL_AMT2: float = 19000; BILL_AMT3: float = 18000
    BILL_AMT4: float = 17000; BILL_AMT5: float = 16000; BILL_AMT6: float = 15000
    PAY_AMT1: float = 2000; PAY_AMT2: float = 2000; PAY_AMT3: float = 2000
    PAY_AMT4: float = 2000; PAY_AMT5: float = 2000; PAY_AMT6: float = 2000

class BatchReq(BaseModel):
    customers: List[Customer]

class SimReq(BaseModel):
    customer: Customer
    field: str                       # which field to vary
    values: List[float]              # the values to try

def engineer(d: dict) -> pd.DataFrame:
    bill = [d[f"BILL_AMT{i}"] for i in range(1,7)]
    pay  = [d[f"PAY_AMT{i}"]  for i in range(1,7)]
    dl   = [d[k] for k in ["PAY_0","PAY_2","PAY_3","PAY_4","PAY_5","PAY_6"]]
    d = dict(d)
    d["utilization"]   = min(max(d["BILL_AMT1"]/d["LIMIT_BAL"] if d["LIMIT_BAL"] else 0,0),5)
    d["pay_to_bill"]   = sum(pay)/(sum(bill)+1)
    d["max_delay"]     = max(dl)
    d["n_months_late"] = sum(1 for x in dl if x>0)
    return pd.DataFrame([d])[FEATURES]

def decide(p: float) -> str:
    return "DECLINE" if p >= DECLINE_T else "REVIEW" if p >= REVIEW_T else "APPROVE"

def grade(p: float) -> str:
    """Map probability to a credit-grade band — familiar to risk teams."""
    for t,g in [(0.05,"A"),(0.12,"B"),(0.22,"C"),(0.35,"D"),(0.55,"E")]:
        if p < t: return g
    return "F"

def explain(row: pd.DataFrame, top=6):
    sv = explainer.shap_values(row)
    sv = sv[0] if isinstance(sv, list) else sv
    vals = np.array(sv).ravel()
    order = np.argsort(-np.abs(vals))[:top]
    out = []
    for i in order:
        f = FEATURES[i]
        out.append({
            "feature": f,
            "label": FRIENDLY.get(f, f),
            "value": float(row.iloc[0][f]),
            "impact": round(float(vals[i]), 4),
            "direction": "increases" if vals[i] > 0 else "decreases",
        })
    return out

@app.get("/")
def root():
    return {"status":"ok","model":"GradientBoosting","auc":AUC,
            "features":len(FEATURES),"review_threshold":round(REVIEW_T,3)}

@app.post("/predict")
def predict(c: Customer):
    row = engineer(c.dict())
    p = float(model.predict_proba(row)[0,1])
    return {
        "risk_score": round(p,4), "risk_percent": round(p*100,1),
        "decision": decide(p), "grade": grade(p),
        "thresholds": {"review": round(REVIEW_T,3), "decline": DECLINE_T},
        "factors": explain(row),
        "engineered": {
            "utilization": round(float(row.iloc[0]["utilization"]),3),
            "pay_to_bill": round(float(row.iloc[0]["pay_to_bill"]),3),
            "max_delay": int(row.iloc[0]["max_delay"]),
            "n_months_late": int(row.iloc[0]["n_months_late"]),
        },
    }

@app.post("/predict/batch")
def predict_batch(req: BatchReq):
    """Score a whole portfolio at once and return aggregate risk analytics."""
    if not req.customers: raise HTTPException(400, "no customers supplied")
    if len(req.customers) > 5000: raise HTTPException(400, "max 5000 per batch")
    rows = pd.concat([engineer(c.dict()) for c in req.customers], ignore_index=True)
    probs = model.predict_proba(rows)[:,1]

    results = [{"index":i, "risk_percent":round(float(p)*100,1),
                "decision":decide(float(p)), "grade":grade(float(p))}
               for i,p in enumerate(probs)]

    # portfolio analytics
    bands = {g:0 for g in "ABCDEF"}
    for r in results: bands[r["grade"]] += 1
    dec = {"APPROVE":0,"REVIEW":0,"DECLINE":0}
    for r in results: dec[r["decision"]] += 1

    # risk distribution histogram (10 buckets)
    hist, edges = np.histogram(probs, bins=10, range=(0,1))

    # expected loss if the whole book were approved at avg exposure
    exposure = rows["LIMIT_BAL"].values
    exp_loss = float(np.sum(probs * exposure * 0.7))

    return {
        "count": len(results),
        "results": results,
        "portfolio": {
            "avg_risk": round(float(probs.mean())*100,2),
            "median_risk": round(float(np.median(probs))*100,2),
            "high_risk_count": int((probs>=DECLINE_T).sum()),
            "expected_loss": round(exp_loss,2),
            "total_exposure": round(float(exposure.sum()),2),
            "grades": bands, "decisions": dec,
            "histogram": [{"bucket": f"{int(edges[i]*100)}-{int(edges[i+1]*100)}%",
                           "count": int(hist[i])} for i in range(10)],
        },
    }

@app.post("/simulate")
def simulate(req: SimReq):
    """What-if analysis: sweep one field and watch risk respond."""
    if req.field not in Customer.__fields__:
        raise HTTPException(400, f"unknown field {req.field}")
    base = req.customer.dict()
    pts = []
    for v in req.values:
        d = dict(base); d[req.field] = v
        p = float(model.predict_proba(engineer(d))[0,1])
        pts.append({"value": v, "risk_percent": round(p*100,2), "decision": decide(p)})
    return {"field": req.field, "label": FRIENDLY.get(req.field, req.field), "points": pts}

@app.get("/threshold-analysis")
def threshold_analysis(fn_cost: float = 5.0, fp_cost: float = 1.0):
    """
    Show how the approve/decline cutoff shifts with the business cost ratio.
    This is the 'why 0.167 and not 0.5' argument, made interactive.
    """
    opt = fp_cost / (fp_cost + fn_cost)
    curve = []
    for t in np.arange(0.05, 0.95, 0.05):
        # relative cost model: FN missed defaults vs FP rejected good customers
        curve.append({"threshold": round(float(t),2),
                      "relative_cost": round(float(fn_cost*(1-t) + fp_cost*t),3)})
    return {"optimal_threshold": round(float(opt),3),
            "fn_cost": fn_cost, "fp_cost": fp_cost, "curve": curve}

@app.get("/model-info")
def model_info():
    imp = getattr(model, "feature_importances_", None)
    drivers = []
    if imp is not None:
        order = np.argsort(-imp)[:10]
        drivers = [{"feature":FEATURES[i], "label":FRIENDLY.get(FEATURES[i],FEATURES[i]),
                    "importance": round(float(imp[i]),4)} for i in order]
    return {"model":"Gradient Boosting Classifier","auc":AUC,
            "n_features":len(FEATURES),"dataset":"UCI Default of Credit Card Clients (30,000)",
            "class_balance":"22% default rate","drivers":drivers,
            "cost_assumption":{"fn_cost":COST_FN,"fp_cost":COST_FP,
                               "review_threshold":round(REVIEW_T,3),"decline_threshold":DECLINE_T}}
