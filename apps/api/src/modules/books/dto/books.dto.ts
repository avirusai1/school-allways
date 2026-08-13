import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { PaginatedQuery } from '../../../common/dto/paginated.query';

export class ListBooksQuery extends PaginatedQuery {
  @IsOptional() @IsUUID()
  classId?: string;

  @IsOptional() @IsUUID()
  sectionId?: string;

  @IsOptional() @IsUUID()
  subjectId?: string;

  @IsOptional() @IsUUID()
  studentId?: string;

  @IsOptional() @IsUUID()
  academicSessionId?: string;
}

export class BookAudienceDto {
  @IsUUID()
  academicSessionId!: string;

  @IsOptional() @IsUUID()
  classId?: string;

  @IsOptional() @IsUUID()
  sectionId?: string;

  @IsOptional() @IsDateString()
  availableFrom?: string;

  @IsOptional() @IsDateString()
  availableTo?: string;
}

export class CreateBookDto {
  @IsString() @MinLength(1) @MaxLength(250)
  title!: string;

  @IsOptional() @IsString() @MaxLength(250)
  subtitle?: string;

  @IsOptional() @IsString() @MaxLength(200)
  author?: string;

  @IsOptional() @IsString() @MaxLength(200)
  publisher?: string;

  @IsOptional() @IsString() @MaxLength(20)
  isbn?: string;

  @IsOptional() @IsUUID()
  subjectId?: string;

  @IsOptional() @IsIn(['textbook', 'workbook', 'reference', 'notes', 'question_bank', 'worksheet'])
  bookType?: string;

  @IsOptional() @IsIn(['school_upload', 'external_link', 'purchased'])
  source?: 'school_upload' | 'external_link' | 'purchased';

  @IsOptional() @IsString()
  externalUrl?: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsString()
  coverPath?: string;

  /** Required for school_upload — copyright acceptance is non-negotiable. */
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  copyrightAccepted?: boolean;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BookAudienceDto)
  audiences?: BookAudienceDto[];
}

export class AddBookFileDto {
  @IsOptional() @IsString() @MaxLength(100)
  partLabel?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  partSequence?: number;

  @IsString() @MinLength(1)
  filePath!: string;

  @IsOptional() @IsString() @MaxLength(100)
  mimeType?: string;

  @Type(() => Number) @IsInt() @Min(1)
  byteSize!: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  pageCount?: number;

  @IsString() @MinLength(64) @MaxLength(64)
  contentHash!: string;
}

export class RecordDownloadedDto {
  @IsUUID()
  studentId!: string;

  @Type(() => Number) @IsInt() @Min(1)
  downloadedVersion!: number;

  @IsOptional() @IsString() @MaxLength(64)
  downloadedHash?: string;

  @IsOptional() @IsString() @MaxLength(100)
  deviceId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  lastPage?: number;
}

export class BookSyncStatusQuery {
  @IsUUID()
  studentId!: string;

  @IsOptional() @IsString()
  deviceId?: string;
}

export class CreateLibraryItemDto {
  @IsString() @MinLength(1) @MaxLength(40)
  accessionNo!: string;

  @IsString() @MinLength(1) @MaxLength(250)
  title!: string;

  @IsOptional() @IsString() @MaxLength(60)
  barcode?: string;

  @IsOptional() @IsString() @MaxLength(200)
  author?: string;

  @IsOptional() @IsString() @MaxLength(200)
  publisher?: string;

  @IsOptional() @IsString() @MaxLength(20)
  isbn?: string;

  @IsOptional() @IsString() @MaxLength(40)
  callNumber?: string;

  @IsOptional() @IsString() @MaxLength(60)
  category?: string;

  @IsOptional() @IsUUID()
  digitalBookId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  totalCopies?: number;

  @IsOptional() @IsString() @MaxLength(60)
  shelfLocation?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  pricePaise?: number;
}

export class IssueLoanDto {
  @IsUUID()
  itemId!: string;

  @IsOptional() @IsUUID()
  studentId?: string;

  @IsOptional() @IsUUID()
  staffId?: string;

  @IsDateString()
  issuedOn!: string;

  @IsDateString()
  dueOn!: string;
}

export class ReturnLoanDto {
  @IsOptional() @IsDateString()
  returnedOn?: string;

  @IsOptional() @IsIn(['good', 'damaged', 'lost'])
  conditionOnReturn?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  finePaise?: number;
}

export class ListLibraryQuery extends PaginatedQuery {
  @IsOptional() @IsString()
  q?: string;
}
