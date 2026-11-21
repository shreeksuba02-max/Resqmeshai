"""
RescueMesh AI - Pure Python Random Forest Trainer & Evaluator
Trains a 25-tree Random Forest Classifier (CART with Gini impurity & bootstrap
feature bagging) on 2,400 disaster triage records, evaluates on a held-out
20% stratified test split, and exports the trained model + evaluation metrics
to RescueMeshAI/ai-engine/models/rf_severity_model.json.

No external ML dependencies required; runs directly on Python 3.11 stdlib.
"""

from __future__ import annotations

import json
import math
import os
import random
from collections import Counter
from datetime import datetime, timezone
from typing import Any

CATEGORIES = [
    "COLLAPSE_TRAPPED",
    "MEDICAL_CARDIAC_TRAUMA",
    "FLOOD_SUBMERSION",
    "FIRE_HAZMAT",
    "LANDSLIDE",
    "SHELTER_SUPPLY",
    "GENERAL_SOS",
]

PRIORITY_CLASSES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]

RECOMMENDED_RESPONSE_MAP = {
    "COLLAPSE_TRAPPED": "Urban Search & Rescue (USAR) + Heavy Extraction",
    "MEDICAL_CARDIAC_TRAUMA": "Paramedic Trauma Team + Air/Ambulance Evac",
    "FLOOD_SUBMERSION": "Swift-Water Boat Unit + Helicopter Winch",
    "FIRE_HAZMAT": "Fire Suppression + Hazmat Containment Unit",
    "LANDSLIDE": "Geo-Rescue + Excavator & Canine Squad",
    "SHELTER_SUPPLY": "Relief Logistics + Medical Aid Drop",
    "GENERAL_SOS": "Rapid Reconnaissance & Field Triage Team",
}


def generate_disaster_dataset(n_samples: int = 2400, seed: int = 2026) -> list[dict[str, Any]]:
    rng = random.Random(seed)
    rows: list[dict[str, Any]] = []

    for _ in range(n_samples):
        category_idx = rng.randrange(len(CATEGORIES))
        category = CATEGORIES[category_idx]

        injured = 1 if rng.random() < (0.72 if category in ("MEDICAL_CARDIAC_TRAUMA", "COLLAPSE_TRAPPED") else 0.35) else 0
        victim_count = rng.choices([1, 2, 3, 5, 8, 15, 25], weights=[30, 22, 16, 14, 10, 5, 3])[0]
        fire_present = 1 if (category == "FIRE_HAZMAT" and rng.random() < 0.88) or rng.random() < 0.14 else 0
        flood_severity = (
            rng.choices([0, 1, 2, 3], weights=[5, 15, 40, 40])[0]
            if category == "FLOOD_SUBMERSION"
            else rng.choices([0, 1, 2, 3], weights=[62, 20, 12, 6])[0]
        )
        medical_urgency = (
            rng.choices([1, 2, 3], weights=[15, 35, 50])[0]
            if category == "MEDICAL_CARDIAC_TRAUMA" or injured
            else rng.choices([0, 1, 2, 3], weights=[45, 30, 18, 7])[0]
        )
        trapped = (
            1
            if (category in ("COLLAPSE_TRAPPED", "LANDSLIDE") and rng.random() < 0.82)
            or rng.random() < 0.18
            else 0
        )
        danger_level = rng.choices([1, 2, 3, 4, 5], weights=[10, 18, 28, 24, 20])[0]

        # Ground-truth triage clinical & disaster risk score (with realistic label noise)
        score = 12.0
        if trapped:
            score += 26.0
        if fire_present:
            score += 22.0
        if injured:
            score += 15.0
        score += flood_severity * 8.5
        score += medical_urgency * 9.0
        score += min(victim_count, 20) * 1.15
        score += danger_level * 4.8

        if category in ("COLLAPSE_TRAPPED", "MEDICAL_CARDIAC_TRAUMA"):
            score += 8.0
        elif category == "SHELTER_SUPPLY":
            score -= 10.0

        # Add realistic field reporting variance
        noisy_score = score + rng.gauss(0, 4.2)
        if noisy_score >= 74:
            label = "CRITICAL"
        elif noisy_score >= 52:
            label = "HIGH"
        elif noisy_score >= 30:
            label = "MEDIUM"
        else:
            label = "LOW"

        features = [
            float(category_idx),
            float(injured),
            float(victim_count),
            float(fire_present),
            float(flood_severity),
            float(medical_urgency),
            float(trapped),
            float(danger_level),
        ]
        rows.append({"x": features, "y": PRIORITY_CLASSES.index(label), "label": label})

    return rows


def gini_impurity(counts: list[int], total: int) -> float:
    if total == 0:
        return 0.0
    impurity = 1.0
    for c in counts:
        p = c / total
        impurity -= p * p
    return impurity


def build_tree(
    samples: list[dict[str, Any]],
    depth: int,
    max_depth: int,
    min_samples_split: int,
    max_features: int,
    rng: random.Random,
    n_classes: int = 4,
) -> dict[str, Any]:
    counts = [0] * n_classes
    for s in samples:
        counts[s["y"]] += 1

    total = len(samples)
    majority_class = max(range(n_classes), key=lambda idx: counts[idx])
    probs = [round(c / total, 4) if total else 0.0 for c in counts]

    # Stop criteria
    if depth >= max_depth or total < min_samples_split or counts[majority_class] == total:
        return {"leaf": True, "class": majority_class, "probs": probs}

    n_features = len(samples[0]["x"])
    feature_indices = rng.sample(range(n_features), k=min(max_features, n_features))

    best_gini = float("inf")
    best_feat = -1
    best_thresh = 0.0
    best_left: list[dict[str, Any]] = []
    best_right: list[dict[str, Any]] = []

    for feat in feature_indices:
        vals = sorted({s["x"][feat] for s in samples})
        if len(vals) <= 1:
            continue
        # Candidate split thresholds at midpoints
        thresholds = [(vals[i] + vals[i + 1]) / 2.0 for i in range(len(vals) - 1)]
        for thresh in thresholds:
            left_counts = [0] * n_classes
            right_counts = [0] * n_classes
            left_n = 0
            right_n = 0
            for s in samples:
                if s["x"][feat] <= thresh:
                    left_counts[s["y"]] += 1
                    left_n += 1
                else:
                    right_counts[s["y"]] += 1
                    right_n += 1
            if left_n == 0 or right_n == 0:
                continue
            g_left = gini_impurity(left_counts, left_n)
            g_right = gini_impurity(right_counts, right_n)
            weighted_gini = (left_n / total) * g_left + (right_n / total) * g_right
            if weighted_gini < best_gini:
                best_gini = weighted_gini
                best_feat = feat
                best_thresh = thresh

    if best_feat == -1:
        return {"leaf": True, "class": majority_class, "probs": probs}

    best_left = [s for s in samples if s["x"][best_feat] <= best_thresh]
    best_right = [s for s in samples if s["x"][best_feat] > best_thresh]

    return {
        "leaf": False,
        "feature": best_feat,
        "threshold": round(best_thresh, 4),
        "left": build_tree(best_left, depth + 1, max_depth, min_samples_split, max_features, rng, n_classes),
        "right": build_tree(best_right, depth + 1, max_depth, min_samples_split, max_features, rng, n_classes),
    }


def predict_tree(node: dict[str, Any], x: list[float]) -> list[float]:
    curr = node
    while not curr["leaf"]:
        if x[curr["feature"]] <= curr["threshold"]:
            curr = curr["left"]
        else:
            curr = curr["right"]
    return curr["probs"]


def predict_forest(trees: list[dict[str, Any]], x: list[float]) -> tuple[int, float, list[float]]:
    avg_probs = [0.0] * len(PRIORITY_CLASSES)
    for tree in trees:
        p = predict_tree(tree, x)
        for i in range(len(PRIORITY_CLASSES)):
            avg_probs[i] += p[i]
    n = len(trees)
    avg_probs = [p / n for p in avg_probs]
    pred_idx = max(range(len(PRIORITY_CLASSES)), key=lambda i: avg_probs[i])
    return pred_idx, avg_probs[pred_idx], avg_probs


def stratified_split(rows: list[dict[str, Any]], test_ratio: float = 0.2, seed: int = 42):
    rng = random.Random(seed)
    by_class: dict[int, list[dict[str, Any]]] = {i: [] for i in range(len(PRIORITY_CLASSES))}
    for r in rows:
        by_class[r["y"]].append(r)

    train: list[dict[str, Any]] = []
    test: list[dict[str, Any]] = []
    for cls_rows in by_class.values():
        rng.shuffle(cls_rows)
        cut = int(len(cls_rows) * (1.0 - test_ratio))
        train.extend(cls_rows[:cut])
        test.extend(cls_rows[cut:])
    rng.shuffle(train)
    rng.shuffle(test)
    return train, test


def train_and_evaluate():
    dataset = generate_disaster_dataset(n_samples=2400, seed=2026)
    train_set, test_set = stratified_split(dataset, test_ratio=0.2, seed=42)

    rng = random.Random(202601)
    n_trees = 40
    max_depth = 9
    min_samples_split = 5
    max_features = 4

    trees: list[dict[str, Any]] = []
    for _ in range(n_trees):
        bootstrap = [train_set[rng.randrange(len(train_set))] for _ in range(len(train_set))]
        tree = build_tree(bootstrap, 0, max_depth, min_samples_split, max_features, rng)
        trees.append(tree)

    # Evaluate on held-out test set
    confusion = [[0 for _ in PRIORITY_CLASSES] for _ in PRIORITY_CLASSES]
    correct = 0
    for row in test_set:
        pred_idx, _, _ = predict_forest(trees, row["x"])
        confusion[row["y"]][pred_idx] += 1
        if pred_idx == row["y"]:
            correct += 1

    accuracy = round(correct / len(test_set), 4)
    per_class_metrics = {}
    f1_sum = 0.0
    for idx, cls_name in enumerate(PRIORITY_CLASSES):
        tp = confusion[idx][idx]
        fp = sum(confusion[r][idx] for r in range(len(PRIORITY_CLASSES)) if r != idx)
        fn = sum(confusion[idx][c] for c in range(len(PRIORITY_CLASSES)) if c != idx)
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
        f1_sum += f1
        per_class_metrics[cls_name] = {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "support": sum(confusion[idx]),
        }

    macro_f1 = round(f1_sum / len(PRIORITY_CLASSES), 4)

    class_dist = Counter(r["label"] for r in dataset)

    artifact = {
        "model_type": "RandomForestClassifier (25 CART Bootstrap Trees)",
        "version": "1.0.0",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "feature_names": [
            "emergencyCategoryIdx",
            "injuryStatus",
            "victimCount",
            "firePresent",
            "floodSeverity",
            "medicalUrgency",
            "trappedPersonStatus",
            "reportedDangerLevel",
        ],
        "categories": CATEGORIES,
        "priority_classes": PRIORITY_CLASSES,
        "recommended_response_map": RECOMMENDED_RESPONSE_MAP,
        "dataset": {
            "total_samples": len(dataset),
            "train_samples": len(train_set),
            "test_samples": len(test_set),
            "class_distribution": dict(class_dist),
            "note": "Synthetic labeled disaster triage corpus for SIH26206 prototype validation",
        },
        "evaluation": {
            "accuracy": accuracy,
            "macro_f1": macro_f1,
            "per_class": per_class_metrics,
            "confusion_matrix": confusion,
        },
        "trees": trees,
    }

    out_dir = os.path.join(os.path.dirname(__file__), "..", "models")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.abspath(os.path.join(out_dir, "rf_severity_model.json"))
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(artifact, f, separators=(",", ":"))

    print(f"Trained {n_trees} trees | Train: {len(train_set)} | Test: {len(test_set)}")
    print(f"Held-out Accuracy: {accuracy:.4f} | Macro F1: {macro_f1:.4f}")
    print(f"Saved model artifact -> {out_path}")


if __name__ == "__main__":
    train_and_evaluate()
