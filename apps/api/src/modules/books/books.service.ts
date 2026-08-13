import { createHmac, timingSafeEqual } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import {
  bookAudiences,
  bookFiles,
  books,
  libraryItems,
  libraryLoans,
  studentBookDownloads,
  studentEnrollments,
} from '@saw/db';

import {
  RequestContextStore,
  type GrantedPermission,
} from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { assertInScope } from '../../common/rbac/scope.util';
import type {
  AddBookFileDto,
  CreateBookDto,
  CreateLibraryItemDto,
  IssueLoanDto,
  RecordDownloadedDto,
  ReturnLoanDto,
} from './dto/books.dto';

const SIGNED_URL_TTL_SEC = 15 * 60;
const LARGE_FILE_WARN_BYTES = 10 * 1024 * 1024;

@Injectable()
export class BooksService {
  private readonly logger = new Logger(BooksService.name);

  constructor(
    private readonly db: TenantDbService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Digital shelf
  // ---------------------------------------------------------------------------

  async listBooks(
    grant: GrantedPermission,
    opts: {
      classId?: string;
      sectionId?: string;
      subjectId?: string;
      studentId?: string;
      academicSessionId?: string;
    },
  ) {
    const ctx = RequestContextStore.get();

    return this.db.run(async (tx) => {
      let classId = opts.classId ?? null;
      let sectionId = opts.sectionId ?? null;

      if (opts.studentId) {
        assertInScope(grant, { studentId: opts.studentId });
        const [enr] = await tx
          .select({
            classId: studentEnrollments.classId,
            sectionId: studentEnrollments.sectionId,
            academicSessionId: studentEnrollments.academicSessionId,
          })
          .from(studentEnrollments)
          .where(
            and(
              eq(studentEnrollments.studentId, opts.studentId!),
              inArray(studentEnrollments.status, ['active', 'admitted', 'on_leave']),
              opts.academicSessionId
                ? eq(studentEnrollments.academicSessionId, opts.academicSessionId)
                : undefined,
            ),
          )
          .limit(1);
        if (!enr) return { data: [] as unknown[] };
        classId = enr.classId;
        sectionId = enr.sectionId;
      }

      // A book with no audience mapping is visible to nobody.
      // Staff browsing without a class filter see the catalogue (drafts included for manage).
      const shelfMode = !!(opts.studentId || opts.classId || opts.sectionId);

      if (!shelfMode) {
        const rows = await tx
          .select({
            id: books.id,
            title: books.title,
            subtitle: books.subtitle,
            author: books.author,
            bookType: books.bookType,
            source: books.source,
            externalUrl: books.externalUrl,
            coverPath: books.coverPath,
            subjectId: books.subjectId,
            status: books.status,
            publishedAt: books.publishedAt,
          })
          .from(books)
          .where(
            and(
              eq(books.branchId, ctx.branchId!),
              eq(books.isActive, true),
              opts.subjectId ? eq(books.subjectId, opts.subjectId) : undefined,
            ),
          )
          .orderBy(asc(books.title))
          .limit(100);
        return { data: rows };
      }

      const audienceRows = await tx
        .select({
          bookId: bookAudiences.bookId,
          classId: bookAudiences.classId,
          sectionId: bookAudiences.sectionId,
          availableFrom: bookAudiences.availableFrom,
          availableTo: bookAudiences.availableTo,
        })
        .from(bookAudiences)
        .where(
          and(
            opts.academicSessionId
              ? eq(bookAudiences.academicSessionId, opts.academicSessionId)
              : undefined,
            or(
              sectionId ? eq(bookAudiences.sectionId, sectionId) : undefined,
              classId
                ? and(eq(bookAudiences.classId, classId), isNull(bookAudiences.sectionId))
                : undefined,
              classId && sectionId ? eq(bookAudiences.classId, classId) : undefined,
            ),
          ),
        );

      const now = Date.now();
      const visibleIds = [
        ...new Set(
          audienceRows
            .filter((a) => {
              if (a.availableFrom && a.availableFrom.getTime() > now) return false;
              if (a.availableTo && a.availableTo.getTime() < now) return false;
              return true;
            })
            .map((a) => a.bookId),
        ),
      ];

      if (visibleIds.length === 0 && (classId || sectionId || opts.studentId)) {
        return { data: [] };
      }

      const rows = await tx
        .select({
          id: books.id,
          title: books.title,
          subtitle: books.subtitle,
          author: books.author,
          bookType: books.bookType,
          source: books.source,
          externalUrl: books.externalUrl,
          coverPath: books.coverPath,
          subjectId: books.subjectId,
          status: books.status,
          publishedAt: books.publishedAt,
        })
        .from(books)
        .where(
          and(
            eq(books.branchId, ctx.branchId!),
            eq(books.status, 'published'),
            eq(books.isActive, true),
            visibleIds.length > 0 ? inArray(books.id, visibleIds) : sql`false`,
            opts.subjectId ? eq(books.subjectId, opts.subjectId) : undefined,
          ),
        )
        .orderBy(asc(books.title))
        .limit(100);

      return { data: rows };
    });
  }

  async createBook(dto: CreateBookDto) {
    const ctx = RequestContextStore.get();
    const source = dto.source ?? 'school_upload';

    if (source === 'school_upload' && !dto.copyrightAccepted) {
      throw new ApiException(
        422,
        'COPYRIGHT_REQUIRED',
        'Upload requires accepting the copyright/distribution declaration.',
      );
    }
    if (source === 'external_link' && !dto.externalUrl) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'externalUrl is required when source is external_link.',
      );
    }

    return this.db.run(async (tx) => {
      const [book] = await tx
        .insert(books)
        .values({
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          title: dto.title,
          subtitle: dto.subtitle,
          author: dto.author,
          publisher: dto.publisher,
          isbn: dto.isbn,
          subjectId: dto.subjectId,
          bookType: dto.bookType ?? 'textbook',
          source,
          externalUrl: dto.externalUrl,
          description: dto.description,
          coverPath: dto.coverPath,
          status: 'draft',
          copyrightAcceptedByUserId: dto.copyrightAccepted ? ctx.userId : null,
          copyrightAcceptedAt: dto.copyrightAccepted ? new Date() : null,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: books.id,
          title: books.title,
          status: books.status,
          source: books.source,
        });

      if (dto.audiences?.length) {
        await tx.insert(bookAudiences).values(
          dto.audiences.map((a) => ({
            tenantId: ctx.tenantId!,
            bookId: book!.id,
            academicSessionId: a.academicSessionId,
            classId: a.classId,
            sectionId: a.sectionId,
            availableFrom: a.availableFrom ? new Date(a.availableFrom) : null,
            availableTo: a.availableTo ? new Date(a.availableTo) : null,
          })),
        );
      }

      RequestContextStore.addAudit({
        action: 'book.create',
        entityType: 'books',
        entityId: book!.id,
      });

      return book;
    });
  }

  /**
   * THE sync check — a few hundred bytes. Client compares version/hash locally
   * and opens from disk with zero transfer when unchanged.
   */
  async listFiles(bookId: string, grant: GrantedPermission) {
    return this.db.run(async (tx) => {
      const [book] = await tx
        .select({
          id: books.id,
          status: books.status,
          source: books.source,
          externalUrl: books.externalUrl,
          subjectId: books.subjectId,
        })
        .from(books)
        .where(eq(books.id, bookId))
        .limit(1);
      if (!book) throw new ApiException(404, 'NOT_FOUND', 'Book not found');

      await this.assertBookInAudienceScope(tx, bookId, book.subjectId, grant);

      const files = await tx
        .select({
          id: bookFiles.id,
          partLabel: bookFiles.partLabel,
          partSequence: bookFiles.partSequence,
          version: bookFiles.version,
          contentHash: bookFiles.contentHash,
          byteSize: bookFiles.byteSize,
          pageCount: bookFiles.pageCount,
          mimeType: bookFiles.mimeType,
        })
        .from(bookFiles)
        .where(
          and(
            eq(bookFiles.bookId, bookId),
            eq(bookFiles.isActive, true),
            isNull(bookFiles.supersededAt),
          ),
        )
        .orderBy(asc(bookFiles.partSequence));

      return {
        bookId,
        source: book.source,
        externalUrl: book.externalUrl,
        files,
      };
    });
  }

  async addFile(bookId: string, dto: AddBookFileDto) {
    const ctx = RequestContextStore.get();

    if (dto.byteSize > LARGE_FILE_WARN_BYTES) {
      this.logger.warn(
        `Large book file upload book=${bookId} bytes=${dto.byteSize}. Prefer chapter splits under 10 MB.`,
      );
    }

    return this.db.run(async (tx) => {
      const [book] = await tx
        .select({
          id: books.id,
          copyrightAcceptedAt: books.copyrightAcceptedAt,
          source: books.source,
        })
        .from(books)
        .where(eq(books.id, bookId))
        .limit(1);
      if (!book) throw new ApiException(404, 'NOT_FOUND', 'Book not found');
      if (book.source === 'school_upload' && !book.copyrightAcceptedAt) {
        throw new ApiException(
          422,
          'COPYRIGHT_REQUIRED',
          'Accept copyright before uploading files.',
        );
      }

      const partSequence = dto.partSequence ?? 0;
      const [prev] = await tx
        .select({
          id: bookFiles.id,
          version: bookFiles.version,
        })
        .from(bookFiles)
        .where(
          and(
            eq(bookFiles.bookId, bookId),
            eq(bookFiles.partSequence, partSequence),
            isNull(bookFiles.supersededAt),
          ),
        )
        .orderBy(desc(bookFiles.version))
        .limit(1);

      const version = (prev?.version ?? 0) + 1;

      if (prev) {
        await tx
          .update(bookFiles)
          .set({ supersededAt: new Date(), isActive: false, updatedAt: new Date() })
          .where(eq(bookFiles.id, prev.id));

        // Targeted nudge — flag ONLY holders of the old version.
        await tx
          .update(studentBookDownloads)
          .set({ needsSync: true, updatedAt: new Date() })
          .where(
            and(
              eq(studentBookDownloads.bookFileId, prev.id),
              sql`${studentBookDownloads.downloadedVersion} < ${version}`,
            ),
          );
      }

      const [file] = await tx
        .insert(bookFiles)
        .values({
          tenantId: ctx.tenantId!,
          bookId,
          partLabel: dto.partLabel,
          partSequence,
          filePath: dto.filePath,
          mimeType: dto.mimeType ?? 'application/pdf',
          byteSize: dto.byteSize,
          pageCount: dto.pageCount,
          version,
          contentHash: dto.contentHash,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: bookFiles.id,
          version: bookFiles.version,
          contentHash: bookFiles.contentHash,
          byteSize: bookFiles.byteSize,
          partSequence: bookFiles.partSequence,
        });

      return {
        ...file,
        warnLargeFile: dto.byteSize > LARGE_FILE_WARN_BYTES,
        message:
          dto.byteSize > LARGE_FILE_WARN_BYTES
            ? 'File is over 10 MB. Prefer splitting into chapters so 40 students do not saturate the link.'
            : undefined,
      };
    });
  }

  async publish(bookId: string, grant: GrantedPermission) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [book] = await tx
        .select({
          id: books.id,
          source: books.source,
          copyrightAcceptedAt: books.copyrightAcceptedAt,
          externalUrl: books.externalUrl,
          subjectId: books.subjectId,
        })
        .from(books)
        .where(eq(books.id, bookId))
        .limit(1);
      if (!book) throw new ApiException(404, 'NOT_FOUND', 'Book not found');

      if (book.source === 'school_upload' && !book.copyrightAcceptedAt) {
        throw new ApiException(
          422,
          'COPYRIGHT_REQUIRED',
          'Cannot publish without copyright acceptance.',
        );
      }

      const audiences = await tx
        .select({
          id: bookAudiences.id,
          sectionId: bookAudiences.sectionId,
        })
        .from(bookAudiences)
        .where(eq(bookAudiences.bookId, bookId));
      if (audiences.length === 0) {
        throw new ApiException(
          422,
          'NO_AUDIENCE',
          'Map the book to at least one class/section before publishing. Unmapped books are visible to nobody.',
        );
      }

      // Section-scoped teachers may only publish books mapped to their sections.
      const audienceSections = audiences
        .map((a) => a.sectionId)
        .filter((id): id is string => !!id);
      if (grant.scope === 'section' || grant.scope === 'subject') {
        if (audienceSections.length === 0) {
          throw new ApiException(
            403,
            'SCOPE_VIOLATION',
            'This book is not mapped to a section you can publish for.',
          );
        }
        for (const sectionId of audienceSections) {
          assertInScope(grant, { sectionId, subjectId: book.subjectId });
        }
      }

      if (book.source === 'school_upload') {
        const files = await tx
          .select({ id: bookFiles.id })
          .from(bookFiles)
          .where(
            and(
              eq(bookFiles.bookId, bookId),
              eq(bookFiles.isActive, true),
              isNull(bookFiles.supersededAt),
            ),
          )
          .limit(1);
        if (files.length === 0) {
          throw new ApiException(422, 'NO_FILES', 'Upload at least one file before publishing.');
        }
      }

      const [updated] = await tx
        .update(books)
        .set({
          status: 'published',
          publishedAt: new Date(),
          updatedAt: new Date(),
          updatedBy: ctx.userId,
        })
        .where(eq(books.id, bookId))
        .returning({
          id: books.id,
          status: books.status,
          publishedAt: books.publishedAt,
        });
      return updated;
    });
  }

  /**
   * 302 target — signed 15-minute URL. Caddy (not Node) serves the bytes.
   */
  async downloadRedirect(
    fileId: string,
    grant: GrantedPermission,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    return this.db.run(async (tx) => {
      const [file] = await tx
        .select({
          id: bookFiles.id,
          bookId: bookFiles.bookId,
          filePath: bookFiles.filePath,
          contentHash: bookFiles.contentHash,
          version: bookFiles.version,
          isActive: bookFiles.isActive,
        })
        .from(bookFiles)
        .where(eq(bookFiles.id, fileId))
        .limit(1);

      if (!file || !file.isActive) {
        throw new ApiException(404, 'NOT_FOUND', 'Book file not found');
      }

      const [book] = await tx
        .select({ subjectId: books.subjectId })
        .from(books)
        .where(eq(books.id, file.bookId))
        .limit(1);

      await this.assertBookInAudienceScope(tx, file.bookId, book?.subjectId ?? null, grant);

      const url = this.signFileUrl(file.filePath);
      return { url, expiresInSeconds: SIGNED_URL_TTL_SEC, contentHash: file.contentHash, version: file.version };
    });
  }

  async recordDownloaded(fileId: string, dto: RecordDownloadedDto, grant: GrantedPermission) {
    assertInScope(grant, { studentId: dto.studentId });
    const ctx = RequestContextStore.get();

    return this.db.run(async (tx) => {
      const [file] = await tx
        .select({
          id: bookFiles.id,
          version: bookFiles.version,
          contentHash: bookFiles.contentHash,
          bookId: bookFiles.bookId,
        })
        .from(bookFiles)
        .where(eq(bookFiles.id, fileId))
        .limit(1);
      if (!file) throw new ApiException(404, 'NOT_FOUND', 'Book file not found');

      const deviceId = dto.deviceId ?? 'default';
      const needsSync = dto.downloadedVersion < file.version;

      const [row] = await tx
        .insert(studentBookDownloads)
        .values({
          tenantId: ctx.tenantId!,
          studentId: dto.studentId,
          bookFileId: fileId,
          downloadedVersion: dto.downloadedVersion,
          downloadedHash: dto.downloadedHash ?? file.contentHash,
          downloadedAt: new Date(),
          deviceId,
          lastPage: dto.lastPage ?? 1,
          lastOpenedAt: new Date(),
          needsSync,
        })
        .onConflictDoUpdate({
          target: [
            studentBookDownloads.studentId,
            studentBookDownloads.bookFileId,
            studentBookDownloads.deviceId,
          ],
          set: {
            downloadedVersion: dto.downloadedVersion,
            downloadedHash: dto.downloadedHash ?? file.contentHash,
            downloadedAt: new Date(),
            lastPage: dto.lastPage ?? 1,
            lastOpenedAt: new Date(),
            needsSync,
            deletedFromDeviceAt: null,
            updatedAt: new Date(),
          },
        })
        .returning({
          id: studentBookDownloads.id,
          downloadedVersion: studentBookDownloads.downloadedVersion,
          needsSync: studentBookDownloads.needsSync,
        });

      await tx
        .update(books)
        .set({
          totalDownloads: sql`${books.totalDownloads} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(books.id, file.bookId));

      return row;
    });
  }

  async syncStatus(studentId: string, grant: GrantedPermission, deviceId?: string) {
    assertInScope(grant, { studentId });
    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          bookFileId: studentBookDownloads.bookFileId,
          downloadedVersion: studentBookDownloads.downloadedVersion,
          needsSync: studentBookDownloads.needsSync,
          serverVersion: bookFiles.version,
          contentHash: bookFiles.contentHash,
          partLabel: bookFiles.partLabel,
          bookId: bookFiles.bookId,
          title: books.title,
        })
        .from(studentBookDownloads)
        .innerJoin(bookFiles, eq(bookFiles.id, studentBookDownloads.bookFileId))
        .innerJoin(books, eq(books.id, bookFiles.bookId))
        .where(
          and(
            eq(studentBookDownloads.studentId, studentId),
            eq(studentBookDownloads.needsSync, true),
            isNull(studentBookDownloads.deletedFromDeviceAt),
            deviceId ? eq(studentBookDownloads.deviceId, deviceId) : undefined,
          ),
        )
        .limit(100);

      return {
        studentId,
        staleCount: rows.length,
        stale: rows.map((r) => ({
          bookId: r.bookId,
          bookFileId: r.bookFileId,
          title: r.title,
          partLabel: r.partLabel,
          downloadedVersion: r.downloadedVersion,
          serverVersion: r.serverVersion,
          contentHash: r.contentHash,
        })),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Physical library (B15)
  // ---------------------------------------------------------------------------

  async listLibraryItems(q?: string) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          id: libraryItems.id,
          accessionNo: libraryItems.accessionNo,
          title: libraryItems.title,
          author: libraryItems.author,
          barcode: libraryItems.barcode,
          callNumber: libraryItems.callNumber,
          category: libraryItems.category,
          totalCopies: libraryItems.totalCopies,
          availableCopies: libraryItems.availableCopies,
          shelfLocation: libraryItems.shelfLocation,
        })
        .from(libraryItems)
        .where(
          and(
            eq(libraryItems.branchId, ctx.branchId!),
            eq(libraryItems.isActive, true),
            q
              ? sql`(${libraryItems.title} ilike ${'%' + q + '%'} or ${libraryItems.accessionNo} ilike ${'%' + q + '%'})`
              : undefined,
          ),
        )
        .orderBy(asc(libraryItems.title))
        .limit(100);
      return { data: rows };
    });
  }

  async createLibraryItem(dto: CreateLibraryItemDto) {
    const ctx = RequestContextStore.get();
    const copies = dto.totalCopies ?? 1;
    return this.db.run(async (tx) => {
      const [row] = await tx
        .insert(libraryItems)
        .values({
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          accessionNo: dto.accessionNo,
          barcode: dto.barcode,
          title: dto.title,
          author: dto.author,
          publisher: dto.publisher,
          isbn: dto.isbn,
          callNumber: dto.callNumber,
          category: dto.category,
          digitalBookId: dto.digitalBookId,
          totalCopies: copies,
          availableCopies: copies,
          shelfLocation: dto.shelfLocation,
          pricePaise: dto.pricePaise,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: libraryItems.id,
          accessionNo: libraryItems.accessionNo,
          title: libraryItems.title,
        });
      return row;
    });
  }

  async issueLoan(dto: IssueLoanDto) {
    const ctx = RequestContextStore.get();
    if (!dto.studentId && !dto.staffId) {
      throw new ApiException(400, 'VALIDATION_ERROR', 'Provide studentId or staffId.');
    }
    return this.db.run(async (tx) => {
      const [item] = await tx
        .select({
          id: libraryItems.id,
          availableCopies: libraryItems.availableCopies,
        })
        .from(libraryItems)
        .where(eq(libraryItems.id, dto.itemId))
        .limit(1);
      if (!item) throw new ApiException(404, 'NOT_FOUND', 'Library item not found');
      if (item.availableCopies <= 0) {
        throw new ApiException(422, 'NO_COPIES', 'No available copies to issue.');
      }

      const [loan] = await tx
        .insert(libraryLoans)
        .values({
          tenantId: ctx.tenantId!,
          itemId: dto.itemId,
          studentId: dto.studentId,
          staffId: dto.staffId,
          issuedOn: dto.issuedOn,
          dueOn: dto.dueOn,
          issuedByUserId: ctx.userId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: libraryLoans.id,
          dueOn: libraryLoans.dueOn,
          issuedOn: libraryLoans.issuedOn,
        });

      await tx
        .update(libraryItems)
        .set({
          availableCopies: sql`${libraryItems.availableCopies} - 1`,
          updatedAt: new Date(),
        })
        .where(eq(libraryItems.id, dto.itemId));

      return loan;
    });
  }

  async returnLoan(loanId: string, dto: ReturnLoanDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [loan] = await tx
        .select({
          id: libraryLoans.id,
          itemId: libraryLoans.itemId,
          returnedOn: libraryLoans.returnedOn,
        })
        .from(libraryLoans)
        .where(eq(libraryLoans.id, loanId))
        .limit(1);
      if (!loan) throw new ApiException(404, 'NOT_FOUND', 'Loan not found');
      if (loan.returnedOn) {
        throw new ApiException(409, 'ALREADY_RETURNED', 'This loan is already returned.');
      }

      const returnedOn = dto.returnedOn ?? new Date().toISOString().slice(0, 10);
      const [updated] = await tx
        .update(libraryLoans)
        .set({
          returnedOn,
          conditionOnReturn: dto.conditionOnReturn ?? 'good',
          finePaise: dto.finePaise ?? 0,
          updatedAt: new Date(),
          updatedBy: ctx.userId,
        })
        .where(eq(libraryLoans.id, loanId))
        .returning({
          id: libraryLoans.id,
          returnedOn: libraryLoans.returnedOn,
          finePaise: libraryLoans.finePaise,
        });

      await tx
        .update(libraryItems)
        .set({
          availableCopies: sql`${libraryItems.availableCopies} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(libraryItems.id, loan.itemId));

      return updated;
    });
  }

  // ---------------------------------------------------------------------------

  /**
   * Branch/tenant managers see the whole catalogue. Narrow scopes must hit a
   * book_audiences row for their section/student — otherwise a student can
   * enumerate another class's files by guessing the book id.
   */
  private async assertBookInAudienceScope(
    tx: Parameters<Parameters<TenantDbService['run']>[0]>[0],
    bookId: string,
    subjectId: string | null,
    grant: GrantedPermission,
  ): Promise<void> {
    if (grant.scope === 'tenant' || grant.scope === 'branch') return;

    const audiences = await tx
      .select({
        sectionId: bookAudiences.sectionId,
        classId: bookAudiences.classId,
      })
      .from(bookAudiences)
      .where(eq(bookAudiences.bookId, bookId));

    if (audiences.length === 0) {
      throw new ApiException(
        403,
        'SCOPE_VIOLATION',
        'This book is not mapped to an audience you can access.',
      );
    }

    if (grant.scope === 'section' || grant.scope === 'subject') {
      // Readable if ANY audience section is in scope (unlike publish, which
      // requires every audience section so teachers cannot publish for others).
      const sectionIds = audiences
        .map((a) => a.sectionId)
        .filter((id): id is string => !!id);
      const sectionOk = (grant.sectionIds ?? []).some((id) => sectionIds.includes(id));
      if (!sectionOk) {
        throw new ApiException(
          403,
          'SCOPE_VIOLATION',
          'This book is not mapped to a section you can access.',
        );
      }
      if (
        grant.scope === 'subject' &&
        (!subjectId || !(grant.subjectIds ?? []).includes(subjectId))
      ) {
        throw new ApiException(
          403,
          'SCOPE_VIOLATION',
          'This book is outside your assigned subject.',
        );
      }
      return;
    }

    if (grant.scope === 'self') {
      const studentIds = grant.studentIds ?? [];
      if (studentIds.length === 0) {
        throw new ApiException(
          403,
          'SCOPE_VIOLATION',
          'This book is not available for your children.',
        );
      }
      const enrollments = await tx
        .select({
          classId: studentEnrollments.classId,
          sectionId: studentEnrollments.sectionId,
        })
        .from(studentEnrollments)
        .where(
          and(
            inArray(studentEnrollments.studentId, studentIds),
            inArray(studentEnrollments.status, ['active', 'admitted', 'on_leave']),
          ),
        );

      const ok = audiences.some((a) =>
        enrollments.some(
          (e) =>
            (a.sectionId && a.sectionId === e.sectionId) ||
            (a.classId && !a.sectionId && a.classId === e.classId) ||
            (a.classId && a.classId === e.classId && a.sectionId === e.sectionId),
        ),
      );
      if (!ok) {
        throw new ApiException(
          403,
          'SCOPE_VIOLATION',
          'This book is not available for your children.',
        );
      }
      return;
    }

    throw new ApiException(403, 'SCOPE_VIOLATION', 'Outside your assigned scope.');
  }

  private signFileUrl(filePath: string): string {
    const base = this.config.getOrThrow<string>('FILES_BASE_URL').replace(/\/$/, '');
    const expires = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SEC;
    const secret =
      this.config.get<string>('FILES_SIGNING_SECRET') ??
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    const payload = `${filePath}:${expires}`;
    const sig = createHmac('sha256', secret).update(payload).digest('hex');
    const encodedPath = filePath
      .split('/')
      .map((p) => encodeURIComponent(p))
      .join('/');
    return `${base}/${encodedPath}?expires=${expires}&sig=${sig}`;
  }

  /** Used by tests / future Caddy auth middleware. */
  verifySignedUrl(filePath: string, expires: number, sig: string): boolean {
    if (expires < Math.floor(Date.now() / 1000)) return false;
    const secret =
      this.config.get<string>('FILES_SIGNING_SECRET') ??
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    const expected = createHmac('sha256', secret)
      .update(`${filePath}:${expires}`)
      .digest('hex');
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    } catch {
      return false;
    }
  }
}
