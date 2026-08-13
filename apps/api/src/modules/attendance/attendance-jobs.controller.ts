import { Controller, Post } from '@nestjs/common';

import { PlatformOnly } from '../../common/rbac/permission.decorator';
import { AttendanceWorkersProcessor } from './processors/attendance-workers.processor';

/**
 * Operator handle on the nightly attendance rollup. It lives here rather than
 * alongside the platform rollup trigger because PlatformModule sits upstream of
 * this module, and importing it back would close a cycle.
 *
 * Not tenant-scoped: the job runs across every school, which is exactly why it
 * is platform-only.
 */
@Controller('platform/attendance-summary')
@PlatformOnly()
export class AttendanceJobsController {
  constructor(private readonly workers: AttendanceWorkersProcessor) {}

  /**
   * Same work as the 02:00 IST recompute. Needed to backfill after a deploy
   * that changes how a summary is derived, and it is the only way to verify the
   * nightly job without waiting until 02:00.
   */
  @Post('run')
  run() {
    return this.workers.recomputeAll();
  }
}
