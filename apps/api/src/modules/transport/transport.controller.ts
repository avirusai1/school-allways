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
} from '@nestjs/common';

import type { GrantedPermission } from '../../common/context/request-context';
import { Grant, RequirePermission } from '../../common/rbac/permission.decorator';
import {
  AllocateTransportDto,
  BoardingBatchDto,
  BoardingQuery,
  CreateRouteDto,
  CreateVehicleDto,
  IngestPingsDto,
  LiveQuery,
  PatchRouteDto,
  PatchVehicleDto,
  SosDto,
  StartTripDto,
  UpsertStopsDto,
} from './dto/transport.dto';
import { TransportService } from './transport.service';

@Controller('transport')
export class TransportController {
  constructor(private readonly service: TransportService) {}

  @Get('vehicles')
  @RequirePermission('transport.vehicle.manage')
  listVehicles() {
    return this.service.listVehicles();
  }

  @Post('vehicles')
  @RequirePermission('transport.vehicle.manage')
  createVehicle(@Body() dto: CreateVehicleDto) {
    return this.service.createVehicle(dto);
  }

  @Patch('vehicles/:id')
  @RequirePermission('transport.vehicle.manage')
  patchVehicle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchVehicleDto,
  ) {
    return this.service.patchVehicle(id, dto);
  }

  @Get('routes')
  @RequirePermission('transport.route.read')
  listRoutes() {
    return this.service.listRoutes();
  }

  @Post('routes')
  @RequirePermission('transport.route.manage')
  createRoute(@Body() dto: CreateRouteDto) {
    return this.service.createRoute(dto);
  }

  @Patch('routes/:id')
  @RequirePermission('transport.route.manage')
  patchRoute(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PatchRouteDto) {
    return this.service.patchRoute(id, dto);
  }

  @Get('routes/:id/stops')
  @RequirePermission('transport.route.read')
  listStops(
    @Param('id', ParseUUIDPipe) id: string,
    @Grant('transport.route.read') grant: GrantedPermission,
  ) {
    return this.service.listStops(id, grant);
  }

  @Post('routes/:id/stops')
  @RequirePermission('transport.route.manage')
  upsertStops(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertStopsDto,
  ) {
    return this.service.upsertStops(id, dto);
  }

  @Post('allocations')
  @RequirePermission('transport.route.manage')
  allocate(@Body() dto: AllocateTransportDto) {
    return this.service.allocate(dto);
  }

  @Get('compliance')
  @RequirePermission('transport.vehicle.manage')
  compliance() {
    return this.service.complianceDashboard();
  }

  @Post('pings')
  @HttpCode(200)
  @RequirePermission('transport.trip.operate')
  pings(@Body() dto: IngestPingsDto) {
    return this.service.ingestPings(dto);
  }

  @Get('live')
  @RequirePermission('transport.tracking.read')
  live(
    @Query() query: LiveQuery,
    @Grant('transport.tracking.read') grant: GrantedPermission,
  ) {
    return this.service.livePositions(query.routeId, grant);
  }

  @Post('trips')
  @RequirePermission('transport.trip.operate')
  startTrip(@Body() dto: StartTripDto) {
    return this.service.startTrip(dto);
  }

  @Post('trips/:id/end')
  @HttpCode(200)
  @RequirePermission('transport.trip.operate')
  endTrip(
    @Param('id', ParseUUIDPipe) id: string,
    @Grant('transport.trip.operate') grant: GrantedPermission,
  ) {
    return this.service.endTrip(id, grant);
  }

  @Post('trips/:id/boarding')
  @HttpCode(200)
  @RequirePermission('transport.trip.operate')
  boarding(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BoardingBatchDto,
    @Grant('transport.trip.operate') grant: GrantedPermission,
    @Headers('x-client-mutation-id') clientMutationId?: string,
  ) {
    if (clientMutationId && !dto.clientMutationId) {
      dto.clientMutationId = clientMutationId;
    }
    return this.service.recordBoarding(id, dto, grant);
  }

  @Post('trips/:id/sos')
  @HttpCode(200)
  @RequirePermission('transport.sos.raise')
  sos(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SosDto) {
    return this.service.raiseSos(id, dto);
  }

  @Get('boarding')
  @RequirePermission('transport.boarding.read')
  boardingHistory(
    @Query() query: BoardingQuery,
    @Grant('transport.boarding.read') grant: GrantedPermission,
  ) {
    return this.service.boardingHistory(query.studentId, grant, query.from);
  }
}
