import { describe, expect, it } from 'vitest';

import { CBSE_CLASSES, classesForBoard } from '../academic/board-templates';

describe('CBSE board template', () => {
  it('creates classes Nursery through XII with correct level ordering', () => {
    const classes = classesForBoard('cbse', -3, 12);
    expect(classes).toHaveLength(CBSE_CLASSES.length);
    expect(classes[0]).toMatchObject({ name: 'Nursery', level: -3 });
    expect(classes.at(-1)).toMatchObject({ name: 'XII', level: 12 });
    for (let i = 1; i < classes.length; i++) {
      expect(classes[i].level).toBeGreaterThan(classes[i - 1].level);
    }
  });
});
