import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { PlatformOnly } from '../../common/rbac/permission.decorator';
import {
  CreateAnnouncementDto,
  CreateFlagDto,
  CreateSupportSessionDto,
  FlagKillDto,
  FlagOverrideDto,
  FleetSeriesQuery,
  MetricsRangeQuery,
  SchoolsQuery,
} from './dto/platform.dto';
import { FeatureFlagsService } from './feature-flags.service';
import { PlatformService } from './platform.service';
import { RollupService } from './rollup.service';
import { InvoiceService } from '../subscriptions/invoice.service';
import {
  GeneratePlatformInvoiceDto,
  SuspendTenantDto,
  UnsuspendTenantDto,
} from './dto/billing.dto';

@Controller('platform')
@PlatformOnly()
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly flags: FeatureFlagsService,
    private readonly rollup: RollupService,
    private readonly invoices: InvoiceService,
  ) {}

  @Get('fleet')
  fleet() {
    return this.platform.fleet();
  }

  @Get('fleet/series')
  fleetSeries(@Query() query: FleetSeriesQuery) {
    return this.platform.fleetSeries(query.days ?? 30);
  }

  @Get('schools')
  schools(@Query() query: SchoolsQuery) {
    return this.platform.schools(query);
  }

  @Get('schools/:id')
  school(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.schoolDetail(id);
  }

  @Get('schools/:id/metrics')
  metrics(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MetricsRangeQuery,
  ) {
    return this.platform.schoolMetrics(id, query);
  }

  @Get('funnel')
  funnel() {
    return this.platform.funnel();
  }

  @Get('revenue')
  revenue() {
    return this.platform.revenue();
  }

  @Get('cost-to-serve')
  costToServe() {
    return this.platform.costToServe();
  }

  @Get('alerts')
  alerts() {
    return this.platform.alerts();
  }

  @Post('announcements')
  announce(@Body() dto: CreateAnnouncementDto) {
    return this.platform.createAnnouncement(dto);
  }

  @Get('referrals')
  referrals() {
    return this.platform.listReferrals();
  }

  @Get('partners')
  partners() {
    return this.platform.listPartners();
  }

  @Get('flags')
  listFlags() {
    return this.flags.listFlags();
  }

  @Post('flags')
  createFlag(@Body() dto: CreateFlagDto) {
    return this.flags.createFlag(dto);
  }

  @Post('flags/:id/override')
  override(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FlagOverrideDto,
  ) {
    return this.flags.setOverride(id, dto);
  }

  @Post('flags/:id/kill')
  kill(@Param('id', ParseUUIDPipe) id: string, @Body() dto: FlagKillDto) {
    return this.flags.setKillSwitch(id, dto);
  }

  @Post('support-sessions')
  supportSession(@Body() dto: CreateSupportSessionDto) {
    return this.platform.createSupportSession(dto);
  }

  @Get('support-sessions')
  openSessions() {
    return this.platform.listOpenSupportSessions();
  }

  /** Manual trigger for ops / tests — same job as the 01:30 IST cron. */
  @Post('rollup/run')
  runRollup(@Query('day') day?: string) {
    const d = day ?? new Date().toISOString().slice(0, 10);
    return this.rollup.runForDay(d);
  }

  @Post('schools/:id/invoices')
  generateInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GeneratePlatformInvoiceDto,
  ) {
    return this.invoices.generate(id, dto.kind);
  }

  @Get('schools/:id/invoices/:invoiceId/pdf')
  @Header('Content-Type', 'application/pdf')
  async downloadInvoicePdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.invoices.getPdf(id, invoiceId);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Post('schools/:id/invoices/:invoiceId/pdf/regenerate')
  regenerateInvoicePdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
  ) {
    return this.invoices.regeneratePdf(id, invoiceId);
  }

  @Post('schools/:id/stay-connected/paid')
  markStayConnectedPaid(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.markStayConnectedPaid(id);
  }

  @Post('schools/:id/suspend')
  suspend(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SuspendTenantDto) {
    return this.platform.suspendTenant(id, dto.reason);
  }

  @Post('schools/:id/unsuspend')
  unsuspend(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UnsuspendTenantDto) {
    return this.platform.unsuspendTenant(id, dto.reason);
  }
}
