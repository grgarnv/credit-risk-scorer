"""
FastAPI service for credit-default risk scoring.
Loads the trained model once at startup; /predict returns a risk score,
a SHAP-based explanation, and a cost-sensitive recommendation.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np, pandas as pd, joblib, shap

app = FastAPI(title="Credit Default Risk API")

# allow the React dev server + deployed frontend to call this
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

# --- load model + set up SHAP explainer once ---
bundle = joblib.load("model.joblib")
model, FEATURES = bundle["model"], bundle["features"]
explainer = shap.TreeExplainer(model)

# Cost assumptions (business input, not model): a missed default is ~5x costlier
# than a wrongly-flagged good customer. This drives the decision threshold.
COST_FN, COST_FP = 5.0, 1.0
THRESHOLD = COST_FP / (COST_FP + COST_FN)   # = 0.167; below 0.5 because misses hurt more

# The raw inputs a user provides (the 23 base features)
class Customer(BaseModel):
    LIMIT_BAL: float; SEX: int; EDUCATION: int; MARRIAGE: int; AGE: int
    PAY_0: int; PAY_2: int; PAY_3: int; PAY_4: int; PAY_5: int; PAY_6: int
    BILL_AMT1: float; BILL_AMT2: float; BILL_AMT3: float
    BILL_AMT4: float; BILL_AMT5: float; BILL_AMT6: float
    PAY_AMT1: float; PAY_AMT2: float; PAY_AMT3: float
    PAY_AMT4: float; PAY_AMT5: float; PAY_AMT6: float

def engineer(d: dict) -> pd.DataFrame:
    """Recreate the 4 engineered features from raw inputs (must match training)."""
    bill = [d[f"BILL_AMT{i}"] for i in range(1,7)]
    pay  = [d[f"PAY_AMT{i}"]  for i in range(1,7)]
    dcols= [d[k] for k in ["PAY_0","PAY_2","PAY_3","PAY_4","PAY_5","PAY_6"]]
    d = dict(d)
    d["utilization"]   = min(max(d["BILL_AMT1"]/d["LIMIT_BAL"] if d["LIMIT_BAL"] else 0, 0), 5)
    d["pay_to_bill"]   = sum(pay)/(sum(bill)+1)
    d["max_delay"]     = max(dcols)
    d["n_months_late"] = sum(1 for x in dcols if x > 0)
    return pd.DataFrame([d])[FEATURES]

@app.get("/")
def health():
    return {"status": "ok", "model": "GradientBoosting", "threshold": round(THRESHOLD,3)}

@app.post("/predict")
def predict(cust: Customer):
    row = engineer(cust.dict())
    prob = float(model.predict_proba(row)[0, 1])

    # SHAP: which features pushed THIS prediction up or down
    sv = explainer.shap_values(row)
    sv = sv[0] if isinstance(sv, list) else sv          # handle sklearn version differences
    contribs = sorted(zip(FEATURES, np.array(sv).ravel()),
                      key=lambda x: abs(x[1]), reverse=True)[:5]
    top_factors = [{"feature": f, "impact": round(float(v), 4),
                    "direction": "increases risk" if v > 0 else "lowers risk"}
                   for f, v in contribs]

    # Cost-sensitive decision (not a naive 0.5 cutoff)
    if prob >= 0.5:            decision = "DECLINE"
    elif prob >= THRESHOLD:    decision = "MANUAL REVIEW"
    else:                      decision = "APPROVE"

    return {
        "risk_score": round(prob, 4),
        "risk_percent": round(prob * 100, 1),
        "decision": decision,
        "threshold_used": round(THRESHOLD, 3),
        "top_factors": top_factors,
    }
