import { randomUUID } from "node:crypto";
import { KbJobStore, type JobType } from "./storage/job-store.js";
import { createProcessIngestionWorkflow } from "./workflows/process-ingestion-workflow.js";
import { createPrepareSourceWorkflow } from "./workflows/prepare-source-workflow.js";
import { createBuildRuleDraftsWorkflow } from "./workflows/build-rule-drafts-workflow.js";
import { createPublishApprovedWorkflow } from "./workflows/publish-approved-workflow.js";

type Workflow = ReturnType<typeof createProcessIngestionWorkflow> |
  ReturnType<typeof createPrepareSourceWorkflow> |
  ReturnType<typeof createBuildRuleDraftsWorkflow> |
  ReturnType<typeof createPublishApprovedWorkflow>;
type WorkflowRegistry = Partial<Record<JobType, Workflow>>;

export class KbIngestionWorker {
  private readonly workflows: WorkflowRegistry;

  constructor(private readonly jobs: KbJobStore, workflows: Workflow | WorkflowRegistry,
    private readonly concurrency = 2) {
    if (concurrency < 1 || concurrency > 4) throw new Error("Worker concurrency must be between 1 and 4");
    this.workflows = "createRun" in workflows ? { intake: workflows } : workflows;
    if (!Object.keys(this.workflows).length) throw new Error("Worker needs a registered workflow");
  }

  /** Returns false when the queue has no claimable job. */
  async runOnce(): Promise<boolean> {
    const leaseOwner = randomUUID();
    const job = await this.jobs.claimNext(leaseOwner, 60, Object.keys(this.workflows) as JobType[]);
    if (!job) return false;
    const workflow = this.workflows[job.job_type];
    if (!workflow) throw new Error(`No workflow registered for ${job.job_type}`);
    const heartbeat = setInterval(() => {
      void this.jobs.heartbeat(job.id, leaseOwner).catch(() => undefined);
    }, 15_000);
    try {
      const run = await workflow.createRun();
      const result = await run.start({ inputData: { jobId: job.id, leaseOwner } });
      if (result.status !== "success") throw new Error("Mastra ingestion workflow did not complete");
      await this.jobs.complete(job.id, leaseOwner, result.result);
    } catch (error) {
      await this.jobs.fail(job.id, leaseOwner, error);
    } finally {
      clearInterval(heartbeat);
    }
    return true;
  }

  async runUntilStopped(signal: AbortSignal): Promise<void> {
    const active = new Set<Promise<void>>();
    while (!signal.aborted) {
      while (active.size < this.concurrency && !signal.aborted) {
        const task = this.runOnce().then(claimed => {
          if (!claimed) return new Promise<void>(resolve => setTimeout(resolve, 1_000));
        }).then(() => undefined);
        active.add(task);
        void task.then(() => active.delete(task), () => active.delete(task));
      }
      if (active.size) await Promise.race(active);
    }
    await Promise.allSettled(active);
  }
}
