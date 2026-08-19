import { IsEmail } from 'class-validator';

/**
 * Email is collected here, not as a required field on the student record.
 * Schools frequently do not have a student's own address on file; the admin
 * enters (or confirms) it at invite time. It becomes `users.email`.
 */
export class InviteStudentDto {
  @IsEmail()
  email!: string;
}
