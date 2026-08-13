import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import type { GrantedPermission } from '../../common/context/request-context';
import { Public } from '../../common/rbac/permission.decorator';
import { Grant, RequirePermission } from '../../common/rbac/permission.decorator';
import {
  ApproveStructureDto,
  CloseDaybookDto,
  CollectPaymentDto,
  CreateConcessionDto,
  CreateFeeHeadDto,
  CreateFeeStructureDto,
  DaybookQuery,
  DefaultersQuery,
  FamilyFeesQuery,
  GenerateInvoicesDto,
  GatewayWebhookDto,
  ImportSettlementsDto,
  InitiateOnlinePaymentDto,
  ListConcessionsQuery,
  MatchSettlementDto,
  PatchFeeHeadDto,
  PromiseToPayDto,
  RefundPaymentDto,
  RemindDefaultersDto,
  StructurePreviewQuery,
  StudentFeeStatusQuery,
} from './dto/fees.dto';
import { FeesService } from './fees.service';

@Controller('fees')
export class FeesController {
  constructor(private readonly service: FeesService) {}

  // --- Heads ---

  @Get('heads')
  @RequirePermission('fee.structure.read')
  listHeads() {
    return this.service.listHeads();
  }

  @Post('heads')
  @RequirePermission('fee.structure.manage')
  createHead(@Body() dto: CreateFeeHeadDto) {
    return this.service.createHead(dto);
  }

  @Patch('heads/:id')
  @RequirePermission('fee.structure.manage')
  patchHead(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PatchFeeHeadDto) {
    return this.service.patchHead(id, dto);
  }

  // --- Structures ---

  @Get('structures')
  @RequirePermission('fee.structure.read')
  listStructures(@Query('academicSessionId') academicSessionId?: string) {
    return this.service.listStructures(academicSessionId);
  }

  @Post('structures')
  @RequirePermission('fee.structure.manage')
  createStructure(@Body() dto: CreateFeeStructureDto) {
    return this.service.createStructure(dto);
  }

  @Post('structures/:id/approve')
  @RequirePermission('fee.structure.approve')
  approveStructure(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveStructureDto,
  ) {
    return this.service.approveStructure(id, dto);
  }

  @Get('structures/:id/preview')
  @RequirePermission('fee.structure.read')
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StructurePreviewQuery,
  ) {
    return this.service.previewStructure(id, query.classId, query.studentId);
  }

  // --- Concessions ---

  @Get('concessions')
  @RequirePermission('fee.concession.read')
  listConcessions(@Query() query: ListConcessionsQuery) {
    return this.service.listConcessions(query.studentId, query.academicSessionId);
  }

  @Post('concessions')
  @RequirePermission('fee.concession.manage')
  createConcession(@Body() dto: CreateConcessionDto) {
    return this.service.createConcession(dto);
  }

  @Post('concessions/:id/approve')
  @RequirePermission('fee.concession.approve')
  approveConcession(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.approveConcession(id);
  }

  // --- Invoices ---

  @Post('invoices/generate')
  @HttpCode(202)
  @RequirePermission('fee.invoice.manage')
  generate(@Body() dto: GenerateInvoicesDto) {
    return this.service.generateInvoices(dto);
  }

  /** Accounts — full invoice with lines & payments. */
  @Get('invoices/:id')
  @RequirePermission('fee.invoice.read')
  getInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Grant('fee.invoice.read') grant: GrantedPermission,
  ) {
    return this.service.getFeeInvoice(id, grant);
  }

  /** Teachers — status only. Separate method, separate DTO. */
  @Get('status')
  @RequirePermission('fee.status.read')
  feeStatus(
    @Query() query: StudentFeeStatusQuery,
    @Grant('fee.status.read') grant: GrantedPermission,
  ) {
    return this.service.getFeeStatus(query.studentId, grant, query.academicSessionId);
  }

  // --- Collection ---

  @Post('payments')
  @RequirePermission('fee.payment.collect')
  collect(@Body() dto: CollectPaymentDto) {
    return this.service.collectPayment(dto);
  }

  @Post('payments/online/initiate')
  @RequirePermission('family.fee.pay')
  initiateOnline(
    @Body() dto: InitiateOnlinePaymentDto,
    @Grant('family.fee.pay') grant: GrantedPermission,
  ) {
    return this.service.initiateOnline(dto, grant);
  }

  @Post('payments/online/webhook')
  @Public()
  @HttpCode(200)
  webhook(
    @Body() dto: GatewayWebhookDto,
    @Req() req: { rawBody?: Buffer; body: unknown },
    @Headers('x-gateway-signature') signature?: string,
  ) {
    const raw =
      req.rawBody?.toString('utf8') ??
      (typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));
    return this.service.handleWebhook(dto, raw, signature);
  }

  @Get('payments/:id')
  @RequirePermission('fee.invoice.read')
  getPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Grant('fee.invoice.read') grant: GrantedPermission,
  ) {
    return this.service.getPayment(id, grant);
  }

  @Post('payments/:id/refund')
  @RequirePermission('fee.payment.refund')
  refund(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundPaymentDto) {
    return this.service.refundPayment(id, dto);
  }

  // --- Reconciliation ---

  @Get('reconciliation/worklist')
  @RequirePermission('fee.reconcile.manage')
  worklist() {
    return this.service.reconciliationWorklist();
  }

  @Post('reconciliation/import')
  @RequirePermission('fee.reconcile.manage')
  importCsv(@Body() dto: ImportSettlementsDto) {
    return this.service.importSettlements(dto);
  }

  @Post('reconciliation/auto-match')
  @RequirePermission('fee.reconcile.manage')
  autoMatch() {
    return this.service.autoMatch();
  }

  @Post('reconciliation/:settlementId/match')
  @RequirePermission('fee.reconcile.manage')
  match(
    @Param('settlementId', ParseUUIDPipe) settlementId: string,
    @Body() dto: MatchSettlementDto,
  ) {
    return this.service.matchSettlement(settlementId, dto);
  }

  @Get('daybook')
  @RequirePermission('fee.reconcile.manage')
  daybook(@Query() query: DaybookQuery) {
    return this.service.getDaybook(query.day, query.counter);
  }

  @Post('daybook/close')
  @RequirePermission('fee.reconcile.manage')
  closeDaybook(@Body() dto: CloseDaybookDto) {
    return this.service.closeDaybook(dto);
  }

  // --- Defaulters ---

  @Get('defaulters')
  @RequirePermission('fee.defaulter.read')
  defaulters(
    @Query() query: DefaultersQuery,
    @Grant('fee.defaulter.read') grant: GrantedPermission,
  ) {
    return this.service.listDefaulters(query, grant);
  }

  @Post('defaulters/remind')
  @RequirePermission('fee.defaulter.followup')
  remind(@Body() dto: RemindDefaultersDto) {
    return this.service.remindDefaulters(dto);
  }

  @Post('defaulters/:id/promise')
  @RequirePermission('fee.defaulter.followup')
  promise(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PromiseToPayDto) {
    return this.service.promiseToPay(id, dto);
  }
}

/** Family BFF fee overview — lives under /family/fees via FamilyController. */
export { FamilyFeesQuery };
