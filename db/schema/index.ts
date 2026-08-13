/**
 * School All Ways — database schema barrel.
 *
 * Numbering matches the module catalogue in docs/01 and docs/02.
 * Import order matters: files reference tables from lower-numbered files only.
 * If you need a back-reference (e.g. sections -> staff), declare the column as
 * a plain uuid and add the FK in db/sql/003_deferred_fks.sql. This keeps the
 * TypeScript import graph acyclic.
 */

export * from './_common';
export * from './01-tenancy';
export * from './02-identity';
export * from './03-rbac';
export * from './04-academic';
export * from './05-students';
export * from './06-staff';
export * from './07-attendance';
export * from './08-communication';
export * from './09-homework';
export * from './10-fees';
export * from './11-exams';
export * from './12-library';
export * from './13-safety-transport';
export * from './14-privacy-audit';
export * from './15-platform';
export * from './16-import';
export * from './17-onboarding';
export * from './18-billing';
