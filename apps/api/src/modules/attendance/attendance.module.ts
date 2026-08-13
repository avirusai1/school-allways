import { Module, forwardRef } from '@nestjs/common';

import { OnboardingModule } from '../onboarding/onboarding.module';
import { AttendanceJobsController } from './attendance-jobs.controller';
import { AttendanceQueueService } from './attendance-queue.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceRepository } from './attendance.repository';
import { AttendanceService } from './attendance.service';
import { AbsenteeAlertProcessor } from './processors/absentee-alert.processor';
import { AttendanceSummaryProcessor } from './processors/attendance-summary.processor';
import { AttendanceWorkersProcessor } from './processors/attendance-workers.processor';
import { StaffAttendanceController } from './staff-attendance.controller';
import { StaffAttendanceRepository } from './staff-attendance.repository';
import { StaffAttendanceService } from './staff-attendance.service';

@Module({
  imports: [forwardRef(() => OnboardingModule)],
  controllers: [
    AttendanceController,
    StaffAttendanceController,
    AttendanceJobsController,
  ],
  providers: [
    AttendanceRepository,
    AttendanceService,
    AttendanceQueueService,
    StaffAttendanceRepository,
    StaffAttendanceService,
    AbsenteeAlertProcessor,
    AttendanceSummaryProcessor,
    AttendanceWorkersProcessor,
  ],
  exports: [
    AttendanceService,
    AbsenteeAlertProcessor,
    AttendanceSummaryProcessor,
    AttendanceWorkersProcessor,
  ],
})
export class AttendanceModule {}
