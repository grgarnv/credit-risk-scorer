# Credit Risk Intelligence Platform

An explainable credit-default scoring platform. It scores individual applicants in real time,
explains **why** each decision was made, scores entire portfolios in bulk, and lets a risk
analyst run what-if scenarios — all behind a Material-styled React interface.

**[▶ Live Demo](https://credit-risk-scorer-psi.vercel.app/)** · **[Source](https://github.com/grgarnv/credit-risk-scorer)**

**Stack:** React (Vite) · Recharts · FastAPI · scikit-learn · SHAP · Render + Vercel

![screenshot](screenshot.png)

---

## Why this project exists

Most student credit-scoring projects stop at "train a classifier, print the accuracy." That
misses what a lending business actually needs: a decision it can **defend**, at a threshold
that reflects **what mistakes cost**, across a **whole book** of customers rather than one row.

This project is built around those three gaps.

---

## The three decisions that shape the model

### 1. AUC over accuracy — because the classes are imbalanced

The dataset defaults at **22%**. A model that predicts "nobody defaults" scores **78% accuracy**
while catching precisely zero defaulters. Accuracy is actively misleading here.

The model is therefore optimised and reported on **ROC-AUC**, which measures how well it *ranks*
customers by risk — the property that actually matters when you have limited review capacity and
need to know who to look at first.

**Test ROC-AUC: 0.7826** (stratified 20% hold-out, 6,000 customers).

### 2. The decision threshold comes from cost, not convention

A naive classifier splits at 0.5. But the two errors are not equally expensive:

| Error | What it means | Relative cost |
|---|---|---|
| **False negative** | Approve someone who defaults | ~**5×** |
| **False positive** | Reject someone who would have paid | 1× |

With a 5:1 cost ratio, the break-even probability is:

```
threshold = FP_cost / (FP_cost + FN_cost) = 1 / (1 + 5) = 0.167
```

So the platform routes applicants into three bands rather than a binary yes/no:

- **Approve** — risk < 16.7%
- **Manual review** — 16.7% to 50%
- **Decline** — risk ≥ 50%

This is the single most important design decision in the project: the cutoff is *derived from the
business cost structure*, not inherited from a library default.

### 3. Every score is explainable

Lending decisions have to be justifiable — to the customer, and to a regulator. The platform
computes **SHAP values** per prediction, so each score comes with a ranked breakdown of which
factors pushed it up or down, in plain language ("Credit utilization increases risk").

---

## Feature engineering

Four domain features are derived from the raw statement columns. These encode credit-risk
intuition that a raw column dump would miss:

| Feature | Definition | Why it matters |
|---|---|---|
| `utilization` | current bill ÷ credit limit | How maxed-out the card is — a classic distress signal |
| `pay_to_bill` | total paid ÷ total billed (6 mo) | Whether the customer can actually pay the balance down |
| `max_delay` | worst repayment-status month | Peak delinquency severity |
| `n_months_late` | count of months in arrears | Whether delinquency is a blip or chronic |

Empirically, the recent repayment-status features and these derived indicators dominate the
model's feature importance — **how someone paid last month is the strongest predictor of whether
they default next month**, which matches domain expectation.

---

## What the application does

### Score applicant
Enter an applicant's profile and get an instant decision:
- Animated **risk ring** with the default probability
- **Decision** (approve / review / decline) and a **credit grade band** (A–F)
- A **threshold position bar** showing where this applicant sits across the three decision zones
- **SHAP waterfall** ranking the factors behind *this specific* score
- **Derived indicators** (utilization, payment ratio, delinquency) that highlight amber when they breach risk levels
- One-click presets — *Prime borrower*, *Average customer*, *Distressed* — for instant comparison

### Portfolio
Score **hundreds or thousands of applicants at once** and view aggregate analytics:
- Average and median risk, high-risk count
- **Total exposure** and **expected loss** in dollars (`Σ P(default) × exposure × LGD`)
- Risk-distribution histogram, decision-mix breakdown, grade-band distribution
- **CSV export** of all scored results

This reframes the model from a single-row calculator into something that reasons about a **book of
business** — which is how lenders actually think.

### What-if analysis
Hold an applicant constant and **sweep a single variable** (repayment status, credit limit, bill
amount, payment amount, age) to see its marginal effect on risk, with the review and decline
thresholds drawn on the chart. Useful for questions like *"how much would this customer need to pay
down to move from Review into Approve?"*

### Model
Global feature importances, headline metrics, and a written methodology panel covering the
reasoning above.

---

## Architecture

```
React (Vite) frontend          FastAPI backend              Model layer
┌────────────────────┐        ┌──────────────────┐        ┌─────────────────────┐
│ Score / Portfolio  │  HTTP  │ /predict         │        │ GradientBoosting    │
│ What-if / Model    │───────▶│ /predict/batch   │───────▶│ + SHAP TreeExplainer│
│ Recharts visuals   │        │ /simulate        │        │ loaded once at boot │
└────────────────────┘        │ /model-info      │        └─────────────────────┘
                              └──────────────────┘
```

The model is trained **once at build time** and serialised to `model.joblib`; the API loads it at
startup rather than retraining per request.

### API

| Endpoint | Method | Purpose |
|---|---|---|
| `/` | GET | Health check + model metadata |
| `/predict` | POST | Score one applicant, with SHAP explanation and decision |
| `/predict/batch` | POST | Score up to 5,000 applicants, with portfolio analytics |
| `/simulate` | POST | Sweep one field across values, return the risk curve |
| `/threshold-analysis` | GET | Cost curve across thresholds for a given cost ratio |
| `/model-info` | GET | Feature importances, metrics, cost assumptions |

---

## Dataset

[UCI — Default of Credit Card Clients](https://archive.ics.uci.edu/dataset/350/default+of+credit+card+clients)
· 30,000 customers · 23 features (credit limit, demographics, and six months of repayment status,
bill amounts and payment amounts) · 22% default rate.

---

## Running locally

**Backend**
```bash
cd backend
pip install -r requirements.txt
python train_model.py        # downloads the dataset, trains, saves model.joblib
uvicorn main:app --reload    # http://localhost:8000
```

**Frontend**
```bash
cd frontend
npm install
npm run dev                  # http://localhost:5173
```

## Deployment

- **Backend → Render** — Python service; build runs `pip install -r requirements.txt && python train_model.py`, start runs `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Frontend → Vercel** — root directory `frontend`, env var `VITE_API_URL` set to the Render backend URL

> The backend runs on a free tier that sleeps after inactivity — the first request after an idle
> period may take 30–60 seconds to wake.

---

## What I'd build next

- **Probability calibration** (Platt / isotonic) so scores read as true default probabilities suitable for risk-based pricing
- **CSV upload** for portfolio scoring, replacing the synthetic generator
- **Decision audit log** persisting every score with its explanation, for compliance review
- **Segment monitoring** to detect population drift between training and live traffic
