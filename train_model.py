"""
RescueMesh AI - Scikit-learn Random Forest Training Pipeline
For environments with scikit-learn, numpy, and pandas installed.
Trains a RandomForestClassifier on disaster triage features, performs
5-fold cross-validation, evaluates classification metrics, and persists
the model with joblib.
"""

import json
import os
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, accuracy_score, f1_score
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split

from train_pure_rf import generate_disaster_dataset, PRIORITY_CLASSES


def main():
    raw = generate_disaster_dataset(n_samples=2400, seed=2026)
    df = pd.DataFrame([r["x"] for r in raw], columns=[
        "emergencyCategoryIdx",
        "injuryStatus",
        "victimCount",
        "firePresent",
        "floodSeverity",
        "medicalUrgency",
        "trappedPersonStatus",
        "reportedDangerLevel",
    ])
    y = np.array([r["y"] for r in raw])

    X_train, X_test, y_train, y_test = train_test_split(
        df, y, test_size=0.2, random_state=42, stratify=y
    )

    clf = RandomForestClassifier(
        n_estimators=100,
        max_depth=8,
        min_samples_split=6,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X_train, y_train)

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(clf, X_train, y_train, cv=cv, scoring="f1_macro")

    preds = clf.predict(X_test)
    acc = accuracy_score(y_test, preds)
    macro_f1 = f1_score(y_test, preds, average="macro")

    print(f"5-Fold CV Macro-F1: {cv_scores.mean():.4f} (+/- {cv_scores.std():.4f})")
    print(f"Test Accuracy: {acc:.4f} | Test Macro-F1: {macro_f1:.4f}")
    print(classification_report(y_test, preds, target_names=PRIORITY_CLASSES))

    out_dir = os.path.join(os.path.dirname(__file__), "..", "models")
    os.makedirs(out_dir, exist_ok=True)
    joblib.dump(clf, os.path.join(out_dir, "rf_severity_sklearn.joblib"))
    with open(os.path.join(out_dir, "sklearn_metrics.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "cv_macro_f1_mean": round(float(cv_scores.mean()), 4),
                "test_accuracy": round(float(acc), 4),
                "test_macro_f1": round(float(macro_f1), 4),
            },
            f,
            indent=2,
        )


if __name__ == "__main__":
    main()
