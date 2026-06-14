import React from 'react';
import { Eye, EyeOff, AlertTriangle, Shield, Brain } from 'lucide-react';
import { getIntentColor } from '../../utils/battle';
import { getDeceptionHint, getDeceptionDescription } from '../../utils/deception';
import { useGameStore } from '../../store/useGameStore';
import type { Enemy } from '../../types';

interface EnemyIntentProps {
  enemy: Enemy;
}

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

export const EnemyIntent: React.FC<EnemyIntentProps> = ({ enemy }) => {
  const colorClass = getIntentColor(enemy.intent);
  const deceptionState = useGameStore(state => state.deceptionState);
  const battleState = useGameStore(state => state.battleState);

  const memory = deceptionState.enemyMemory[enemy.type];
  const deceptionHint = getDeceptionHint(enemy.intent);

  const credibilityPercent = memory ? Math.floor(memory.credibility * 100) : 100;
  const revealLevel = enemy.intent.revealLevel;
  const isDisguised = enemy.intent.isDisguised;
  const isRevealed = enemy.intent.isRevealed;

  const consecutiveMisjudgments = deceptionState.scannerState.consecutiveMisjudgments;
  const hasTacticalBonus = deceptionState.tacticalBonus !== null;

  const getCredibilityColor = (percent: number) => {
    if (percent >= 70) return 'text-neon-green';
    if (percent >= 40) return 'text-neon-yellow';
    return 'text-neon-red';
  };

  return (
    <div className="glass-panel neon-border-yellow p-4 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-display text-neon-yellow">敌方意图</h4>
        <div className="flex items-center gap-2">
          {memory && memory.totalEncounters > 0 && (
            <div className="flex items-center gap-1 text-xs text-gray-400" title="遭遇次数">
              <Brain className="w-3 h-3" />
              <span>{memory.totalEncounters}</span>
            </div>
          )}
          {consecutiveMisjudgments > 0 && (
            <div
              className="flex items-center gap-1 text-xs text-neon-red"
              title={`连续误判 ${consecutiveMisjudgments} 次`}
            >
              <AlertTriangle className="w-3 h-3 animate-pulse" />
              <span>{consecutiveMisjudgments}</span>
            </div>
          )}
          {hasTacticalBonus && (
            <div
              className="flex items-center gap-1 text-xs text-neon-orange"
              title={`敌方战术优势中，剩余 ${deceptionState.tacticalBonus?.duration} 回合`}
            >
              <Shield className="w-3 h-3 animate-pulse" />
              <span>BUFF</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <div className={`text-3xl ${enemy.intent.type === 'charge' ? 'animate-pulse' : ''}`}>
            {intentIcons[enemy.intent.type] || '❓'}
          </div>
          {isDisguised && !isRevealed && (
            <div className="absolute -top-1 -right-1">
              <EyeOff className="w-3 h-3 text-neon-yellow" />
            </div>
          )}
          {isDisguised && isRevealed && (
            <div className="absolute -top-1 -right-1">
              <Eye className="w-3 h-3 text-neon-green" />
            </div>
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className={`font-display font-bold ${colorClass}`}>
              {intentLabels[enemy.intent.type] || '未知'}
            </div>
            {isDisguised && isRevealed && (
              <span className="text-xs text-neon-green bg-neon-green/10 px-1 rounded">
                已识破
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">{enemy.intent.description}</p>
          {enemy.intent.value > 0 && (
            <div className="text-sm font-display text-white mt-1">
              预估数值: <span className={colorClass}>{enemy.intent.value}</span>
            </div>
          )}
          {deceptionHint && (
            <p className={`text-xs mt-1 ${
              isRevealed ? 'text-neon-green' : 'text-neon-yellow'
            }`}>
              {deceptionHint}
            </p>
          )}
        </div>
      </div>

      {memory && (
        <div className="mt-3 pt-3 border-t border-space-600">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-gray-400">敌方可信度</span>
            <span className={getCredibilityColor(credibilityPercent)}>
              {credibilityPercent}%
            </span>
          </div>
          <div className="w-full bg-space-700 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${
                credibilityPercent >= 70 ? 'bg-neon-green' :
                credibilityPercent >= 40 ? 'bg-neon-yellow' : 'bg-neon-red'
              }`}
              style={{ width: `${credibilityPercent}%` }}
            />
          </div>
          {revealLevel > 0 && !isRevealed && (
            <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
              <div className="flex gap-0.5">
                {[0, 1].map(i => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full ${
                      i < revealLevel ? 'bg-neon-yellow' : 'bg-space-600'
                    }`}
                  />
                ))}
              </div>
              <span>侦察级别 {revealLevel}/2</span>
            </div>
          )}
          {memory.timesRevealed > 0 && (
            <div className="text-xs text-gray-500 mt-1">
              已识破 {memory.timesRevealed} 次伪装
            </div>
          )}
        </div>
      )}

      {isDisguised && isRevealed && (
        <div className="mt-3 p-2 bg-neon-green/10 border border-neon-green/30 rounded-lg">
          <div className="text-xs text-neon-green">
            <span className="font-bold">伪装类型:</span> {getDeceptionDescription(enemy.intent.deceptionType)}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            真实意图: {intentLabels[enemy.intent.trueIntent.type]}
            {enemy.intent.trueIntent.value > 0 && ` (${enemy.intent.trueIntent.value})`}
          </div>
        </div>
      )}

      {battleState && (battleState.scannerPointsUsed > 0 || battleState.deceptionsRevealed > 0 || battleState.misjudgments > 0) && (
        <div className="mt-3 pt-3 border-t border-space-600">
          <div className="text-xs text-gray-400 mb-2">本场统计:</div>
          <div className="flex flex-wrap gap-3 text-xs">
            {battleState.scannerPointsUsed > 0 && (
              <span className="text-neon-yellow">扫描点数: {battleState.scannerPointsUsed}</span>
            )}
            {battleState.deceptionsRevealed > 0 && (
              <span className="text-neon-green">识破伪装: {battleState.deceptionsRevealed}</span>
            )}
            {battleState.misjudgments > 0 && (
              <span className="text-neon-red">误判次数: {battleState.misjudgments}</span>
            )}
          </div>
        </div>
      )}

      {enemy.abilities.length > 0 && (
        <div className="mt-3 pt-3 border-t border-space-600">
          <div className="text-xs text-gray-400 mb-2">可用技能:</div>
          <div className="flex flex-wrap gap-1">
            {enemy.abilities.map(ability => (
              <div
                key={ability.id}
                className={`
                  px-2 py-1 rounded text-xs
                  ${ability.currentCooldown > 0
                    ? 'bg-space-700 text-gray-500'
                    : 'bg-neon-purple/20 text-neon-purple border border-neon-purple/30'}
                `}
                title={ability.description}
              >
                {ability.name}
                {ability.currentCooldown > 0 && ` (${ability.currentCooldown})`}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
