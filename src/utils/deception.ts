import type {
  Enemy,
  EnemyIntent,
  EnemyIntentWithDeception,
  DeceptionType,
  EnemyMemory,
  DeceptionGameState,
  ScannerState,
  EnemyTacticalBonus,
  GameConfig,
} from '../types';
import { defaultConfig } from '../data/defaultConfig';

const intentIcons: Record<string, string> = {
  attack: '⚔️',
  defend: '🛡️',
  charge: '⚡',
  special: '💥',
  repair: '🔧',
};

const intentLabels: Record<string, string> = {
  attack: '攻击',
  defend: '防御',
  charge: '蓄力',
  special: '特殊技能',
  repair: '维修',
};

export function createDefaultDeceptionState(): DeceptionGameState {
  return {
    enemyMemory: {},
    scannerState: {
      scanPoints: 0,
      revealThreshold: defaultConfig.scanRevealThreshold,
      activeScanBonus: 0,
      consecutiveMisjudgments: 0,
      maxMisjudgmentPenalty: defaultConfig.maxConsecutiveMisjudgments,
      lastScanResult: 'none',
    },
    tacticalBonus: null,
    currentBattleIntentRevealed: false,
  };
}

export function createEnemyMemory(enemyType: string): EnemyMemory {
  return {
    enemyType,
    totalEncounters: 0,
    timesDisguised: 0,
    timesRevealed: 0,
    deceptionHistory: [],
    intentPatterns: {
      attack: 0,
      defend: 0,
      charge: 0,
      special: 0,
      repair: 0,
    },
    credibility: 1.0,
    lastEncounterTime: Date.now(),
  };
}

function generateFakeIntent(
  trueIntent: EnemyIntent,
  deceptionType: DeceptionType,
  enemy: Enemy
): EnemyIntent {
  switch (deceptionType) {
    case 'fake_attack':
      return {
        type: 'attack',
        value: Math.floor(enemy.attack * (0.8 + Math.random() * 0.4)),
        description: '准备攻击',
        icon: intentIcons.attack,
      };
    case 'fake_defend':
      return {
        type: 'defend',
        value: Math.floor(enemy.attack * 0.5),
        description: '进入防御姿态',
        icon: intentIcons.defend,
      };
    case 'fake_charge':
      return {
        type: 'charge',
        value: Math.floor(enemy.attack * 1.5),
        description: '蓄力中...',
        icon: intentIcons.charge,
      };
    case 'hide_special':
      return {
        type: 'attack',
        value: Math.floor(enemy.attack * (0.8 + Math.random() * 0.4)),
        description: '准备攻击',
        icon: intentIcons.attack,
      };
    default:
      return trueIntent;
  }
}

function getDeceptionTypeForIntent(
  trueIntentType: string,
  preferredDeceptions: DeceptionType[]
): DeceptionType {
  const availableDeceptions: DeceptionType[] = [];

  if (trueIntentType === 'defend' || trueIntentType === 'repair') {
    availableDeceptions.push('fake_attack');
  }
  if (trueIntentType === 'attack' || trueIntentType === 'charge' || trueIntentType === 'special') {
    availableDeceptions.push('fake_defend');
  }
  if (trueIntentType === 'special') {
    availableDeceptions.push('hide_special');
  }
  if (trueIntentType !== 'charge') {
    availableDeceptions.push('fake_charge');
  }

  const preferredAvailable = preferredDeceptions.filter(d => availableDeceptions.includes(d));

  if (preferredAvailable.length > 0 && Math.random() < 0.7) {
    return preferredAvailable[Math.floor(Math.random() * preferredAvailable.length)];
  }

  if (availableDeceptions.length > 0) {
    return availableDeceptions[Math.floor(Math.random() * availableDeceptions.length)];
  }

  return 'none';
}

export function applyDeceptionToIntent(
  trueIntent: EnemyIntent,
  enemy: Enemy,
  config: GameConfig,
  memory?: EnemyMemory
): EnemyIntentWithDeception {
  let isDisguised = false;
  let deceptionType: DeceptionType = 'none';
  let displayedIntent: EnemyIntent = trueIntent;
  let revealLevel = 0;

  if (memory) {
    revealLevel = Math.min(
      config.maxStartingRevealLevel,
      Math.floor(memory.timesRevealed * config.revealAccuracyPerMemory * 10)
    );

    const memoryCredibility = Math.max(0, memory.credibility - config.memoryCredibilityDecayRate);
    const deceptionChance = enemy.deceptionChance * memoryCredibility;

    if (Math.random() < deceptionChance) {
      isDisguised = true;
      deceptionType = getDeceptionTypeForIntent(trueIntent.type, enemy.preferredDeceptions);
      displayedIntent = generateFakeIntent(trueIntent, deceptionType, enemy);
    }
  } else {
    if (Math.random() < enemy.deceptionChance) {
      isDisguised = true;
      deceptionType = getDeceptionTypeForIntent(trueIntent.type, enemy.preferredDeceptions);
      displayedIntent = generateFakeIntent(trueIntent, deceptionType, enemy);
    }
  }

  return {
    ...displayedIntent,
    isDisguised,
    deceptionType,
    trueIntent,
    isRevealed: revealLevel >= config.maxStartingRevealLevel,
    revealLevel,
  };
}

export function attemptScanReveal(
  intent: EnemyIntentWithDeception,
  scanPoints: number,
  config: GameConfig
): { revealed: boolean; newIntent: EnemyIntentWithDeception; pointsUsed: number } {
  if (!intent.isDisguised || intent.isRevealed) {
    return { revealed: true, newIntent: intent, pointsUsed: 0 };
  }

  const revealChance = Math.min(0.95, scanPoints * config.scanPointsPerReveal);
  const isRevealed = Math.random() < revealChance;
  const pointsUsed = Math.min(scanPoints, config.scanRevealThreshold);

  const newIntent: EnemyIntentWithDeception = {
    ...intent,
    isRevealed,
    revealLevel: isRevealed ? config.maxStartingRevealLevel : intent.revealLevel + 1,
  };

  if (isRevealed) {
    newIntent.type = intent.trueIntent.type;
    newIntent.value = intent.trueIntent.value;
    newIntent.description = intent.trueIntent.description;
    newIntent.icon = intent.trueIntent.icon;
  }

  return { revealed: isRevealed, newIntent, pointsUsed };
}

export function updateEnemyMemory(
  memory: EnemyMemory,
  intent: EnemyIntentWithDeception,
  wasRevealed: boolean,
  config: GameConfig
): EnemyMemory {
  const newMemory = { ...memory };

  newMemory.totalEncounters += 1;
  newMemory.lastEncounterTime = Date.now();

  const trueType = intent.trueIntent.type;
  newMemory.intentPatterns[trueType] = (newMemory.intentPatterns[trueType] || 0) + 1;

  if (intent.isDisguised) {
    newMemory.timesDisguised += 1;
    newMemory.deceptionHistory.push(intent.deceptionType);
    if (newMemory.deceptionHistory.length > 20) {
      newMemory.deceptionHistory = newMemory.deceptionHistory.slice(-20);
    }
  }

  if (wasRevealed && intent.isDisguised) {
    newMemory.timesRevealed += 1;
    newMemory.credibility = Math.max(
      0.3,
      newMemory.credibility - config.memoryCredibilityDecayRate * 2
    );
  } else if (!wasRevealed && intent.isDisguised) {
    newMemory.credibility = Math.min(
      1.0,
      newMemory.credibility + config.memoryCredibilityDecayRate
    );
  }

  return newMemory;
}

export function registerMisjudgment(
  scannerState: ScannerState,
  config: GameConfig,
  existingBonus?: EnemyTacticalBonus | null
): { scannerState: ScannerState; tacticalBonus: EnemyTacticalBonus | null } {
  const newScannerState = { ...scannerState };
  newScannerState.consecutiveMisjudgments += 1;
  newScannerState.lastScanResult = 'misjudged';

  let tacticalBonus: EnemyTacticalBonus | null = null;

  if (existingBonus) {
    tacticalBonus = {
      ...existingBonus,
      duration: Math.max(existingBonus.duration, config.misjudgmentDuration),
    };
  } else if (newScannerState.consecutiveMisjudgments >= 2) {
    const bonusMultiplier = Math.min(
      1 + (newScannerState.consecutiveMisjudgments - 1) * 0.5,
      2
    );
    tacticalBonus = {
      attackBonus: config.misjudgmentAttackBonus * bonusMultiplier,
      defenseBonus: config.misjudgmentDefenseBonus * bonusMultiplier,
      evasionBonus: 0.05 * bonusMultiplier,
      duration: config.misjudgmentDuration,
      maxDuration: config.misjudgmentDuration,
      source: 'misjudgment',
    };
  }

  return { scannerState: newScannerState, tacticalBonus };
}

export function registerReveal(
  scannerState: ScannerState
): ScannerState {
  return {
    ...scannerState,
    consecutiveMisjudgments: 0,
    lastScanResult: 'revealed',
  };
}

export function updateTacticalBonus(
  tacticalBonus: EnemyTacticalBonus | null
): EnemyTacticalBonus | null {
  if (!tacticalBonus) return null;

  const newBonus = { ...tacticalBonus };
  newBonus.duration -= 1;

  if (newBonus.duration <= 0) {
    return null;
  }

  return newBonus;
}

export function applyTacticalBonusToEnemy(
  enemy: Enemy,
  tacticalBonus: EnemyTacticalBonus | null
): Enemy {
  if (!tacticalBonus) return enemy;

  return {
    ...enemy,
    attack: Math.floor(enemy.attack * (1 + tacticalBonus.attackBonus)),
    defense: Math.min(0.8, enemy.defense + tacticalBonus.defenseBonus),
    evasion: Math.min(0.8, enemy.evasion + tacticalBonus.evasionBonus),
  };
}

export function getEffectiveIntent(
  intent: EnemyIntentWithDeception
): EnemyIntent {
  return intent.trueIntent;
}

export function getDeceptionDescription(deceptionType: DeceptionType): string {
  switch (deceptionType) {
    case 'fake_attack':
      return '伪装攻击';
    case 'fake_defend':
      return '诱导防御';
    case 'hide_special':
      return '隐藏特殊技能';
    case 'fake_charge':
      return '假充能状态';
    default:
      return '无伪装';
  }
}

export function getDeceptionHint(intent: EnemyIntentWithDeception): string {
  if (!intent.isDisguised) return '';
  if (intent.isRevealed) return `已识破：${getDeceptionDescription(intent.deceptionType)}`;

  if (intent.revealLevel >= 2) {
    return '意图可信度较低，建议扫描确认';
  }
  if (intent.revealLevel >= 1) {
    return '检测到异常信号...';
  }
  return '';
}
