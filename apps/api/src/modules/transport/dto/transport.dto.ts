import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateVehicleDto {
  @IsString() @MinLength(1) @MaxLength(20)
  registrationNo!: string;

  @IsOptional() @IsString() @MaxLength(20)
  busNo?: string;

  @IsOptional() @IsString() @MaxLength(60)
  make?: string;

  @IsOptional() @IsString() @MaxLength(60)
  model?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  seatingCapacity?: number;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  hasGps?: boolean;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  hasCctv?: boolean;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  hasPanicButton?: boolean;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  hasSeatBelts?: boolean;

  @IsOptional() @IsDateString()
  insuranceExpiry?: string;

  @IsOptional() @IsDateString()
  fitnessExpiry?: string;

  @IsOptional() @IsDateString()
  permitExpiry?: string;

  @IsOptional() @IsDateString()
  pucExpiry?: string;

  @IsOptional() @IsUUID()
  driverStaffId?: string;

  @IsOptional() @IsUUID()
  attendantStaffId?: string;
}

export class PatchVehicleDto extends CreateVehicleDto {}

export class CreateRouteDto {
  @IsString() @MinLength(1) @MaxLength(30)
  code!: string;

  @IsString() @MinLength(1) @MaxLength(120)
  name!: string;

  @IsOptional() @IsUUID()
  academicSessionId?: string;

  @IsOptional() @IsUUID()
  vehicleId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  distanceKm?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  estimatedMinutes?: number;

  @IsOptional() @IsString() @MaxLength(8)
  morningStartTime?: string;

  @IsOptional() @IsString() @MaxLength(8)
  afternoonStartTime?: string;
}

export class PatchRouteDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  name?: string;

  @IsOptional() @IsUUID()
  vehicleId?: string;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isActive?: boolean;
}

export class RouteStopDto {
  @IsString() @MinLength(1) @MaxLength(150)
  name!: string;

  @Type(() => Number) @IsInt() @Min(1)
  sequence!: number;

  @IsOptional() @IsString() @MaxLength(20)
  latitude?: string;

  @IsOptional() @IsString() @MaxLength(20)
  longitude?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  feeSlabPaise?: number;

  @IsOptional() @IsString() @MaxLength(8)
  pickupTime?: string;

  @IsOptional() @IsString() @MaxLength(8)
  dropTime?: string;
}

export class UpsertStopsDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => RouteStopDto)
  stops!: RouteStopDto[];
}

export class AllocateTransportDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  academicSessionId!: string;

  @IsUUID()
  routeId!: string;

  @IsOptional() @IsUUID()
  pickupStopId?: string;

  @IsOptional() @IsUUID()
  dropStopId?: string;

  @IsOptional() @IsString() @MaxLength(60)
  rfidTag?: string;
}

export class PingPointDto {
  @IsDateString()
  at!: string;

  @IsString() @MinLength(1) @MaxLength(20)
  lat!: string;

  @IsString() @MinLength(1) @MaxLength(20)
  lng!: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(200)
  speedKmph?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(359)
  heading?: number;
}

export class IngestPingsDto {
  @IsUUID()
  vehicleId!: string;

  @IsOptional() @IsUUID()
  tripId?: string;

  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PingPointDto)
  pings!: PingPointDto[];
}

export class StartTripDto {
  @IsUUID()
  routeId!: string;

  @IsOptional() @IsUUID()
  vehicleId?: string;

  @IsDateString()
  day!: string;

  @IsIn(['pickup', 'drop'])
  direction!: 'pickup' | 'drop';

  @IsOptional() @IsUUID()
  driverStaffId?: string;

  @IsOptional() @IsUUID()
  attendantStaffId?: string;
}

export class BoardingEventDto {
  @IsUUID()
  studentId!: string;

  @IsOptional() @IsUUID()
  stopId?: string;

  @IsIn(['boarded', 'alighted', 'no_show', 'missed_stop'])
  event!: 'boarded' | 'alighted' | 'no_show' | 'missed_stop';

  @IsDateString()
  at!: string;

  @IsOptional() @IsIn(['rfid', 'qr', 'manual', 'face'])
  scanMethod?: string;

  @IsOptional() @IsString() @MaxLength(20)
  lat?: string;

  @IsOptional() @IsString() @MaxLength(20)
  lng?: string;

  @IsOptional() @IsUUID()
  clientMutationId?: string;
}

export class BoardingBatchDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => BoardingEventDto)
  events!: BoardingEventDto[];

  @IsOptional() @IsUUID()
  clientMutationId?: string;
}

export class SosDto {
  @IsOptional() @IsIn(['panic', 'breakdown', 'medical', 'other'])
  type?: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class LiveQuery {
  @IsOptional() @IsUUID()
  routeId?: string;
}

export class BoardingQuery {
  @IsUUID()
  studentId!: string;

  @IsOptional() @IsDateString()
  from?: string;
}
