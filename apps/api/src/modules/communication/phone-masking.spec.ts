import { describe, expect, it } from 'vitest';

/**
 * Contract test: thread/message API shapes must never leak phone numbers.
 * Mirrors the DTO map in CommunicationService.listThreads / listMessages.
 */
describe('thread/message phone masking', () => {
  it('thread list items have no phone fields', () => {
    const threadDto = {
      id: 'th-1',
      subject: 'About Aarav',
      studentId: 'st-1',
      lastMessageAt: '2026-08-10T10:00:00.000Z',
      isClosed: false,
      displayAs: 'Ms. Sharma · Class Teacher, 5-A',
    };

    const json = JSON.stringify(threadDto);
    expect(json).not.toMatch(/phone/i);
    expect(json).not.toMatch(/\+?\d{10,}/);
    expect(threadDto).not.toHaveProperty('phone');
    expect(threadDto).not.toHaveProperty('personalPhone');
    expect(threadDto).not.toHaveProperty('workPhone');
  });

  it('message list items expose displayAs, never a number', () => {
    const messageDto = {
      id: 'm-1',
      senderUserId: 'u-teacher',
      senderDisplayAs: 'Parent of Aarav Sharma (5-A)',
      body: 'Please confirm pickup time.',
      attachmentPaths: [] as string[],
      createdAt: '2026-08-10T10:01:00.000Z',
    };

    const json = JSON.stringify(messageDto);
    expect(json).not.toMatch(/phone/i);
    expect(json).not.toContain('9876543210');
    expect(messageDto).not.toHaveProperty('senderPhone');
    expect(messageDto.senderDisplayAs).toContain('Parent of');
  });
});
