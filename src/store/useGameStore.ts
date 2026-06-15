import { create } from 'zustand';
import type {
  BattleState, BattleRecord, BattleLogEntry,
  Enemy, ReplayData, ReplayAction,
  DeceptionGameState, EnemyMemory
} from '../types';
import { getRandomEnemy, generateEnemyIntent } from '../data/enemies';
import { useShipStore } from './useShipStore';
import { useDiceStore } from './useDiceStore';
import { useConfigStore } from './useConfigStore';
import {
  executePlayerActions,
  executeEnemyIntent,
  checkBattleEnd,
  calculateReward,
} from '../utils/battle';
import {
  addBattleRecord,
  loadBattleHistory,
  updateStats,
  loadDeceptionState,
  saveDeceptionState,
} from '../utils/storage';
import { unassignAllDice } from '../utils/dice';
import {
  createEnemyMemory,
  updateEnemyMemory,
  registerMisjudgment,
  registerReveal,
  updateTacticalBonus,
  applyTacticalBonusToEnemy,
  createDefaultDeceptionState,
} from '../utils/deception';

interface GameState {
  battleState: BattleState | null;
  battleHistory: BattleRecord[];
  currentDifficulty: number;
  replayData: ReplayData | null;
  replayIndex: number;
  isReplaying: boolean;
  replaySpeed: number;
  deceptionState: DeceptionGameState;

  startBattle: () => void;
  confirmTurn: () => void;
  fleeBattle: () => void;
  endBattle: (result: 'victory' | 'defeat' | 'fled') => void;
  addLog: (log: BattleLogEntry) => void;
  loadHistory: () => void;
  loadDeceptionState: () => void;
  startReplay: (recordId: string) => void;
  nextReplayStep: () => void;
  prevReplayStep: () => void;
  stopReplay: () => void;
  setReplaySpeed: (speed: number) => void;
  setDifficulty: (difficulty: number) => void;
  resetBattle: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  battleState: null,
  battleHistory: [],
  currentDifficulty: 1,
  replayData: null,
  replayIndex: -1,
  isReplaying: false,
  replaySpeed: 1,
  deceptionState: createDefaultDeceptionState(),

  loadDeceptionState: () => {
    const state = loadDeceptionState();
    set({ deceptionState: state });
  },

  startBattle: () => {
    const { currentDifficulty, deceptionState } = get();
    const shipStore = useShipStore.getState();
    const config = useConfigStore.getState().config;

    shipStore.applyUpgradeEffects();
    const player = { ...shipStore.ship };
    player.hp = player.maxHp;
    player.shield = player.maxShield;
    player.energy = player.maxEnergy;
    player.cabins = player.cabins.map(c => ({ ...c, damaged: false, cooldown: 0 }));

    let enemy = getRandomEnemy(currentDifficulty);

    const memory = deceptionState.enemyMemory[enemy.type] || createEnemyMemory(enemy.type);

    if (memory.timesRevealed > 0) {
      const accuracyBonus = Math.min(
        config.maxStartingRevealLevel,
        Math.floor(memory.timesRevealed * config.revealAccuracyPerMemory * 10)
      );
      if (accuracyBonus >= config.maxStartingRevealLevel && enemy.intent.isDisguised) {
        enemy.intent = {
          ...enemy.intent,
          isRevealed: true,
          type: enemy.intent.trueIntent.type,
          value: enemy.intent.trueIntent.value,
          description: enemy.intent.trueIntent.description,
          icon: enemy.intent.trueIntent.icon,
        };
      }
    }

    const newDeceptionState: DeceptionGameState = {
      ...deceptionState,
      currentBattleIntentRevealed: false,
      tacticalBonus: null,
      scannerState: {
        ...deceptionState.scannerState,
        scanPoints: 0,
        consecutiveMisjudgments: 0,
        lastScanResult: 'none' as const,
      },
    };
    saveDeceptionState(newDeceptionState);

    const battleState: BattleState = {
      id: `battle_${Date.now()}`,
      turn: 1,
      phase: 'player',
      player,
      enemy,
      logs: [{
        id: `log_${Date.now()}_start`,
        turn: 1,
        type: 'system',
        source: 'system',
        message: `战斗开始！遭遇 ${enemy.name}！`,
        timestamp: Date.now(),
      }],
      result: 'ongoing',
      startTime: Date.now(),
      rewardPoints: 0,
      scannerPointsUsed: 0,
      deceptionsRevealed: 0,
      misjudgments: 0,
    };

    const replayData: ReplayData = {
      initialState: JSON.parse(JSON.stringify(battleState)),
      actions: [],
    };

    set({
      battleState,
      replayData,
      replayIndex: -1,
      isReplaying: false,
      deceptionState: newDeceptionState,
    });

    useDiceStore.getState().resetDice();
  },

  confirmTurn: () => {
    const { battleState, replayData, deceptionState } = get();
    if (!battleState || battleState.phase !== 'player') return;

    const diceStore = useDiceStore.getState();
    const config = useConfigStore.getState().config;
    const shipStore = useShipStore.getState();

    const { dice } = diceStore;
    const displayedIntent = battleState.enemy.intent;
    const trueIntentType = displayedIntent.trueIntent.type;
    const wasDefending = trueIntentType === 'defend';
    let originalDefense = battleState.enemy.defense;

    let preparedEnemy = { ...battleState.enemy };
    if (wasDefending) {
      preparedEnemy.defense = preparedEnemy.defense + 0.2;
    }

    const playerResult = executePlayerActions(
      dice,
      battleState.player,
      preparedEnemy,
      config
    );

    let newDeceptionState = { ...deceptionState };
    let enemyMemory = newDeceptionState.enemyMemory[battleState.enemy.type] || createEnemyMemory(battleState.enemy.type);

    const wasRevealed = playerResult.scanRevealed && displayedIntent.isDisguised;
    if (wasRevealed) {
      newDeceptionState.scannerState = registerReveal(newDeceptionState.scannerState);
      newDeceptionState.currentBattleIntentRevealed = true;
    }
    enemyMemory = updateEnemyMemory(enemyMemory, displayedIntent, wasRevealed, config);
    newDeceptionState.enemyMemory[battleState.enemy.type] = enemyMemory;

    let newState: BattleState = {
      ...battleState,
      player: playerResult.newPlayer,
      enemy: playerResult.newEnemy,
      logs: [...battleState.logs, ...playerResult.logs.map(l => ({ ...l, turn: battleState.turn }))],
      scannerPointsUsed: battleState.scannerPointsUsed + playerResult.scannerPointsUsed,
      deceptionsRevealed: battleState.deceptionsRevealed + (wasRevealed ? 1 : 0),
    };

    const result = checkBattleEnd(newState.player, newState.enemy);
    if (result !== 'ongoing') {
      saveDeceptionState(newDeceptionState);
      set({ deceptionState: newDeceptionState });
      get().endBattle(result);
      return;
    }

    newState.phase = 'enemy';

    if (trueIntentType === 'repair') {
      const healAmount = displayedIntent.trueIntent.value;
      newState.enemy = {
        ...newState.enemy,
        hp: Math.min(newState.enemy.maxHp, newState.enemy.hp + healAmount),
      };
    }

    let enemyForAction = { ...newState.enemy };
    if (newDeceptionState.tacticalBonus) {
      enemyForAction = applyTacticalBonusToEnemy(enemyForAction, newDeceptionState.tacticalBonus);
    }

    const enemyResult = executeEnemyIntent(
      enemyForAction,
      newState.player,
      config
    );

    if (trueIntentType === 'special') {
      const abilityName = displayedIntent.trueIntent.description.replace('准备释放 ', '');
      const ability = newState.enemy.abilities.find(a => a.name === abilityName && a.currentCooldown === 0);
      if (ability) {
        newState.enemy = {
          ...newState.enemy,
          abilities: newState.enemy.abilities.map(a =>
            a.id === ability.id ? { ...a, currentCooldown: a.cooldown } : a
          ),
        };
      }
    }

    if (enemyResult.wasMisjudged) {
      const existingBonus = newDeceptionState.tacticalBonus;
      const misjudgmentResult = registerMisjudgment(newDeceptionState.scannerState, config, existingBonus);
      newDeceptionState.scannerState = misjudgmentResult.scannerState;
      if (misjudgmentResult.tacticalBonus) {
        newDeceptionState.tacticalBonus = misjudgmentResult.tacticalBonus;
      }
      newState.misjudgments = battleState.misjudgments + 1;

      if (misjudgmentResult.tacticalBonus) {
        const isRefresh = !!existingBonus;
        enemyResult.logs.push({
          id: `log_${Date.now()}_bonus`,
          turn: battleState.turn,
          type: 'effect',
          source: 'enemy',
          message: isRefresh
            ? `敌方战术优势持续刷新！攻击+${Math.floor(misjudgmentResult.tacticalBonus.attackBonus * 100)}%，防御+${Math.floor(misjudgmentResult.tacticalBonus.defenseBonus * 100)}%`
            : `敌方获得战术优势！攻击+${Math.floor(misjudgmentResult.tacticalBonus.attackBonus * 100)}%，防御+${Math.floor(misjudgmentResult.tacticalBonus.defenseBonus * 100)}%`,
          timestamp: Date.now(),
        });
      }
    } else if (displayedIntent.isDisguised && wasRevealed) {
      newDeceptionState.tacticalBonus = null;
    }

    let enemyHp = newState.player.hp;
    let enemyShield = newState.player.shield;

    if (enemyResult.effect === 'reduce_evasion') {
      newState.player = {
        ...newState.player,
        evasion: Math.max(0, newState.player.evasion - 0.1),
      };
    }

    if (enemyResult.effect === 'damage_cabin') {
      const undamagedCabins = newState.player.cabins.filter(c => !c.damaged);
      if (undamagedCabins.length > 0) {
        const randomCabin = undamagedCabins[Math.floor(Math.random() * undamagedCabins.length)];
        newState.player = {
          ...newState.player,
          cabins: newState.player.cabins.map(c =>
            c.id === randomCabin.id
              ? { ...c, damaged: true, cooldown: config.repairCooldown }
              : c
          ),
        };
        enemyResult.logs.push({
          id: `log_${Date.now()}_cabin`,
          turn: battleState.turn,
          type: 'effect',
          source: 'enemy',
          message: `${randomCabin.name} 被损坏！`,
          timestamp: Date.now(),
        });
      }
    }

    if (enemyResult.effect === 'heal_hp') {
      const healAmount = Math.floor(newState.enemy.maxHp * 0.15);
      newState.enemy = {
        ...newState.enemy,
        hp: Math.min(newState.enemy.maxHp, newState.enemy.hp + healAmount),
      };
      enemyResult.logs.push({
        id: `log_${Date.now()}_heal`,
        turn: battleState.turn,
        type: 'heal',
        source: 'enemy',
        message: `敌方恢复 ${healAmount} HP`,
        value: healAmount,
        timestamp: Date.now(),
      });
    }

    if (enemyResult.effect === 'heal_shield') {
      const shieldAmount = Math.floor(newState.enemy.maxShield * 0.3);
      newState.enemy = {
        ...newState.enemy,
        shield: Math.min(newState.enemy.maxShield, newState.enemy.shield + shieldAmount),
      };
      enemyResult.logs.push({
        id: `log_${Date.now()}_shield`,
        turn: battleState.turn,
        type: 'shield',
        source: 'enemy',
        message: `敌方恢复 ${shieldAmount} 护盾`,
        value: shieldAmount,
        timestamp: Date.now(),
      });
    }

    enemyHp = enemyResult.newPlayerHp;
    enemyShield = enemyResult.newPlayerShield;

    newState = {
      ...newState,
      player: { ...newState.player, hp: enemyHp, shield: enemyShield },
      logs: [...newState.logs, ...enemyResult.logs.map(l => ({ ...l, turn: battleState.turn }))],
    };

    const finalResult = checkBattleEnd(newState.player, newState.enemy);
    if (finalResult !== 'ongoing') {
      get().endBattle(finalResult);
      return;
    }

    if (wasDefending) {
      newState.enemy = {
        ...newState.enemy,
        defense: originalDefense,
      };
    }

    // #region debug-point H4:defense-rollback
    fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"battle-mechanics-bugs",runId:"pre-fix",hypothesisId:"H4",location:"useGameStore.ts:259",msg:"[DEBUG] Defense rollback",data:{wasDefending,defenseBeforeRollback:newState.enemy.defense,defenseAfterRollback:wasDefending?originalDefense:newState.enemy.defense,originalDefense,nextIntentWillBeGenerated:true},ts:Date.now()})}).catch(()=>{});
    // #endregion

    newDeceptionState.tacticalBonus = updateTacticalBonus(newDeceptionState.tacticalBonus);
    newDeceptionState.currentBattleIntentRevealed = false;

    newState.enemy = generateEnemyIntent(newState.enemy, undefined, enemyMemory);

    const playerEvasionReset = useShipStore.getState().ship.evasion;
    newState.player = {
      ...newState.player,
      evasion: playerEvasionReset,
    };

    newState.turn += 1;
    newState.phase = 'player';

    newState.player = {
      ...newState.player,
      energy: Math.min(newState.player.maxEnergy, newState.player.energy + Math.floor(newState.player.maxEnergy * 0.5)),
    };

    const replayAction: ReplayAction = {
      turn: battleState.turn,
      phase: 'player',
      action: 'turn',
      payload: { dice: JSON.parse(JSON.stringify(dice)) },
      resultingState: JSON.parse(JSON.stringify(newState)),
    };

    const newReplayData = replayData ? {
      ...replayData,
      actions: [...replayData.actions, replayAction],
    } : null;

    saveDeceptionState(newDeceptionState);

    set({
      battleState: newState,
      replayData: newReplayData,
      deceptionState: newDeceptionState,
    });

    const newStats = {
      ...shipStore.stats,
      totalTurns: shipStore.stats.totalTurns + 1,
      totalDamageDealt: shipStore.stats.totalDamageDealt + playerResult.totalDamageDealt,
      totalDamageTaken: shipStore.stats.totalDamageTaken + (enemyResult.shieldResult.damage),
    };
    updateStats(newStats);
    shipStore.stats = newStats;

    diceStore.setDice(unassignAllDice(dice));
  },

  fleeBattle: () => {
    get().endBattle('fled');
  },

  endBattle: (result) => {
    const { battleState, replayData } = get();
    if (!battleState) return;

    const shipStore = useShipStore.getState();
    const config = useConfigStore.getState().config;

    const reward = result === 'victory'
      ? calculateReward(result, battleState.turn, get().currentDifficulty)
      : 0;

    const newState: BattleState = {
      ...battleState,
      result,
      phase: 'ended',
      endTime: Date.now(),
      rewardPoints: reward,
    };

    const newRecord: BattleRecord = {
      id: battleState.id,
      startTime: battleState.startTime,
      endTime: Date.now(),
      result,
      turns: battleState.turn,
      enemyType: battleState.enemy.type,
      enemyName: battleState.enemy.name,
      playerHpRemaining: battleState.player.hp,
      enemyHpRemaining: battleState.enemy.hp,
      replayData: replayData || { initialState: newState, actions: [] },
      rewardEarned: reward,
    };

    addBattleRecord(newRecord);

    if (reward > 0) {
      shipStore.addRewardPoints(reward);
    }

    const newStats = { ...shipStore.stats };
    newStats.totalBattles += 1;

    if (result === 'victory') {
      newStats.victories += 1;
      newStats.currentStreak += 1;
      newStats.longestStreak = Math.max(newStats.longestStreak, newStats.currentStreak);
    } else {
      newStats.defeats += 1;
      newStats.currentStreak = 0;
    }

    updateStats(newStats);
    shipStore.stats = newStats;

    set({
      battleState: newState,
      battleHistory: [newRecord, ...get().battleHistory],
    });
  },

  addLog: (log) => {
    const { battleState } = get();
    if (!battleState) return;

    set({
      battleState: {
        ...battleState,
        logs: [...battleState.logs, log],
      },
    });
  },

  loadHistory: () => {
    const history = loadBattleHistory();
    set({ battleHistory: history });
  },

  startReplay: (recordId) => {
    const { battleHistory } = get();
    const record = battleHistory.find(r => r.id === recordId);
    if (!record) return;

    set({
      replayData: record.replayData,
      replayIndex: -1,
      isReplaying: true,
      battleState: JSON.parse(JSON.stringify(record.replayData.initialState)),
    });
  },

  nextReplayStep: () => {
    const { replayData, replayIndex } = get();
    if (!replayData || replayIndex >= replayData.actions.length - 1) return;

    const nextIndex = replayIndex + 1;
    const action = replayData.actions[nextIndex];

    set({
      replayIndex: nextIndex,
      battleState: JSON.parse(JSON.stringify(action.resultingState)),
    });
  },

  prevReplayStep: () => {
    const { replayData, replayIndex } = get();
    if (!replayData || replayIndex <= 0) {
      if (replayIndex === 0) {
        set({
          replayIndex: -1,
          battleState: JSON.parse(JSON.stringify(replayData.initialState)),
        });
      }
      return;
    }

    const prevIndex = replayIndex - 1;
    const action = replayData.actions[prevIndex];

    set({
      replayIndex: prevIndex,
      battleState: JSON.parse(JSON.stringify(action.resultingState)),
    });
  },

  stopReplay: () => {
    set({
      replayData: null,
      replayIndex: -1,
      isReplaying: false,
      battleState: null,
    });
  },

  setReplaySpeed: (speed) => {
    set({ replaySpeed: speed });
  },

  setDifficulty: (difficulty) => {
    set({ currentDifficulty: difficulty });
  },

  resetBattle: () => {
    set({
      battleState: null,
      replayData: null,
      replayIndex: -1,
      isReplaying: false,
    });
    useDiceStore.getState().resetDice();
  },
}));
