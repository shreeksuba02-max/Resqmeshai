import fs from 'fs';
import path from 'path';
import type { AiPredictionInput, AiPredictionOutput, PriorityLevel } from './types.js';

interface TreeNode {
  leaf: boolean;
  feature?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  class?: number;
  probs?: number[];
}

interface TrainedRfArtifact {
  model_type: string;
  version: string;
  trained_at: string;
  categories: string[];
  priority_classes: PriorityLevel[];
  recommended_response_map: Record<string, string>;
  evaluation: {
    accuracy: number;
    macro_f1: number;
    per_class: Record<string, { precision: number; recall: number; f1: number; support: number }>;
    confusion_matrix: number[][];
  };
  trees: TreeNode[];
}

const CATEGORIES = [
  'COLLAPSE_TRAPPED',
  'MEDICAL_CARDIAC_TRAUMA',
  'FLOOD_SUBMERSION',
  'FIRE_HAZMAT',
  'LANDSLIDE',
  'SHELTER_SUPPLY',
  'GENERAL_SOS',
];

const RECOMMENDED_RESPONSE: Record<string, string> = {
  COLLAPSE_TRAPPED: 'Urban Search & Rescue (USAR) + Heavy Extraction',
  MEDICAL_CARDIAC_TRAUMA: 'Paramedic Trauma Team + Air/Ambulance Evac',
  FLOOD_SUBMERSION: 'Swift-Water Boat Unit + Helicopter Winch',
  FIRE_HAZMAT: 'Fire Suppression + Hazmat Containment Unit',
  LANDSLIDE: 'Geo-Rescue + Excavator & Canine Squad',
  SHELTER_SUPPLY: 'Relief Logistics + Medical Aid Drop',
  GENERAL_SOS: 'Rapid Reconnaissance & Field Triage Team',
};

let cachedModel: TrainedRfArtifact | null = null;

function loadTrainedModel(): TrainedRfArtifact | null {
  if (cachedModel) return cachedModel;
  const candidate = path.resolve(
    process.cwd(),
    'RescueMeshAI',
    'ai-engine',
    'models',
    'rf_severity_model.json'
  );
  if (!fs.existsSync(candidate)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(candidate, 'utf-8');
    cachedModel = JSON.parse(raw) as TrainedRfArtifact;
    return cachedModel;
  } catch {
    return null;
  }
}

export function getModelEvaluationSummary() {
  const model = loadTrainedModel();
  if (!model) return null;
  return {
    modelType: model.model_type,
    version: model.version,
    trainedAt: model.trained_at,
    evaluation: model.evaluation,
  };
}

export function priorityToNumeric(priority: PriorityLevel): number {
  switch (priority) {
    case 'CRITICAL':
      return 1;
    case 'HIGH':
      return 2;
    case 'MEDIUM':
      return 3;
    case 'LOW':
      return 4;
  }
}

export function ruleBasedFallback(input: AiPredictionInput): AiPredictionOutput {
  const category = String(input.emergencyCategory || 'GENERAL_SOS');
  const injured = input.injuryStatus ? 1 : 0;
  const victims = Math.max(1, Number(input.victimCount) || 1);
  const fire = input.firePresent ? 1 : 0;
  const flood = Math.max(0, Math.min(3, Number(input.floodSeverity) || 0));
  const medical = Math.max(0, Math.min(3, Number(input.medicalUrgency) || 0));
  const trapped = input.trappedPersonStatus ? 1 : 0;
  const danger = Math.max(1, Math.min(5, Number(input.reportedDangerLevel) || 3));

  let score = 12;
  if (trapped) score += 26;
  if (fire) score += 22;
  if (injured) score += 15;
  score += flood * 8.5 + medical * 9.0 + Math.min(victims, 20) * 1.15 + danger * 4.8;
  if (category === 'COLLAPSE_TRAPPED' || category === 'MEDICAL_CARDIAC_TRAUMA') {
    score += 8;
  } else if (category === 'SHELTER_SUPPLY') {
    score -= 10;
  }

  const severityScore = Math.max(0, Math.min(100, Math.round(score)));
  let priority: PriorityLevel = 'LOW';
  if (severityScore >= 74) priority = 'CRITICAL';
  else if (severityScore >= 52) priority = 'HIGH';
  else if (severityScore >= 30) priority = 'MEDIUM';

  return {
    severityScore,
    priority,
    priorityNumeric: priorityToNumeric(priority),
    recommendedResponseCategory:
      RECOMMENDED_RESPONSE[category] || RECOMMENDED_RESPONSE.GENERAL_SOS,
    confidence: null,
    modelSource: 'rule_based_fallback',
    advisoryNote: 'Rule-based fallback active; rescue commander verification required.',
  };
}

export function predictEmergencySeverity(input: AiPredictionInput): AiPredictionOutput {
  if (input.useFallbackOnly) {
    return ruleBasedFallback(input);
  }

  const model = loadTrainedModel();
  if (!model || !Array.isArray(model.trees) || model.trees.length === 0) {
    return ruleBasedFallback(input);
  }

  const category = String(input.emergencyCategory || 'GENERAL_SOS');
  const catIdx = CATEGORIES.includes(category)
    ? CATEGORIES.indexOf(category)
    : CATEGORIES.indexOf('GENERAL_SOS');

  const x = [
    catIdx,
    input.injuryStatus ? 1 : 0,
    Math.max(1, Number(input.victimCount) || 1),
    input.firePresent ? 1 : 0,
    Math.max(0, Math.min(3, Number(input.floodSeverity) || 0)),
    Math.max(0, Math.min(3, Number(input.medicalUrgency) || 0)),
    input.trappedPersonStatus ? 1 : 0,
    Math.max(1, Math.min(5, Number(input.reportedDangerLevel) || 3)),
  ];

  const classes = model.priority_classes;
  const avgProbs = new Array(classes.length).fill(0);

  for (const tree of model.trees) {
    let node: TreeNode | undefined = tree;
    while (node && !node.leaf) {
      const feat: number = node.feature ?? 0;
      const thresh: number = node.threshold ?? 0;
      node = x[feat] <= thresh ? node.left : node.right;
    }
    if (node?.probs) {
      for (let i = 0; i < classes.length; i++) {
        avgProbs[i] += node.probs[i] ?? 0;
      }
    }
  }

  const nTrees = model.trees.length;
  for (let i = 0; i < classes.length; i++) {
    avgProbs[i] /= nTrees;
  }

  let bestIdx = 0;
  for (let i = 1; i < classes.length; i++) {
    if (avgProbs[i] > avgProbs[bestIdx]) bestIdx = i;
  }

  const priority = classes[bestIdx];
  const weights = [92, 66, 41, 18]; // CRITICAL, HIGH, MEDIUM, LOW
  const rawScore = avgProbs.reduce((acc, p, idx) => acc + p * weights[idx], 0);
  const severityScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  const classProbabilities: Record<string, number> = {};
  classes.forEach((cls, idx) => {
    classProbabilities[cls] = Number(avgProbs[idx].toFixed(4));
  });

  return {
    severityScore,
    priority,
    priorityNumeric: priorityToNumeric(priority),
    recommendedResponseCategory:
      RECOMMENDED_RESPONSE[category] || RECOMMENDED_RESPONSE.GENERAL_SOS,
    confidence: Number(avgProbs[bestIdx].toFixed(4)),
    classProbabilities,
    modelSource: 'random_forest_classifier',
    modelEvaluation: model.evaluation,
    advisoryNote: 'AI score supports rescue-team triage; human commander makes final dispatch.',
  };
}
