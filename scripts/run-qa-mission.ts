import { runMasterQAOrchestrator } from '../qa/orchestrator/master-orchestrator';

runMasterQAOrchestrator()
  .then(() => {
    console.log('✅ QA Mission Run Complete.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ QA Mission Terminated With Error:', err);
    process.exit(1);
  });
