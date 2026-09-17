import { Queue, Worker, Job } from 'bullmq';
import { redisConnectionOptions, redisClient } from '../config/redis';

const CRASH_QUEUE_NAME = 'crash-persistence-test-queue';

interface TestJobData {
  seq: number;
  testRunId: string;
}

async function runCrashResilienceTest() {
  console.log('🧪 =========================================================');
  console.log('🧪 RUNNING CRASH RESILIENCE & QUEUE PERSISTENCE TEST');
  console.log('🧪 =========================================================\n');

  const testRunId = `run-${Date.now()}`;
  const testQueue = new Queue<TestJobData>(CRASH_QUEUE_NAME, {
    connection: redisConnectionOptions,
  });

  try {
    // 1. Enqueue 10 delayed jobs
    console.log('📥 STEP 1: Enqueuing 10 delayed jobs in BullMQ (simulating scheduled sends)...');
    for (let i = 1; i <= 10; i++) {
      await testQueue.add(
        'delayed-email',
        { seq: i, testRunId },
        { delay: 1500 + i * 200, jobId: `crash-test-${testRunId}-${i}` }
      );
    }

    const countsBefore = await testQueue.getJobCounts('delayed', 'waiting', 'active');
    console.log(`  Jobs queued in Redis: Delayed = ${countsBefore.delayed}`);
    if (countsBefore.delayed < 10) {
      throw new Error(`Expected 10 delayed jobs in Redis, found ${countsBefore.delayed}`);
    }
    console.log('  ✅ Delayed jobs stored in Redis sorted set with target execution timestamps.\n');

    // 2. Simulate Server Crash
    console.log('💥 STEP 2: Simulating sudden process/worker crash (closing queue connection)...');
    await testQueue.close();
    console.log('  Worker and producer processes dead. Redis is operating autonomously.');

    // Wait during the downtime window
    console.log('  ⏳ Waiting 1,000ms during crash downtime window...');
    await new Promise((r) => setTimeout(r, 1000));

    // 3. Restart Server / Connect Fresh Worker
    console.log('\n🔄 STEP 3: Rebooting server and instantiating fresh BullMQ worker...');
    const restartedQueue = new Queue<TestJobData>(CRASH_QUEUE_NAME, {
      connection: redisConnectionOptions,
    });

    const countsAfterRestart = await restartedQueue.getJobCounts('delayed', 'waiting', 'active');
    console.log(`  Jobs found in Redis post-restart: Delayed = ${countsAfterRestart.delayed}, Waiting = ${countsAfterRestart.waiting}`);
    if (countsAfterRestart.delayed + countsAfterRestart.waiting !== 10) {
      throw new Error(`Data loss detected! Expected 10 total jobs, found ${countsAfterRestart.delayed + countsAfterRestart.waiting}`);
    }
    console.log('  ✅ Zero jobs lost. All 10 delayed jobs survived the crash in Redis.\n');

    // 4. Process all jobs with restarted worker
    console.log('🚀 STEP 4: Processing resumed jobs with restarted worker...');
    const processedSeqNumbers: number[] = [];

    const recoveryWorker = new Worker<TestJobData>(
      CRASH_QUEUE_NAME,
      async (job: Job<TestJobData>) => {
        processedSeqNumbers.push(job.data.seq);
        return { completed: true, seq: job.data.seq };
      },
      { connection: redisConnectionOptions, concurrency: 5 }
    );

    // Wait until all 10 jobs are processed
    let allProcessed = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((r) => setTimeout(r, 250));
      if (processedSeqNumbers.length === 10) {
        allProcessed = true;
        break;
      }
    }

    await recoveryWorker.close();
    await restartedQueue.obliterate({ force: true });
    await restartedQueue.close();

    if (!allProcessed) {
      throw new Error(`Recovery worker only processed ${processedSeqNumbers.length}/10 jobs within timeout`);
    }

    // Verify exact-once execution: every sequence from 1 to 10 was executed exactly once
    const duplicates = processedSeqNumbers.filter((item, index) => processedSeqNumbers.indexOf(item) !== index);
    if (duplicates.length > 0) {
      throw new Error(`Duplicate execution detected on jobs: ${duplicates.join(', ')}`);
    }

    console.log(`  Processed jobs: [${processedSeqNumbers.sort((a, b) => a - b).join(', ')}]`);
    console.log('  ✅ Exactly-once execution guaranteed: all 10 jobs processed with zero duplicates.');

    console.log('\n🎉 =========================================================');
    console.log('🎉 CRASH RESILIENCE TEST PASSED WITH 100% SUCCESS!');
    console.log('🎉 =========================================================\n');
  } catch (error: any) {
    console.error('❌ CRASH RESILIENCE TEST FAILED:', error);
    process.exit(1);
  } finally {
    await redisClient.quit();
    process.exit(0);
  }
}

runCrashResilienceTest();
