/**
 * Runs the nightly attendance rollup once, now, against every active school.
 *
 * The job is otherwise only reachable at 02:00 IST or through the platform-only
 * HTTP route, and there is currently no seeded platform user to authenticate as
 * — so this is how ops backfills and how the job gets verified after a change
 * to how a summary is derived.
 *
 *   node -r ./scripts/alias-db.cjs scripts/run-attendance-summary.cjs
 */

require('./alias-db.cjs');

const { NestFactory } = require('@nestjs/core');

const { AppModule } = require('../dist/apps/api/src/app.module');
const {
  AttendanceWorkersProcessor,
} = require('../dist/apps/api/src/modules/attendance/processors/attendance-workers.processor');
const {
  RequestContextStore,
} = require('../dist/apps/api/src/common/context/request-context');

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const workers = app.get(AttendanceWorkersProcessor);

  const result = await RequestContextStore.run(
    {
      requestId: 'attendance-summary-manual',
      userId: null,
      tenantId: null,
      branchId: null,
      sessionId: null,
      roleCodes: [],
      permissions: new Map(),
      isPlatformAdmin: true,
      impersonatorUserId: null,
      auditTrail: [],
      piiReads: [],
    },
    () => workers.recomputeAll(),
  );

  process.stdout.write(
    `\nRecomputed: tenants=${result.tenants} students=${result.students}\n\n`,
  );
  await app.close();
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`\nFailed: ${err && err.stack ? err.stack : err}\n\n`);
  process.exit(1);
});
