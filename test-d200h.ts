import { renderDashboardZip } from './bridge/src/d200h/image-renderer.js';

const mockState = {
  type: 'state_update',
  state: 'idle',
  projectName: 'AgentDeck',
  modelName: 'claude-3-haiku',
  mode: 'default',
  agentType: 'claude-code',
  fiveHourPercent: 10,
  sevenDayPercent: 20,
  totalTokens: 5000,
  totalCost: 0.1,
  options: [],
  currentTool: '',
  allSessions: [
    { projectName: 'AgentDeck', agentType: 'claude-code' }
  ]
};

try {
  const result = renderDashboardZip(mockState);
  console.log("ZIP Size:", result.length);
} catch (e) {
  console.error("ERROR GENERATING ZIP:", e);
}
