"""
Train the credit-default model and save it for the API.
Run once:  python train_model.py
"""
import numpy as np, pandas as pd, joblib
from sklearn.model_selection import train_test_split
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import roc_auc_score

def load():
    from ucimlrepo import fetch_ucirepo
    ds = fetch_ucirepo(id=350)
    X = ds.data.features.copy(); y = ds.data.targets.iloc[:,0]
    canonical = ["LIMIT_BAL","SEX","EDUCATION","MARRIAGE","AGE",
                 "PAY_0","PAY_2","PAY_3","PAY_4","PAY_5","PAY_6",
                 "BILL_AMT1","BILL_AMT2","BILL_AMT3","BILL_AMT4","BILL_AMT5","BILL_AMT6",
                 "PAY_AMT1","PAY_AMT2","PAY_AMT3","PAY_AMT4","PAY_AMT5","PAY_AMT6"]
    assert X.shape[1] == 23, f"expected 23 features, got {X.shape[1]}"
    X.columns = canonical
    return X, y

def engineer(X):
    Xf = X.copy()
    bill = [f"BILL_AMT{i}" for i in range(1,7)]
    pay  = [f"PAY_AMT{i}"  for i in range(1,7)]
    dl   = ["PAY_0","PAY_2","PAY_3","PAY_4","PAY_5","PAY_6"]
    Xf["utilization"]   = (X["BILL_AMT1"]/X["LIMIT_BAL"]).clip(0,5)
    Xf["pay_to_bill"]   = X[pay].sum(axis=1)/(X[bill].sum(axis=1)+1)
    Xf["max_delay"]     = X[dl].max(axis=1)
    Xf["n_months_late"] = (X[dl]>0).sum(axis=1)
    return Xf

if __name__ == "__main__":
    X, y = load()
    Xf = engineer(X)
    Xtr, Xte, ytr, yte = train_test_split(Xf, y, test_size=0.2, random_state=42, stratify=y)
    model = GradientBoostingClassifier(n_estimators=300, max_depth=3,
                                       learning_rate=0.05, random_state=42)
    model.fit(Xtr, ytr)
    auc = roc_auc_score(yte, model.predict_proba(Xte)[:,1])
    print(f"Test ROC-AUC = {auc:.4f}")
    joblib.dump({"model":model, "features":list(Xf.columns), "auc":round(float(auc),4)}, "model.joblib")
    print("Saved model.joblib")
