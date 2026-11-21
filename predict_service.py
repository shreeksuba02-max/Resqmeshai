"""
RescueMesh AI - Emergency Severity Prediction Service
Supports trained Random Forest artifact (rf_severity_model.json) with
automatic deterministic rule-based fallback if the model file is unavailable.
"""

from __future__ import annotations

import json
import os
from typing import Any

MODEL_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "models", "rf_severity_model.json")
)

CATEGORIES = [
    "COLLAPSE_TRAPPED",
    "MEDICAL_CARDIAC_TRAUMA",
    "FLOOD_SUBMERSION",
    "FIRE_HAZMAT",
    "LANDSLIDE",
    "SHELTER_SUPPLY",
    "GENERAL_SOS",
]

RECOMMENDED_RESPONSE = {
    "COLLAPSE_TRAPPED": "Urban Search & Rescue (USAR) + Heavy Extraction",
    "MEDICAL_CARDIAC_TRAUMA": "Paramedic Trauma Team + Air/Ambulance Evac",
    "FLOOD_SUBMERSION": "Swift-Water Boat Unit + Helicopter Winch",
    "FIRE_HAZMAT": "Fire Suppression + Hazmat Containment Unit",
    "LANDSLIDE": "Geo-Rescue + Excavator & Canine Squad",
    "SHELTER_SUPPLY": "Relief Logistics + Medical Aid Drop",
    "GENERAL_SOS": "Rapid Reconnaissance & Field Triage Team",
}


def rule_based_fallback(payload: dict[str, Any]) -> dict[str, Any]:
    category = str(payload.get("emergencyCategory", "GENERAL_SOS"))
    injured = 1 if payload.get("injuryStatus") else 0
    victims = max(1, int(payload.get("victimCount", 1)))
    fire = 1 if payload.get("firePresent") else 0
    flood = max(0, min(3, int(payload.get("floodSeverity", 0))))
    medical = max(0, min(3, int(payload.get("medicalUrgency", 0))))
    trapped = 1 if payload.get("trappedPersonStatus") else 0
    danger = max(1, min(5, int(payload.get("reportedDangerLevel", 3))))

    score = 12.0
    if trapped:
        score += 26.0
    if fire:
        score += 22.0
    if injured:
        score += 15.0
    score += flood * 8.5 + medical * 9.0 + min(victims, 20) * 1.15 + danger * 4.8
    if category in ("COLLAPSE_TRAPPED", "MEDICAL_CARDIAC_TRAUMA"):
        score += 8.0
    elif category == "SHELTER_SUPPLY":
        score -= 10.0

    clamped = max(0, min(100, round(score)))
    if clamped >= 74:
        priority = "CRITICAL"
    elif clamped >= 52:
        priority = "HIGH"
    elif clamped >= 30:
        priority = "MEDIUM"
    else:
        priority = "LOW"

    return {
        "severityScore": clamped,
        "priority": priority,
        "recommendedResponseCategory": RECOMMENDED_RESPONSE.get(
            category, RECOMMENDED_RESPONSE["GENERAL_SOS"]
        ),
        "confidence": None,
        "modelSource": "rule_based_fallback",
        "advisoryNote": "AI score is advisory; rescue commander verification required.",
    }


def predict_severity(payload: dict[str, Any]) -> dict[str, Any]:
    if not os.path.exists(MODEL_PATH):
        return rule_based_fallback(payload)

    with open(MODEL_PATH, "r", encoding="utf-8") as f:
        artifact = json.load(f)

    category = str(payload.get("emergencyCategory", "GENERAL_SOS"))
    cat_idx = CATEGORIES.index(category) if category in CATEGORIES else CATEGORIES.index("GENERAL_SOS")
    x = [
        float(cat_idx),
        1.0 if payload.get("injuryStatus") else 0.0,
        float(max(1, int(payload.get("victimCount", 1)))),
        1.0 if payload.get("firePresent") else 0.0,
        float(max(0, min(3, int(payload.get("floodSeverity", 0))))),
        float(max(0, min(3, int(payload.get("medicalUrgency", 0))))),
        1.0 if payload.get("trappedPersonStatus") else 0.0,
        float(max(1, min(5, int(payload.get("reportedDangerLevel", 3))))),
    ]

    classes = artifact["priority_classes"]
    avg_probs = [0.0] * len(classes)
    trees = artifact["trees"]

    for tree in trees:
        node = tree
        while not node["leaf"]:
            node = node["left"] if x[node["feature"]] <= node["threshold"] else node["right"]
        for i, p in enumerate(node["probs"]):
            avg_probs[i] += p

    n = len(trees)
    avg_probs = [p / n for p in avg_probs]
    pred_idx = max(range(len(classes)), key=lambda i: avg_probs[i])
    priority = classes[pred_idx]

    # Map class probability distribution to continuous 0-100 severity score
    weights = [92.0, 66.0, 41.0, 18.0]  # CRITICAL, HIGH, MEDIUM, LOW
    severity_score = max(0, min(100, round(sum(p * w for p, w in zip(avg_probs, weights)))))

    return {
        "severityScore": severity_score,
        "priority": priority,
        "recommendedResponseCategory": RECOMMENDED_RESPONSE.get(
            category, RECOMMENDED_RESPONSE["GENERAL_SOS"]
        ),
        "confidence": round(avg_probs[pred_idx], 4),
        "classProbabilities": {c: round(p, 4) for c, p in zip(classes, avg_probs)},
        "modelSource": "random_forest_classifier",
        "modelEvaluation": artifact["evaluation"],
        "advisoryNote": "AI score supports triage; rescue teams retain final decision authority.",
    }
